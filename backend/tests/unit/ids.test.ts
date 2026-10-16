import { describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/ids.js';

describe('newId', () => {
  it('returns UUID v7', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is time-ordered', () => {
    const ids = Array.from({ length: 100 }, newId);
    expect([...ids].sort()).toEqual(ids);
  });
});
