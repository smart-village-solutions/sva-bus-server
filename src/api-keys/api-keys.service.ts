import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CacheService } from '../cache/cache.service';
import { hashKeyForLogging, sha256Hex } from '../utils/hash';
import {
  ApiConsumer,
  ApiKeyRateLimitResult,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreateApiKeyResult,
} from './types';

type RedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  del: (key: string) => Promise<number>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  sAdd: (key: string, member: string) => Promise<number>;
  sMembers: (key: string) => Promise<string[]>;
  sRem: (key: string, member: string) => Promise<number>;
};

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly redisPrefix: string;
  private readonly rateLimitWindowSeconds: number;
  private readonly rateLimitMaxRequests: number;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.redisPrefix = this.configService.get<string>('API_KEYS_REDIS_PREFIX') ?? 'api-keys';
    this.rateLimitWindowSeconds = this.parsePositiveInteger(
      this.configService.get<unknown>('API_KEYS_RATE_LIMIT_WINDOW_SECONDS'),
      60,
      'API_KEYS_RATE_LIMIT_WINDOW_SECONDS',
    );
    this.rateLimitMaxRequests = this.parsePositiveInteger(
      this.configService.get<unknown>('API_KEYS_RATE_LIMIT_MAX_REQUESTS'),
      120,
      'API_KEYS_RATE_LIMIT_MAX_REQUESTS',
    );
  }

  async validateClientApiKey(rawApiKey: string | null): Promise<ApiConsumer | null> {
    if (!rawApiKey || rawApiKey.trim().length === 0) {
      return null;
    }

    const redis = this.getRedisClient();
    const hash = sha256Hex(rawApiKey.trim());
    const keyId = await redis.get(this.hashLookupKey(hash));
    if (!keyId) {
      return null;
    }

    const record = await this.getRecord(keyId, redis);
    if (!record || record.revoked || this.isExpired(record.expiresAt)) {
      return null;
    }

    return { keyId: record.keyId, owner: record.owner };
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const redis = this.getRedisClient();
    const now = new Date().toISOString();
    const apiKey = this.generateApiKey();
    const keyId = randomUUID();
    const hash = sha256Hex(apiKey);

    const record: ApiKeyRecord = {
      keyId,
      hash,
      owner: input.owner,
      label: input.label,
      contact: input.contact,
      createdAt: now,
      createdBy: input.createdBy,
      revoked: false,
      expiresAt: input.expiresAt,
    };

    await redis.set(this.recordKey(keyId), JSON.stringify(record));
    await redis.set(this.hashLookupKey(hash), keyId);
    await redis.sAdd(this.indexKey(), keyId);

    return { apiKey, record };
  }

  async listApiKeys(): Promise<ApiKeyRecord[]> {
    const redis = this.getRedisClient();
    const keyIds = await redis.sMembers(this.indexKey());
    if (keyIds.length === 0) {
      return [];
    }

    const records: ApiKeyRecord[] = [];
    for (const keyId of keyIds) {
      const record = await this.getRecord(keyId, redis);
      if (record) {
        records.push(record);
        continue;
      }
      await redis.sRem(this.indexKey(), keyId);
    }

    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const redis = this.getRedisClient();
    const record = await this.getRecordOrThrow(keyId, redis);
    if (record.revoked) {
      return;
    }

    const updated: ApiKeyRecord = {
      ...record,
      revoked: true,
      revokedAt: new Date().toISOString(),
    };

    await redis.set(this.recordKey(keyId), JSON.stringify(updated));
  }

  async activateApiKey(keyId: string): Promise<void> {
    const redis = this.getRedisClient();
    const record = await this.getRecordOrThrow(keyId, redis);
    const updated: ApiKeyRecord = {
      ...record,
      revoked: false,
      revokedAt: undefined,
    };

    await redis.set(this.recordKey(keyId), JSON.stringify(updated));
  }

  async deleteApiKey(keyId: string): Promise<void> {
    const redis = this.getRedisClient();
    const record = await this.getRecordOrThrow(keyId, redis);

    await redis.del(this.recordKey(keyId));
    await redis.del(this.hashLookupKey(record.hash));
    await redis.sRem(this.indexKey(), keyId);
  }

  async consumeRateLimit(keyId: string): Promise<ApiKeyRateLimitResult> {
    return this.consumeRateLimitForIdentifier('key', keyId);
  }

  async consumePreAuthRateLimit(
    ip: string | undefined,
    rawApiKey: string | null | undefined,
  ): Promise<ApiKeyRateLimitResult> {
    const identifier = this.buildPreAuthIdentifier(ip, rawApiKey);
    return this.consumeRateLimitForIdentifier('preauth', identifier);
  }

  async consumeAdminRateLimit(
    ip: string | undefined,
    rawToken: string | null | undefined,
  ): Promise<ApiKeyRateLimitResult> {
    const identifier = this.buildAdminIdentifier(ip, rawToken);
    return this.consumeRateLimitForIdentifier('admin', identifier);
  }

  private async consumeRateLimitForIdentifier(
    scope: 'key' | 'preauth' | 'admin',
    identifier: string,
  ): Promise<ApiKeyRateLimitResult> {
    const redis = this.getRedisClient();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart =
      Math.floor(nowSeconds / this.rateLimitWindowSeconds) * this.rateLimitWindowSeconds;
    const retryAfter = Math.max(1, windowStart + this.rateLimitWindowSeconds - nowSeconds);
    const counterKey = this.rateLimitKey(scope, identifier, windowStart);
    const count = await redis.incr(counterKey);

    if (count === 1) {
      await redis.expire(counterKey, this.rateLimitWindowSeconds + 1);
    }

    const remaining = Math.max(0, this.rateLimitMaxRequests - count);
    return {
      allowed: count <= this.rateLimitMaxRequests,
      limit: this.rateLimitMaxRequests,
      remaining,
      retryAfter,
      resetAt: windowStart + this.rateLimitWindowSeconds,
    };
  }

  private getRedisClient(): RedisClient {
    const client = this.cacheService.getStoreClient<RedisClient>();
    if (!client) {
      this.logger.error('Redis client unavailable for API key validation');
      throw new ServiceUnavailableException('API key backend unavailable');
    }

    return client;
  }

  private async getRecordOrThrow(keyId: string, redis: RedisClient): Promise<ApiKeyRecord> {
    const record = await this.getRecord(keyId, redis);
    if (!record) {
      throw new NotFoundException('API key not found');
    }
    return record;
  }

  private async getRecord(keyId: string, redis: RedisClient): Promise<ApiKeyRecord | null> {
    const raw = await redis.get(this.recordKey(keyId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as ApiKeyRecord;
    } catch {
      this.logger.warn(`Invalid API key record payload for keyId hash ${hashKeyForLogging(keyId)}`);
      return null;
    }
  }

  private isExpired(expiresAt?: string): boolean {
    if (!expiresAt) {
      return false;
    }

    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) {
      return true;
    }

    return Date.now() >= parsed;
  }

  private generateApiKey(): string {
    return `sk_${randomBytes(32).toString('base64url')}`;
  }

  private recordKey(keyId: string): string {
    return `${this.redisPrefix}:key:${keyId}`;
  }

  private hashLookupKey(hash: string): string {
    return `${this.redisPrefix}:hash:${hash}`;
  }

  private indexKey(): string {
    return `${this.redisPrefix}:index`;
  }

  private rateLimitKey(
    scope: 'key' | 'preauth' | 'admin',
    identifier: string,
    windowStart: number,
  ): string {
    return `${this.redisPrefix}:ratelimit:${scope}:${identifier}:${windowStart}`;
  }

  private buildPreAuthIdentifier(
    ip: string | undefined,
    rawApiKey: string | null | undefined,
  ): string {
    const normalizedIp = ip?.trim() || 'unknown';
    const normalizedKey = rawApiKey?.trim();
    if (!normalizedKey) {
      return `${normalizedIp}:missing`;
    }

    return `${normalizedIp}:present`;
  }

  private buildAdminIdentifier(
    ip: string | undefined,
    rawToken: string | null | undefined,
  ): string {
    const normalizedIp = ip?.trim() || 'unknown';
    const normalizedToken = rawToken?.trim();
    if (!normalizedToken) {
      return `${normalizedIp}:missing`;
    }

    return `${normalizedIp}:present`;
  }

  private parsePositiveInteger(value: unknown, fallback: number, fieldName: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }

    this.logger.warn(`${fieldName} is invalid; using fallback ${fallback}`);
    return fallback;
  }
}
