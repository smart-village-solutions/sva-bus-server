import { BadRequestException, CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';

import { ProxyAccessGuard } from '../api-keys/proxy-access.guard';
import { FederalStateUpstreamService } from '../config/federal-state-upstream.service';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

describe('ProxyController', () => {
  let controller: ProxyController;
  let proxyService: { forward: jest.Mock };
  let resolver: { resolve: jest.Mock };

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
      }),
    };
    resolver = {
      resolve: jest.fn((value: unknown) => {
        if (typeof value !== 'string') {
          throw new BadRequestException();
        }
        const federalState = value.toUpperCase();
        if (federalState !== 'BB' && federalState !== 'RP') {
          throw new BadRequestException();
        }
        return {
          federalState,
          baseUrl: `https://${federalState.toLowerCase()}.example.test`,
          apiKey: `${federalState.toLowerCase()}-fixture-key`,
        };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        { provide: ProxyService, useValue: proxyService },
        { provide: FederalStateUpstreamService, useValue: resolver },
      ],
    })
      .overrideGuard(ProxyAccessGuard)
      .useValue({ canActivate: () => true } as CanActivate)
      .compile();

    controller = module.get(ProxyController);
  });

  const reply = () =>
    ({ status: jest.fn().mockReturnThis(), header: jest.fn().mockReturnThis() }) as never;
  const request = (url: string, headers: Record<string, string> = {}) =>
    ({ url, headers }) as unknown as FastifyRequest;

  it.each([
    ['BB', 'BB'],
    ['rp', 'RP'],
  ])('routes selector %s to its matched origin/key', async (selector, normalized) => {
    await controller.handleGet(
      request('/api/v1/pstCategory/find', {
        'x-federal-state': selector,
        api_key: 'caller-key',
        'x-api-key': 'client-auth',
        'x-request-id': 'request-1',
      }),
      reply(),
    );

    expect(proxyService.forward).toHaveBeenCalledWith('GET', '/pstCategory/find', undefined, {
      baseUrlOverride: `https://${normalized.toLowerCase()}.example.test`,
      cachePartition: `state:${normalized}`,
      headers: {
        api_key: `${normalized.toLowerCase()}-fixture-key`,
        'x-request-id': 'request-1',
      },
    });
  });

  it('routes POST using the selected state', async () => {
    await controller.handlePost(
      request('/api/v1/pst/find', {
        'x-federal-state': 'BB',
        'content-type': 'application/json',
      }),
      { name: 'test' },
      reply(),
    );

    expect(proxyService.forward).toHaveBeenCalledWith(
      'POST',
      '/pst/find',
      { name: 'test' },
      expect.objectContaining({
        baseUrlOverride: 'https://bb.example.test',
        cachePartition: 'state:BB',
        headers: {
          'content-type': 'application/json',
          api_key: 'bb-fixture-key',
        },
      }),
    );
  });

  it('does not forward accept-encoding because undici decodes upstream responses', async () => {
    await controller.handleGet(
      request('/api/v1/pst/find', {
        'x-federal-state': 'BB',
        'accept-encoding': 'gzip, br',
      }),
      reply(),
    );

    const forwardOptions = proxyService.forward.mock.calls[0]?.[3];
    expect(forwardOptions.headers).toEqual({ api_key: 'bb-fixture-key' });
    expect(forwardOptions.headers).not.toHaveProperty('accept-encoding');
  });

  it.each([undefined, 'XX', 'BE'])(
    'rejects invalid selector %p before proxy access',
    async (selector) => {
      const headers: Record<string, string> =
        selector === undefined ? {} : { 'x-federal-state': selector };
      await expect(
        controller.handleGet(request('/api/v1/pst/find', headers), reply()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(proxyService.forward).not.toHaveBeenCalled();
    },
  );

  it('maps political-area search to GD with the selected state key', async () => {
    await controller.handlePoliticalAreaSearch(
      request('/api/v1/political-area/search?searchWords=Bad&searchWords=Bel*', {
        'x-federal-state': 'RP',
        'x-request-id': 'req-1',
      }),
      reply(),
    );

    expect(resolver.resolve).toHaveBeenCalledWith('RP');
    expect(proxyService.forward).toHaveBeenCalledWith(
      'GET',
      '/PoliticalArea/search?searchWords=Bad&searchWords=Bel*',
      undefined,
      {
        headers: { api_key: 'rp-fixture-key', 'x-request-id': 'req-1' },
        baseUrlOverride: 'https://gd-api.zfinder.de',
        cachePartition: 'state:RP',
      },
    );
  });

  it('maps political-area detail to GD with the selected state key', async () => {
    await controller.handlePoliticalAreaById(
      '11111',
      request('/api/v1/political-area/11111', { 'x-federal-state': 'BB' }),
      reply(),
    );

    expect(resolver.resolve).toHaveBeenCalledWith('BB');
    expect(proxyService.forward).toHaveBeenCalledWith('GET', '/PoliticalArea/11111', undefined, {
      headers: { api_key: 'bb-fixture-key' },
      baseUrlOverride: 'https://gd-api.zfinder.de',
      cachePartition: 'state:BB',
    });
  });

  it('rejects political-area requests without a state selector', async () => {
    await expect(
      controller.handlePoliticalAreaById('11111', request('/api/v1/political-area/11111'), reply()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(proxyService.forward).not.toHaveBeenCalled();
  });
});
