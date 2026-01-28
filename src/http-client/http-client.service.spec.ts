import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { fetch } from 'undici';

import { HttpClientService } from './http-client.service';

jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

const mockedFetch = fetch as jest.Mock;

describe('HttpClientService', () => {
  let service: HttpClientService;

  beforeEach(async () => {
    mockedFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpClientService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              switch (key) {
                case 'HTTP_CLIENT_BASE_URL':
                  return 'https://example.com/';
                case 'HTTP_CLIENT_TIMEOUT':
                  return 5000;
                case 'HTTP_CLIENT_RETRIES':
                  return 1;
                default:
                  return undefined;
              }
            },
          },
        },
      ],
    }).compile();

    service = module.get<HttpClientService>(HttpClientService);
  });

  it('retries failed requests', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      text: async () => JSON.stringify({ ok: true }),
    });

    await expect(service.get('/test')).resolves.toEqual({ ok: true });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('times out when request exceeds timeout', async () => {
    jest.useFakeTimers();
    mockedFetch.mockImplementation(() => new Promise(() => undefined));

    const promise = service.get('/timeout', { timeoutMs: 10, retries: 0 });
    const expectation = expect(promise).rejects.toThrow('Request timed out');

    await jest.advanceTimersByTimeAsync(20);
    await expectation;
    jest.useRealTimers();
  });
});
