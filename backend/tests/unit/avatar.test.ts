import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DiskStorageService, MemoryStorageService } from '../../src/storage/index.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const dataUrl = (buf: Buffer, type = 'image/png') =>
  `data:${type};base64,${buf.toString('base64')}`;

describe('avatar upload', () => {
  it('stores the image publicly and saves its URL on the user', async () => {
    const auth = mockAuth('user-1');
    const storage = new MemoryStorageService();
    const putPublicImage = vi.spyOn(storage, 'putPublicImage');
    const { app, repos } = buildTestApp({ auth, storage });

    await request(app)
      .post('/v1/me/avatar')
      .set('Cookie', auth.cookie)
      .send({ dataUrl: dataUrl(PNG) })
      .expect(200);

    expect(putPublicImage).toHaveBeenCalledWith('avatars/user-1', PNG);
    expect(repos.users.update).toHaveBeenCalledWith('user-1', {
      avatarUrl: 'https://images.test/avatars/user-1',
    });
  });

  it('refuses SVGs and files that are not images, whatever they claim to be', async () => {
    const auth = mockAuth('user-1');
    const { app, repos } = buildTestApp({ auth, storage: new MemoryStorageService() });

    for (const body of [
      dataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'),
      dataUrl(Buffer.from('not an image at all')),
    ]) {
      const res = await request(app)
        .post('/v1/me/avatar')
        .set('Cookie', auth.cookie)
        .send({ dataUrl: body })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_TYPE');
    }
    const res = await request(app)
      .post('/v1/me/avatar')
      .set('Cookie', auth.cookie)
      .send({ dataUrl: 'https://example.com/a.png' })
      .expect(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(repos.users.update).not.toHaveBeenCalled();
  });

  it('is unavailable when storage cannot serve public images', async () => {
    const auth = mockAuth('user-1');
    const { app } = buildTestApp({ auth, storage: new DiskStorageService('/nonexistent') });
    await request(app)
      .post('/v1/me/avatar')
      .set('Cookie', auth.cookie)
      .send({ dataUrl: dataUrl(PNG) })
      .expect(503);
  });

  it('removes the image and clears the URL', async () => {
    const auth = mockAuth('user-1');
    const storage = new MemoryStorageService();
    const deletePublicImage = vi.spyOn(storage, 'deletePublicImage');
    const { app, repos } = buildTestApp({ auth, storage });

    await request(app).delete('/v1/me/avatar').set('Cookie', auth.cookie).expect(200);

    expect(deletePublicImage).toHaveBeenCalledWith('avatars/user-1');
    expect(repos.users.update).toHaveBeenCalledWith('user-1', { avatarUrl: null });
  });

  it('requires sign-in', async () => {
    const { app } = buildTestApp({ storage: new MemoryStorageService() });
    await request(app)
      .post('/v1/me/avatar')
      .send({ dataUrl: dataUrl(PNG) })
      .expect(401);
  });
});
