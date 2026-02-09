import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiKeysService } from './api-keys.service';
import { ApiConsumer } from './types';

type RequestWithApiConsumer = FastifyRequest & {
  apiConsumer?: ApiConsumer;
};

@Injectable()
export class ProxyAccessGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiConsumer>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const apiKeyHeader = request.headers['x-api-key'];
    const rawApiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    try {
      const consumer = await this.apiKeysService.validateClientApiKey(rawApiKey ?? null);
      if (!consumer) {
        const preAuthLimit = await this.apiKeysService.consumePreAuthRateLimit(
          request.ip,
          rawApiKey ?? null,
        );
        this.applyRateLimitHeaders(
          reply,
          preAuthLimit.limit,
          preAuthLimit.remaining,
          preAuthLimit.resetAt,
        );

        if (!preAuthLimit.allowed) {
          reply.header('retry-after', String(preAuthLimit.retryAfter));
          throw new HttpException('API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }

        throw new UnauthorizedException('Invalid API key');
      }

      request.apiConsumer = consumer;

      const keyLimit = await this.apiKeysService.consumeRateLimit(consumer.keyId);
      this.applyRateLimitHeaders(reply, keyLimit.limit, keyLimit.remaining, keyLimit.resetAt);

      if (!keyLimit.allowed) {
        reply.header('retry-after', String(keyLimit.retryAfter));
        throw new HttpException('API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new ServiceUnavailableException('API access validation failed');
    }
  }

  private applyRateLimitHeaders(
    reply: FastifyReply,
    limit: number,
    remaining: number,
    resetAt: number,
  ): void {
    reply.header('x-ratelimit-limit', String(limit));
    reply.header('x-ratelimit-remaining', String(remaining));
    reply.header('x-ratelimit-reset', String(resetAt));
  }
}
