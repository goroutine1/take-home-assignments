export interface ApiKeyStore {
  validate(apiKey: string): Promise<boolean>;
}
