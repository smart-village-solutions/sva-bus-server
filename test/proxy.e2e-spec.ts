import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { HttpClientService } from '../src/http-client/http-client.service';

describe('Proxy endpoint (e2e)', () => {
  let app: NestFastifyApplication;
  let httpClientService: { requestRaw: jest.Mock };
  let originalBaseUrl: string | undefined;
  let originalBodyLimit: string | undefined;

  beforeAll(async () => {
    originalBaseUrl = process.env.HTTP_CLIENT_BASE_URL;
    originalBodyLimit = process.env.PROXY_BODY_LIMIT;
    process.env.HTTP_CLIENT_BASE_URL = 'https://example.com';
    delete process.env.PROXY_BODY_LIMIT;

    httpClientService = {
      requestRaw: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'HTTP_CLIENT_API_KEY') return 'test-key';
          if (key === 'HTTP_CLIENT_BASE_URL') return '';
          if (key === 'HTTP_CLIENT_TIMEOUT') return '10000';
          if (key === 'HTTP_CLIENT_RETRIES') return '2';
          return undefined;
        },
      })
      .overrideProvider(HttpClientService)
      .useValue(httpClientService)
      .compile();

    const bodyLimit = Number(process.env.PROXY_BODY_LIMIT ?? 1048576);
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    httpClientService.requestRaw.mockReset();
  });

  afterAll(async () => {
    await app.close();
    if (originalBaseUrl === undefined) {
      delete process.env.HTTP_CLIENT_BASE_URL;
    } else {
      process.env.HTTP_CLIENT_BASE_URL = originalBaseUrl;
    }
    if (originalBodyLimit === undefined) {
      delete process.env.PROXY_BODY_LIMIT;
    } else {
      process.env.PROXY_BODY_LIMIT = originalBodyLimit;
    }
  });

  it('forwards GET requests', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test?foo=bar',
      headers: {
        'x-request-id': 'abc-123',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/test?foo=bar',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ api_key: 'test-key', 'x-request-id': 'abc-123' }),
      }),
    );
  });

  it('forwards api_key header when missing on request', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/api-key',
    });

    expect(response.statusCode).toBe(200);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/api-key',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ api_key: 'test-key' }),
      }),
    );
  });

  it('forwards POST bodies and headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 201, body: { ok: true } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/post?foo=bar',
      headers: {
        authorization: 'Bearer test-token',
        'x-trace-id': 'trace-1',
      },
      payload: { name: 'test' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'POST',
      '/post?foo=bar',
      { name: 'test' },
      expect.objectContaining({
        headers: expect.objectContaining({
          api_key: 'test-key',
          authorization: 'Bearer test-token',
          'x-trace-id': 'trace-1',
        }),
      }),
    );
  });

  it('preserves client api_key header', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/override',
      headers: {
        api_key: 'client-key',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/override',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ api_key: 'client-key' }),
      }),
    );
  });

  it('filters hop-by-hop headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    await app.inject({
      method: 'GET',
      url: '/api/v1/headers',
      headers: {
        connection: 'keep-alive',
        host: 'example.com',
        'transfer-encoding': 'chunked',
        'x-forward-me': 'yes',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-forward-me': 'yes' }));
    expect(callOptions?.headers).not.toHaveProperty('connection');
    expect(callOptions?.headers).not.toHaveProperty('host');
    expect(callOptions?.headers).not.toHaveProperty('transfer-encoding');
  });

  it('filters x-forwarded headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    await app.inject({
      method: 'GET',
      url: '/api/v1/headers-forwarded',
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'x-forwarded-host': 'example.com',
        'x-forwarded-proto': 'https',
        'x-real-ip': '203.0.113.2',
        'x-request-id': 'req-2',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-request-id': 'req-2' }));
    expect(callOptions?.headers).not.toHaveProperty('x-forwarded-for');
    expect(callOptions?.headers).not.toHaveProperty('x-forwarded-host');
    expect(callOptions?.headers).not.toHaveProperty('x-forwarded-proto');
    expect(callOptions?.headers).not.toHaveProperty('x-real-ip');
  });

  it('filters non-allowlisted headers', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    await app.inject({
      method: 'GET',
      url: '/api/v1/headers-block',
      headers: {
        cookie: 'session=abc',
        'x-request-id': 'req-1',
      },
    });

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).toEqual(expect.objectContaining({ 'x-request-id': 'req-1' }));
    expect(callOptions?.headers).not.toHaveProperty('cookie');
  });

  it('returns upstream non-2xx responses', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({
      status: 404,
      body: { message: 'not found' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'not found' });
  });

  it('forwards accept-language header when provided', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/accept-language',
      headers: {
        'accept-language': 'de-DE',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/accept-language',
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ 'accept-language': 'de-DE' }),
      }),
    );
  });

  it('does not add accept-language when missing', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/accept-language-missing',
    });

    expect(response.statusCode).toBe(200);

    const callOptions = httpClientService.requestRaw.mock.calls[0]?.[3];
    expect(callOptions?.headers).not.toHaveProperty('accept-language');
  });

  it('returns empty body for 204 responses', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 204, body: null });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/empty',
    });

    expect(response.statusCode).toBe(204);
    expect(response.payload).toBe('');
  });

  it('returns 502 when upstream fails', async () => {
    httpClientService.requestRaw.mockRejectedValueOnce(new Error('boom'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/fail',
    });

    expect(response.statusCode).toBe(502);
  });

  it('forwards requests to the root path', async () => {
    httpClientService.requestRaw.mockResolvedValueOnce({ status: 200, body: { ok: true } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1',
    });

    expect(response.statusCode).toBe(200);
    expect(httpClientService.requestRaw).toHaveBeenCalledWith(
      'GET',
      '/',
      undefined,
      expect.any(Object),
    );
  });

  it('returns 404 for unsupported methods', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/unsupported',
    });

    expect(response.statusCode).toBe(404);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });

  it('returns 404 for delete requests', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/unsupported',
    });

    expect(response.statusCode).toBe(404);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });

  it('rejects payloads larger than 1mb by default', async () => {
    const payload = JSON.stringify({ data: 'a'.repeat(1048577) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/too-large',
      headers: {
        'content-type': 'application/json',
      },
      payload,
    });

    expect(response.statusCode).toBe(413);
    expect(httpClientService.requestRaw).not.toHaveBeenCalled();
  });
});
