import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('cache-manager-redis-yet', () => ({
  redisStore: jest.fn().mockRejectedValue(new Error('Redis disabled in e2e')),
}));
const ORIGINAL_STATE_UPSTREAMS = process.env.HTTP_CLIENT_STATE_UPSTREAMS;
process.env.HTTP_CLIENT_STATE_UPSTREAMS = JSON.stringify({
  BB: { baseUrl: 'https://bb.example.test', apiKey: 'health-fixture-key' },
});
const { AppModule } = jest.requireActual<typeof import('../src/app.module')>('../src/app.module');

describe('Health endpoint (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    if (ORIGINAL_STATE_UPSTREAMS === undefined) {
      delete process.env.HTTP_CLIENT_STATE_UPSTREAMS;
    } else {
      process.env.HTTP_CLIENT_STATE_UPSTREAMS = ORIGINAL_STATE_UPSTREAMS;
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
