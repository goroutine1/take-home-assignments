import { Request, Response, NextFunction } from 'express';
import { ApiKeyStore } from '../auth/types';

export function authMiddleware(store: ApiKeyStore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const apiKey = header.slice(7);
    const isValid = await store.validate(apiKey);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Attach the API key to the request for rate limiting downstream
    (req as Request & { apiKey: string }).apiKey = apiKey;
    next();
  };
}
