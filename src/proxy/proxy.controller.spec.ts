import { BadRequestException, CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';

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

  it('maps political-area search without state resolution or Infodienste key', async () => {
    await controller.handlePoliticalAreaSearch(
      request('/api/v1/political-area/search?searchWords=Bad&searchWords=Bel*', {
        'x-request-id': 'req-1',
      }),
      reply(),
    );

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(proxyService.forward).toHaveBeenCalledWith(
      'GET',
      '/PoliticalArea/search?searchWords=Bad&searchWords=Bel*',
      undefined,
      {
        headers: { 'x-request-id': 'req-1' },
        baseUrlOverride: 'https://gd-api.zfinder.de',
        cachePartition: 'external:gd',
      },
    );
  });

  it('maps political-area detail without a selector', async () => {
    await controller.handlePoliticalAreaById(
      '11111',
      request('/api/v1/political-area/11111'),
      reply(),
    );

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(proxyService.forward).toHaveBeenCalledWith('GET', '/PoliticalArea/11111', undefined, {
      headers: undefined,
      baseUrlOverride: 'https://gd-api.zfinder.de',
      cachePartition: 'external:gd',
    });
  });
});
