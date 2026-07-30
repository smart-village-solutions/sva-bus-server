import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  FEDERAL_STATE_CODES,
  type FederalStateCode,
  parseStateUpstreams,
  type StateUpstream,
  type StateUpstreams,
} from './state-upstreams';

export type ResolvedFederalStateUpstream = Readonly<
  StateUpstream & { federalState: FederalStateCode }
>;

const knownCodes = new Set<string>(FEDERAL_STATE_CODES);

@Injectable()
export class FederalStateUpstreamService {
  private readonly upstreams: StateUpstreams;

  constructor(configService: ConfigService) {
    this.upstreams = parseStateUpstreams(configService.get('HTTP_CLIENT_STATE_UPSTREAMS'));
  }

  resolve(headerValue: unknown): ResolvedFederalStateUpstream {
    if (
      typeof headerValue !== 'string' ||
      headerValue.trim().length === 0 ||
      headerValue.includes(',')
    ) {
      throw new BadRequestException('A single x-federal-state header is required');
    }

    const normalized = headerValue.trim().toUpperCase();
    if (!knownCodes.has(normalized)) {
      throw new BadRequestException('Unknown federal state');
    }

    const federalState = normalized as FederalStateCode;
    const upstream = this.upstreams[federalState];
    if (!upstream) {
      throw new BadRequestException('Federal state is not configured');
    }

    return Object.freeze({ federalState, baseUrl: upstream.baseUrl, apiKey: upstream.apiKey });
  }
}
