import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { v2 as cloudinary, type UploadApiOptions } from 'cloudinary';

export interface StorageService {
  putObject(key: string, data: string | Buffer, contentType?: string): Promise<string>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  /**
   * Publicly served images (avatars). Only backends with a CDN implement these; callers
   * check for them and refuse the upload otherwise.
   */
  putPublicImage?(key: string, data: Buffer): Promise<string>;
  deletePublicImage?(key: string): Promise<void>;
  /**
   * Publicly served files of any type (staff media library: images, video, PDF). Returns the
   * public URL. `publicFiles` is true only when the backend can serve them.
   */
  readonly publicFiles?: boolean;
  putPublicFile?(key: string, data: Buffer, contentType: string): Promise<string>;
  deletePublicFile?(key: string, contentType: string): Promise<void>;
}

export class MemoryStorageService implements StorageService {
  private readonly store = new Map<string, Buffer>();

  putObject(key: string, data: string | Buffer): Promise<string> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    this.store.set(key, buffer);
    return Promise.resolve(key);
  }

  getObject(key: string): Promise<Buffer | null> {
    const buffer = this.store.get(key);
    return Promise.resolve(buffer ? Buffer.from(buffer) : null);
  }

  deleteObject(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  putPublicImage(key: string, data: Buffer): Promise<string> {
    this.store.set(`public/${key}`, Buffer.from(data));
    return Promise.resolve(`https://images.test/${key}`);
  }

  deletePublicImage(key: string): Promise<void> {
    this.store.delete(`public/${key}`);
    return Promise.resolve();
  }

  readonly publicFiles = true;

  putPublicFile(key: string, data: Buffer, _contentType?: string): Promise<string> {
    this.store.set(`public/${key}`, Buffer.from(data));
    return Promise.resolve(`https://media.test/${key}`);
  }

  deletePublicFile(key: string): Promise<void> {
    this.store.delete(`public/${key}`);
    return Promise.resolve();
  }

  hasPublicFile(key: string): boolean {
    return this.store.has(`public/${key}`);
  }

  /** Public file keys under a prefix (for tests). */
  listPublicKeys(prefix: string): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith(`public/${prefix}`));
  }

  clear(): void {
    this.store.clear();
  }
}

export class DiskStorageService implements StorageService {
  constructor(private readonly baseDir: string) {}

  private resolvePath(key: string): string {
    const safeKey = key.replace(/\.\./g, '');
    return path.join(this.baseDir, safeKey);
  }

