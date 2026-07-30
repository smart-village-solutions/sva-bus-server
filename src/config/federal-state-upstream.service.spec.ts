import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FederalStateUpstreamService } from './federal-state-upstream.service';

const fixtureKey = 'fixture-upstream-key';
const configuration = JSON.stringify({
  BB: { baseUrl: 'https://bb.example.test', apiKey: fixtureKey },
});

describe('FederalStateUpstreamService', () => {
  const createService = () =>
    new FederalStateUpstreamService(
      new ConfigService({ HTTP_CLIENT_STATE_UPSTREAMS: configuration }),
    );

  it.each(['BB', 'bb', ' Bb '])('resolves configured selector %s', (selector) => {
    expect(createService().resolve(selector)).toEqual({
      federalState: 'BB',
      baseUrl: 'https://bb.example.test',
      apiKey: fixtureKey,
    });
  });

  it.each([undefined, '', ' ', ['BB'], 'BB,RP', 'XX', 'RP'])(
    'rejects selector %p with HTTP 400 without exposing the key',
    (selector) => {
      let thrown: unknown;
      try {
        createService().resolve(selector);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as BadRequestException).getStatus()).toBe(400);
      expect(String((thrown as Error).message)).not.toContain(fixtureKey);
    },
  );
});

