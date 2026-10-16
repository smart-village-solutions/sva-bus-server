import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
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

  it.each(['', '  ', ['actor-1', 'actor-2'], 'actor-1,actor-2', 'a'.repeat(257), 'a\tb'])(
    'rejects invalid authenticated actor context %p',
    async (actorId) => {
      const guard = new AdminAuthGuard(new ConfigService({ ADMIN_API_TOKEN: adminToken }), {
        consumeAdminRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
      } as unknown as ApiKeysService);
      const request = {
        headers: { authorization: `Bearer ${adminToken}`, 'x-admin-actor-id': actorId },
      };
      await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('accepts an actor assertion only after bearer authentication and disables caching', async () => {
    const guard = new AdminAuthGuard(new ConfigService({ ADMIN_API_TOKEN: adminToken }), {
      consumeAdminRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as ApiKeysService);
    const request: Record<string, unknown> = { headers: { 'x-admin-actor-id': 'root-user-1' } };
    const header = jest.fn();
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.adminActorId).toBeUndefined();
    expect(header).toHaveBeenCalledWith('cache-control', 'no-store');

    request.headers = {
      authorization: `Bearer ${adminToken}`,
      'x-admin-actor-id': ' root-user-1 ',
    };
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.adminActorId).toBe('root-user-1');
  });
});
