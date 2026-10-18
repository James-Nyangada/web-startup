import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface StorageService {
  putObject(key: string, data: string | Buffer, contentType?: string): Promise<string>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
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
}

/** Cloudflare R2 through its S3-compatible API (spec section 2). */
export class R2StorageService implements StorageService {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    client: S3Client,
  ) {
    this.client = client;
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
    return new R2StorageService(options.bucket, client);
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

let defaultStorage: StorageService | undefined;

function r2OptionsFromEnv(): R2Options | undefined {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return undefined;
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

export function getStorage(options?: { baseDir?: string; memory?: boolean }): StorageService {
  if (options?.memory) {
    return new MemoryStorageService();
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
