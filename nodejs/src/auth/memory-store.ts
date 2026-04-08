import { ApiKeyStore } from './types';

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly keys: Set<string>;

  constructor(keys: string[]) {
    this.keys = new Set(keys);
  }

  async validate(apiKey: string): Promise<boolean> {
    return this.keys.has(apiKey);
  }
}
