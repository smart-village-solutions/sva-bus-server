import { Test, TestingModule } from '@nestjs/testing';

import { HttpClientService } from '../http-client/http-client.service';
import { ProxyService } from './proxy.service';

describe('ProxyService', () => {
  let service: ProxyService;
  let httpClientService: { requestRaw: jest.Mock };

  beforeEach(async () => {
    httpClientService = {
      requestRaw: jest.fn().mockResolvedValue({ status: 200, body: { ok: true } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        {
          provide: HttpClientService,
          useValue: httpClientService,
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it('forwards requests to the HTTP client', async () => {
    await expect(
      service.forward('GET', '/example', undefined, { query: { foo: 'bar' } }),
    ).resolves.toEqual({ status: 200, body: { ok: true } });

    expect(httpClientService.requestRaw).toHaveBeenCalledWith('GET', '/example', undefined, {
      query: { foo: 'bar' },
    });
  });
});
