import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ProxyAccessGuard } from '../api-keys/proxy-access.guard';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

describe('ProxyController', () => {
  let controller: ProxyController;
  let proxyService: { forward: jest.Mock };

  beforeEach(async () => {
    proxyService = {
      forward: jest.fn().mockResolvedValue({
        response: {
          status: 200,
          body: { ok: true },
          contentType: 'application/json',
          headers: {},
        },
        cacheStatus: 'MISS',
        cacheKeyHash: '1234567890abcdef1234567890abcdef',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: ProxyService,
          useValue: proxyService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'HTTP_CLIENT_API_KEY') {
                return 'test-key';
              }
              return undefined;
            },
          },
        },
      ],
    })
      .overrideGuard(ProxyAccessGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<ProxyController>(ProxyController);
  });

  const createReply = (): FastifyReply =>
    ({
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    }) as unknown as FastifyReply;

  it('maps political-area search to the gd-api base URL', async () => {
    const request = {
      url: '/api/v1/political-area/search?searchWords=Bad&searchWords=Bel*',
      headers: {
        'x-request-id': 'req-1',
      },
    } as unknown as FastifyRequest;
    const reply = createReply();

    await expect(controller.handlePoliticalAreaSearch(request, reply)).resolves.toEqual({
      ok: true,
    });

    expect(proxyService.forward).toHaveBeenCalledWith(
      'GET',
      '/PoliticalArea/search?searchWords=Bad&searchWords=Bel*',
      undefined,
      {
        headers: {
          api_key: 'test-key',
          'x-request-id': 'req-1',
        },
        baseUrlOverride: 'https://gd-api.zfinder.de',
      },
    );
  });

  it('maps political-area detail to the gd-api base URL', async () => {
    const request = {
      url: '/api/v1/political-area/11111',
      headers: {
        'x-request-id': 'req-2',
      },
    } as unknown as FastifyRequest;
    const reply = createReply();

    await expect(controller.handlePoliticalAreaById('11111', request, reply)).resolves.toEqual({
      ok: true,
    });

    expect(proxyService.forward).toHaveBeenCalledWith('GET', '/PoliticalArea/11111', undefined, {
      headers: {
        api_key: 'test-key',
        'x-request-id': 'req-2',
      },
      baseUrlOverride: 'https://gd-api.zfinder.de',
    });
  });
});
