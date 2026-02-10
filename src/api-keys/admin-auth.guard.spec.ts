import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { hashKeyForLogging } from '../utils/hash';
import { AdminAuthGuard } from './admin-auth.guard';
import { ApiKeysService } from './api-keys.service';

describe('AdminAuthGuard', () => {
  const adminToken = 'super-secret-admin-token';

  const buildContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header: jest.fn() }),
      }),
    }) as unknown as ExecutionContext;

  it('sets hashed adminIdentity on successful auth', async () => {
    const configService = {
      get: (key: string) => (key === 'ADMIN_API_TOKEN' ? adminToken : undefined),
    };
    const apiKeysService = {
      consumeAdminRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        retryAfter: 1,
      }),
    };

    const guard = new AdminAuthGuard(
      configService as unknown as ConfigService,
      apiKeysService as unknown as ApiKeysService,
    );

    const request: Record<string, unknown> = {
      ip: '203.0.113.9',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.adminIdentity).toBe(`token:${hashKeyForLogging(adminToken)}`);
    expect(String(request.adminIdentity)).not.toContain(adminToken);
  });

  it('rejects invalid bearer token and does not set adminIdentity', async () => {
    const configService = {
      get: (key: string) => (key === 'ADMIN_API_TOKEN' ? adminToken : undefined),
    };
    const apiKeysService = {
      consumeAdminRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        retryAfter: 1,
      }),
    };

    const guard = new AdminAuthGuard(
      configService as unknown as ConfigService,
      apiKeysService as unknown as ApiKeysService,
    );

    const request: Record<string, unknown> = {
      ip: '203.0.113.9',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    };

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.adminIdentity).toBeUndefined();
  });
});
