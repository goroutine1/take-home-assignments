import { Request, Response, NextFunction } from 'express';
import { rateLimitedCounter } from '../metrics';

// Rate limiter interface for swapping implementations.
// For multi-process deployments, implement this interface using
// Redis + Lua scripting (e.g., sliding-window counter with EVALSHA)
// or a library like rate-limiter-flexible with a Redis store.
export interface RateLimiter {
  isAllowed(key: string): boolean;
}

export class InMemorySlidingWindowLimiter implements RateLimiter {
  private readonly maxPerSecond: number;
  private readonly buckets = new Map<string, number[]>();

  constructor(maxPerSecond: number) {
    this.maxPerSecond = maxPerSecond;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.buckets.get(key) ?? [];

    // Prune timestamps outside the 1-second sliding window
    const valid = timestamps.filter((ts) => now - ts < 1000);

    if (valid.length >= this.maxPerSecond) {
      this.buckets.set(key, valid);
      return false;
    }

    valid.push(now);
    this.buckets.set(key, valid);
    return true;
  }
}

export function rateLimiterMiddleware(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = (req as Request & { apiKey: string }).apiKey;
    if (!apiKey) {
      next();
      return;
    }

    if (!limiter.isAllowed(apiKey)) {
      rateLimitedCounter.add(1);
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    next();
  };
}
