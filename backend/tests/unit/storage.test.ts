import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { R2StorageService } from '../../src/storage/index.js';

function fakeClient(send: (command: unknown) => Promise<unknown>) {
  return { send: vi.fn(send) } as unknown as S3Client & { send: ReturnType<typeof vi.fn> };
}

describe('R2StorageService', () => {
  it('uploads to the configured bucket with the content type', async () => {
    const client = fakeClient(() => Promise.resolve({}));
    const storage = new R2StorageService('reports', client);

    await expect(storage.putObject('a/b.pdf', 'pdf-bytes', 'application/pdf')).resolves.toBe(
      'a/b.pdf',
    );

    const command = client.send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'reports',
      Key: 'a/b.pdf',
      ContentType: 'application/pdf',
    });
  });

  it('returns the object body as a Buffer', async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        Body: { transformToByteArray: () => Promise.resolve(new TextEncoder().encode('hello')) },
      }),
    );
    const storage = new R2StorageService('reports', client);

    const body = await storage.getObject('a/b.txt');

    expect(body?.toString('utf-8')).toBe('hello');
    expect(client.send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
  });

  it('returns null for a missing key', async () => {
    const client = fakeClient(() =>
      Promise.reject(new NoSuchKey({ message: 'missing', $metadata: {} })),
    );
    const storage = new R2StorageService('reports', client);

    await expect(storage.getObject('nope')).resolves.toBeNull();
  });
});
