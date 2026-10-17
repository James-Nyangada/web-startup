import fs from 'node:fs/promises';
import path from 'node:path';

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

let defaultStorage: StorageService | undefined;

export function getStorage(options?: { baseDir?: string; memory?: boolean }): StorageService {
  if (options?.memory) {
    return new MemoryStorageService();
  }
  if (!defaultStorage) {
    const baseDir = options?.baseDir ?? process.env.STORAGE_DIR ?? path.join(process.cwd(), '.storage');
    defaultStorage = new DiskStorageService(baseDir);
  }
  return defaultStorage;
}
