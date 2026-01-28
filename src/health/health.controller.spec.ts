import { Test, TestingModule } from '@nestjs/testing';

import { CacheService } from '../cache/cache.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const cacheService = {
      checkHealth: jest.fn().mockResolvedValue({ status: 'ok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok status', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });

  it('returns cache health status', async () => {
    await expect(controller.getCacheHealth()).resolves.toEqual({
      status: 'ok',
      message: undefined,
    });
  });
});
