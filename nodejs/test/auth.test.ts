import { describe, it, expect } from 'vitest';
import { InMemoryApiKeyStore } from '../src/auth/memory-store';

describe('InMemoryApiKeyStore', () => {
  const store = new InMemoryApiKeyStore(['key-1', 'key-2']);

  it('validates a known key', async () => {
    expect(await store.validate('key-1')).toBe(true);
    expect(await store.validate('key-2')).toBe(true);
  });

  it('rejects an unknown key', async () => {
    expect(await store.validate('unknown')).toBe(false);
  });

  it('rejects empty string', async () => {
    expect(await store.validate('')).toBe(false);
  });
});
