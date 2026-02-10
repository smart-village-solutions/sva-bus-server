import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminAuthGuard } from '../api-keys/admin-auth.guard';
import { CacheAdminController } from './cache-admin.controller';
import { CacheAdminService } from './cache-admin.service';

describe('CacheAdminController', () => {
  let controller: CacheAdminController;
  let cacheAdminService: { invalidate: jest.Mock };

  beforeEach(async () => {
    cacheAdminService = {
      invalidate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CacheAdminController],
      providers: [
        {
          provide: CacheAdminService,
          useValue: cacheAdminService,
        },
      ],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({ canActivate: () => true } as CanActivate)
      .compile();

    controller = module.get<CacheAdminController>(CacheAdminController);
  });

  it('returns successful invalidation response', async () => {
    cacheAdminService.invalidate.mockResolvedValueOnce({
      scope: 'exact',
      dryRun: false,
      matched: 2,
      deleted: 2,
    });

    await expect(
      controller.invalidate(
        {
          headers: {},
          ip: '127.0.0.1',
          adminIdentity: 'token:abcd',
        } as never,
        {
          scope: 'exact',
          path: '/pst/find?areaId=10790',
        },
      ),
    ).resolves.toEqual({
      ok: true,
      scope: 'exact',
      dryRun: false,
      matched: 2,
      deleted: 2,
    });
  });

  it('rejects invalid scope values with 400', async () => {
    await expect(
      controller.invalidate(
        {
          headers: {},
          ip: '127.0.0.1',
          adminIdentity: 'token:abcd',
        } as never,
        {
          scope: 'invalid',
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(cacheAdminService.invalidate).not.toHaveBeenCalled();
  });

  it('rejects invalid header payload values with 400', async () => {
    await expect(
      controller.invalidate(
        {
          headers: {},
          ip: '127.0.0.1',
          adminIdentity: 'token:abcd',
        } as never,
        {
          scope: 'exact',
          path: '/pst/find?areaId=10790',
          headers: {
            acceptLanguage: 123,
          },
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(cacheAdminService.invalidate).not.toHaveBeenCalled();
  });
});
