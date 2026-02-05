import { createHash } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashKeyForLogging(key: string): string {
  // Stable, short hash for log messages (avoid leaking full cache keys).
  return sha256Hex(key).substring(0, 32);
}
