import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpClientService } from '../src/http-client/http-client.service';

describe('Proxy endpoint (e2e)', () => {
  let app: NestFastifyApplication;
  let httpClientService: { requestRaw: jest.Mock };

  beforeAll(async () => {
    httpClientService = {
      requestRaw: jest.fn(),
    };

    process.env.HTTP_CLIENT_API_KEY = 'test-key';

    const { AppModule } = await import('../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpClientService)
      .useValue(httpClientService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.HTTP_CLIENT_API_KEY;
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

  it('returns 502 when upstream fails', async () => {
    httpClientService.requestRaw.mockRejectedValueOnce(new Error('boom'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/fail',
    });

    expect(response.statusCode).toBe(502);
  });
});
