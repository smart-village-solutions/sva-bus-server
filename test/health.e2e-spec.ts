import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('Health endpoint (e2e)', () => {
  let app: NestFastifyApplication;
  let originalBaseUrl: string | undefined;

  beforeAll(async () => {
    originalBaseUrl = process.env.HTTP_CLIENT_BASE_URL;
    process.env.HTTP_CLIENT_BASE_URL = 'https://example.com';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    if (originalBaseUrl === undefined) {
      delete process.env.HTTP_CLIENT_BASE_URL;
    } else {
      process.env.HTTP_CLIENT_BASE_URL = originalBaseUrl;
    }
  });

  it('GET /health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