  async putObject(key: string, data: string | Buffer): Promise<string> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    await fs.writeFile(filePath, buffer);
    return key;
  }

  async getObject(key: string): Promise<Buffer | null> {
    const filePath = this.resolvePath(key);
    try {
      return await fs.readFile(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL of the bucket (custom domain or r2.dev). Needed for the media library. */
  publicBaseUrl?: string;
}

/** Cloudflare R2 through its S3-compatible API (spec section 2). */
export class R2StorageService implements StorageService {
  private readonly client: S3Client;

  readonly publicFiles: boolean;

  constructor(
    private readonly bucket: string,
    client: S3Client,
    private readonly publicBaseUrl?: string,
  ) {
    this.client = client;
    this.publicFiles = Boolean(publicBaseUrl);
  }

  async putPublicFile(key: string, data: Buffer, contentType: string): Promise<string> {
    if (!this.publicBaseUrl) throw new Error('R2_PUBLIC_URL is not set.');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  }

  async deletePublicFile(key: string): Promise<void> {
    await this.deleteObject(key);
  }

  static fromOptions(options: R2Options): R2StorageService {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    return new R2StorageService(options.bucket, client, options.publicBaseUrl);
  }

  async putObject(key: string, data: string | Buffer, contentType?: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: typeof data === 'string' ? Buffer.from(data, 'utf-8') : data,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (err: unknown) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export interface CloudinaryOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Prefix for every public ID, e.g. "production". Keeps environments apart in one account. */
  folder?: string;
}

/** The slice of the Cloudinary SDK the storage service uses, so tests can fake it. */
export interface CloudinaryClient {
  upload(data: Buffer, options: UploadApiOptions): Promise<{ secure_url: string }>;
  destroy(publicId: string, options: { resource_type: string; type: string }): Promise<unknown>;
  signedUrl(publicId: string, options: { resource_type: string; type: string }): string;
}

/** Private files are raw assets that only the backend can read, through signed URLs. */
const PRIVATE = { resource_type: 'raw', type: 'authenticated' } as const;
const PUBLIC_IMAGE = { resource_type: 'image', type: 'upload' } as const;

/**
 * Cloudinary. Reports, attachments, exports and logos are stored as authenticated raw assets
 * and streamed by the API after its own access checks, exactly as with the other backends.
 * Avatars are public images served straight from Cloudinary's CDN.
 */
export class CloudinaryStorageService implements StorageService {
  private readonly prefix: string;

  constructor(
    private readonly client: CloudinaryClient,
    folder = '',
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    const trimmed = folder.replace(/^\/+|\/+$/g, '');
    this.prefix = trimmed ? `${trimmed}/` : '';
  }

  static fromOptions(options: CloudinaryOptions): CloudinaryStorageService {
    const credentials = {
      cloud_name: options.cloudName,
      api_key: options.apiKey,
      api_secret: options.apiSecret,
    };
    const client: CloudinaryClient = {
      upload: (data, uploadOptions) =>
        new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ ...uploadOptions, ...credentials }, (err, result) => {
              if (err || !result) {
                reject(new Error(`Cloudinary upload failed: ${err?.message ?? 'no result'}`));
              } else resolve(result);
            })
            .end(data);
        }),
      destroy: (publicId, destroyOptions) =>
        cloudinary.uploader.destroy(publicId, {
          ...destroyOptions,
          ...credentials,
          invalidate: true,
        }) as Promise<unknown>,
      // A signed API download rather than a signed CDN URL: the CDN refuses PDFs and ZIPs on
      // accounts with the default security settings, and this link expires after an hour.
      signedUrl: (publicId, urlOptions) =>
        cloudinary.utils.private_download_url(publicId, '', { ...urlOptions, ...credentials }),
    };
    return new CloudinaryStorageService(client, options.folder);
  }

  private publicId(key: string): string {
    return this.prefix + key.replace(/\.\./g, '').replace(/^\/+/, '');
  }

  async putObject(key: string, data: string | Buffer): Promise<string> {
    await this.client.upload(typeof data === 'string' ? Buffer.from(data, 'utf-8') : data, {
      ...PRIVATE,
      public_id: this.publicId(key),
      overwrite: true,
      invalidate: true,
    });
    return key;
  }

  async getObject(key: string): Promise<Buffer | null> {
    const res = await this.fetchFn(this.client.signedUrl(this.publicId(key), PRIVATE));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudinary returned ${res.status} for ${key}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.destroy(this.publicId(key), PRIVATE);
  }

  async putPublicImage(key: string, data: Buffer): Promise<string> {
    const result = await this.client.upload(data, {
      ...PUBLIC_IMAGE,
      public_id: this.publicId(key),
      overwrite: true,
      invalidate: true,
    });
    return result.secure_url;
  }

  async deletePublicImage(key: string): Promise<void> {
    await this.client.destroy(this.publicId(key), PUBLIC_IMAGE);
  }

  readonly publicFiles = true;

  private resourceType(contentType: string): 'image' | 'video' | 'raw' {
    if (contentType.startsWith('image/') && contentType !== 'image/svg+xml') return 'image';
    if (contentType.startsWith('video/')) return 'video';
    return 'raw';
  }

  async putPublicFile(key: string, data: Buffer, contentType: string): Promise<string> {
    const result = await this.client.upload(data, {
      resource_type: this.resourceType(contentType),
      type: 'upload',
      public_id: this.publicId(key),
      overwrite: true,
      invalidate: true,
    });
    return result.secure_url;
  }

  async deletePublicFile(key: string, contentType: string): Promise<void> {
    await this.client.destroy(this.publicId(key), {
      resource_type: this.resourceType(contentType),
      type: 'upload',
    });
  }
}

let defaultStorage: StorageService | undefined;

function r2OptionsFromEnv(): R2Options | undefined {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return undefined;
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicBaseUrl: process.env.R2_PUBLIC_URL,
  };
}

function cloudinaryOptionsFromEnv(): CloudinaryOptions | undefined {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER } =
    process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return undefined;
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
    folder: CLOUDINARY_FOLDER,
  };
}

export function getStorage(options?: { baseDir?: string; memory?: boolean }): StorageService {
  if (options?.memory) {
    return new MemoryStorageService();
  }
  if (!defaultStorage && !options?.baseDir) {
    const cld = cloudinaryOptionsFromEnv();
    if (cld) defaultStorage = CloudinaryStorageService.fromOptions(cld);
  }
  if (!defaultStorage && !options?.baseDir) {
    const r2 = r2OptionsFromEnv();
    if (r2) defaultStorage = R2StorageService.fromOptions(r2);
  }
  if (!defaultStorage) {
    const baseDir =
      options?.baseDir ?? process.env.STORAGE_DIR ?? path.join(process.cwd(), '.storage');
    defaultStorage = new DiskStorageService(baseDir);
  }
  return defaultStorage;
}
