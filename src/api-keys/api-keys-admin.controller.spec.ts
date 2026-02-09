import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';

import { AdminAuthGuard } from './admin-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysAdminController } from './api-keys-admin.controller';

type RequestWithAdminIdentity = FastifyRequest & {
  adminIdentity?: string;
};

describe('ApiKeysAdminController', () => {
  let controller: ApiKeysAdminController;
  let apiKeysService: {
    createApiKey: jest.Mock;
    listApiKeys: jest.Mock;
    revokeApiKey: jest.Mock;
    activateApiKey: jest.Mock;
    deleteApiKey: jest.Mock;
  };

  const buildRequest = (): RequestWithAdminIdentity =>
    ({
      ip: '203.0.113.5',
      adminIdentity: 'token:abcd1234',
      headers: {
        'x-request-id': 'req-123',
      },
    }) as unknown as RequestWithAdminIdentity;

  beforeEach(async () => {
    apiKeysService = {
      createApiKey: jest.fn(),
      listApiKeys: jest.fn(),
      revokeApiKey: jest.fn(),
      activateApiKey: jest.fn(),
      deleteApiKey: jest.fn(),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [ApiKeysAdminController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: apiKeysService,
        },
      ],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<ApiKeysAdminController>(ApiKeysAdminController);
  });

  it('writes audit log on successful key creation without leaking raw key', async () => {
    const rawApiKey = 'sk_super_secret_raw_key';
    apiKeysService.createApiKey.mockResolvedValue({
      apiKey: rawApiKey,
      record: {
        keyId: 'key-1',
        hash: 'hash-1',
        owner: 'partner-a',
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        revoked: false,
      },
    });

    const logSpy = jest.spyOn(
      (controller as unknown as { logger: { log: jest.Mock } }).logger,
      'log',
    );

    await controller.create(buildRequest(), { owner: 'partner-a' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logPayload = logSpy.mock.calls[0]?.[0];
    expect(typeof logPayload).toBe('string');

    const parsed = JSON.parse(String(logPayload)) as Record<string, unknown>;
    expect(parsed.event).toBe('admin_api_key_audit');
    expect(parsed.action).toBe('create');
    expect(parsed.result).toBe('ok');
    expect(parsed.keyId).toBe('key-1');
    expect(parsed.owner).toBe('partner-a');
    expect(parsed.adminIdentity).toBe('token:abcd1234');
    expect(parsed.requestId).toBe('req-123');

    expect(String(logPayload)).not.toContain(rawApiKey);
    expect(String(logPayload).toLowerCase()).not.toContain('authorization');
  });

  it('writes warn audit log on revoke failure', async () => {
    apiKeysService.revokeApiKey.mockRejectedValue(new NotFoundException('API key not found'));

    const warnSpy = jest.spyOn(
      (controller as unknown as { logger: { warn: jest.Mock } }).logger,
      'warn',
    );

    await expect(controller.revoke(buildRequest(), 'missing-key')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnPayload = warnSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(String(warnPayload)) as Record<string, unknown>;

    expect(parsed.event).toBe('admin_api_key_audit');
    expect(parsed.action).toBe('revoke');
    expect(parsed.result).toBe('error');
    expect(parsed.keyId).toBe('missing-key');
    expect(parsed.reason).toBe('NotFoundException');
  });
});
