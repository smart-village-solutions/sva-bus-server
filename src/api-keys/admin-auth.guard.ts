import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { hashKeyForLogging } from '../utils/hash';
import { ApiKeysService } from './api-keys.service';

type RequestWithAdminIdentity = FastifyRequest & {
  adminIdentity?: string;
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAdminIdentity>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const configuredToken = this.configService.get<string>('ADMIN_API_TOKEN') ?? '';
    if (configuredToken.length === 0) {
      throw new UnauthorizedException('Admin token is not configured');
    }

    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const token = this.extractBearer(value ?? '');

    try {
      const rateLimit = await this.apiKeysService.consumeAdminRateLimit(request.ip, token ?? null);
      if (!rateLimit.allowed) {
        reply.header('retry-after', String(rateLimit.retryAfter));
        throw new HttpException('API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error) {
      if (error instanceof HttpException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Rate limit backend unavailable');
    }

    if (!token || !this.safeEquals(token, configuredToken)) {
      throw new UnauthorizedException('Invalid admin token');
    }

    request.adminIdentity = `token:${hashKeyForLogging(token)}`;
    return true;
  }

  private extractBearer(value: string): string | null {
    const [scheme, token] = value.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      return null;
    }

    return token;
  }

  private safeEquals(candidate: string, expected: string): boolean {
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    if (left.length !== right.length) {
      return false;
    }

    return timingSafeEqual(left, right);
  }
}
