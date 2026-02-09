export type ApiConsumer = {
  keyId: string;
  owner: string;
};

export type ApiKeyRecord = {
  keyId: string;
  hash: string;
  owner: string;
  label?: string;
  contact?: string;
  createdAt: string;
  createdBy?: string;
  revoked: boolean;
  revokedAt?: string;
  expiresAt?: string;
};

export type CreateApiKeyInput = {
  owner: string;
  label?: string;
  contact?: string;
  expiresAt?: string;
  createdBy?: string;
};

export type CreateApiKeyResult = {
  apiKey: string;
  record: ApiKeyRecord;
};

export type ApiKeyRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  resetAt: number;
};
