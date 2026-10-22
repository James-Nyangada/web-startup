import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import {
  CloudinaryStorageService,
  R2StorageService,
  type CloudinaryClient,
} from '../../src/storage/index.js';

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

function fakeCloudinary() {
  return {
    upload: vi.fn(() => Promise.resolve({ secure_url: 'https://res.cloudinary.com/x/a.png' })),
    destroy: vi.fn(() => Promise.resolve({ result: 'ok' })),
    signedUrl: vi.fn((id: string) => `https://api.cloudinary.test/download?id=${id}`),
  } satisfies CloudinaryClient;
}

describe('CloudinaryStorageService', () => {
  it('uploads private files as authenticated raw assets under the folder', async () => {
    const client = fakeCloudinary();
    const storage = new CloudinaryStorageService(client, '/production/');

    await expect(storage.putObject('a/b.pdf', 'pdf-bytes')).resolves.toBe('a/b.pdf');

    expect(client.upload).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
      resource_type: 'raw',
      type: 'authenticated',
      public_id: 'production/a/b.pdf',
      overwrite: true,
      invalidate: true,
    });
  });

  it('reads through a signed URL and maps 404 to null', async () => {
    const client = fakeCloudinary();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('hello'))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    const storage = new CloudinaryStorageService(client, '', fetchFn as typeof fetch);

    expect((await storage.getObject('a/b.txt'))?.toString('utf-8')).toBe('hello');
    expect(client.signedUrl).toHaveBeenCalledWith('a/b.txt', {
      resource_type: 'raw',
      type: 'authenticated',
    });
    await expect(storage.getObject('missing')).resolves.toBeNull();
    await expect(storage.getObject('broken')).rejects.toThrow('500');
  });

  it('deletes private files and public images by their own resource type', async () => {
    const client = fakeCloudinary();
    const storage = new CloudinaryStorageService(client);

    await storage.deleteObject('a/b.pdf');
    await storage.deletePublicImage('avatars/u1');

    expect(client.destroy).toHaveBeenNthCalledWith(1, 'a/b.pdf', {
      resource_type: 'raw',
      type: 'authenticated',
    });
    expect(client.destroy).toHaveBeenNthCalledWith(2, 'avatars/u1', {
      resource_type: 'image',
      type: 'upload',
    });
  });

  it('returns the CDN URL for public images', async () => {
    const client = fakeCloudinary();
    const storage = new CloudinaryStorageService(client);

    await expect(storage.putPublicImage('avatars/u1', Buffer.from('png'))).resolves.toBe(
      'https://res.cloudinary.com/x/a.png',
    );
    expect(client.upload).toHaveBeenCalledWith(
      Buffer.from('png'),
      expect.objectContaining({ resource_type: 'image', type: 'upload', public_id: 'avatars/u1' }),
    );
  });

  it('keeps keys from escaping the folder', async () => {
    const client = fakeCloudinary();
    const storage = new CloudinaryStorageService(client, 'production');
    await storage.deleteObject('../../other/x.pdf');
    expect(client.destroy).toHaveBeenCalledWith('production/other/x.pdf', expect.anything());
  });
});
