import type { HttpClientRawResponse } from '../http-client/http-client.service';
import { sha256Hex } from '../utils/hash';

export type ProxyCachePolicy = {
  cacheable: boolean;
  ttlSeconds?: number;
  staleTtlSeconds?: number;
};

export type ProxyCacheOptions = {
  ignoreUpstreamControl?: boolean;
};

const CACHE_CONTROL_NO_STORE = new Set(['no-store', 'private']);

export function shouldBypassProxyCache(
  headers: Record<string, string> | undefined,
  path: string,
  bypassPaths: string[],
): boolean {
  const authorization = headers?.authorization;
  // Bypass caching for authorized requests to avoid leaking user-specific data across cache entries.
  if (typeof authorization === 'string' && authorization.trim().length > 0) {
    return true;
  }

  if (bypassPaths.length === 0) {
    return false;
  }

  const normalizedPath = normalizePath(path);
  return bypassPaths.some((candidate) => {
    const normalizedCandidate = normalizePath(candidate);
    if (normalizedCandidate === '/') {
      return true;
    }
    if (normalizedPath === normalizedCandidate) {
      return true;
    }
    return normalizedPath.startsWith(`${normalizedCandidate}/`);
  });
}

export function buildProxyCacheKey(
  method: 'GET' | 'POST',
  path: string,
  headers?: Record<string, string>,
): string {
  // Normalize selected headers into the cache key to prevent variant collisions.
  const accept = normalizeHeaderValue(headers?.accept);
  const acceptLanguage = normalizeHeaderValue(headers?.['accept-language']);
  // api_key must not appear in plaintext in cache keys. It is treated case-sensitively.
  const apiKeyHash = hashCredential(headers?.api_key, method, path);
  const headerFingerprint = [accept, acceptLanguage, apiKeyHash].join('|');
  return `proxy:${method}:${path}:${headerFingerprint}`;
}

export function deriveProxyCachePolicy<T>(
  response: HttpClientRawResponse<T>,
  options?: ProxyCacheOptions,
): ProxyCachePolicy {
  if (response.status === 204 || response.status === 304) {
    return { cacheable: false };
  }

  if (response.status < 200 || response.status >= 300) {
    return { cacheable: false };
  }

  // When configured, ignore upstream cache directives and rely on local TTLs.
  if (options?.ignoreUpstreamControl) {
    return { cacheable: true };
  }

  const cacheControlHeader = response.headers['cache-control'];
  const cacheControl = parseCacheControl(cacheControlHeader);

  for (const directive of CACHE_CONTROL_NO_STORE) {
    if (cacheControl[directive]) {
      return { cacheable: false };
    }
  }

  const ttlSeconds = resolveTtlSeconds(cacheControl);
  if (ttlSeconds !== undefined && ttlSeconds <= 0) {
    return { cacheable: false };
  }

  return {
    cacheable: true,
    ttlSeconds: ttlSeconds === undefined ? undefined : ttlSeconds,
  };
}

function normalizeHeaderValue(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.trim().toLowerCase();
}

function hashCredential(value: string | undefined, method: string, path: string): string {
  if (!value) {
    return '';
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return '';
  }

  // Rationale:
  // - Cache keys must never include credentials in plaintext (security requirement).
  // - Keys still need to be stable to preserve cache hits (functional requirement).
  // - Hashing provides stability without leakage; method+path as context prevents
  //   the same api_key from producing identical fingerprints across endpoints.
  return sha256Hex(`${method}:${path}:${trimmedValue}`);
}

function normalizePath(value: string): string {
  if (!value) {
    return '/';
  }
  const path = value.split('?')[0] ?? value;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.replace(/\/+$/, '') || '/';
}

function parseCacheControl(header: string | undefined): Record<string, string | true> {
  if (!header) {
    return {};
  }

  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .reduce<Record<string, string | true>>((acc, part) => {
      const [directive, rawValue] = part.split('=');
      if (!directive) {
        return acc;
      }
      const key = directive.trim().toLowerCase();
      if (!key) {
        return acc;
      }
      if (rawValue === undefined) {
        acc[key] = true;
        return acc;
      }
      acc[key] = rawValue.trim().replace(/^"|"$/g, '');
      return acc;
    }, {});
}

function resolveTtlSeconds(cacheControl: Record<string, string | true>): number | undefined {
  const sMaxAge = parseCacheControlNumber(cacheControl['s-maxage']);
  if (sMaxAge !== undefined) {
    return sMaxAge;
  }

  const maxAge = parseCacheControlNumber(cacheControl['max-age']);
  if (maxAge !== undefined) {
    return maxAge;
  }

  return undefined;
}

function parseCacheControlNumber(value: string | true | undefined): number | undefined {
  if (value === undefined || value === true) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.floor(parsed);
}
