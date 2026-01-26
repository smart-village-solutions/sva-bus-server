import { BadGatewayException, Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ProxyService } from './proxy.service';

@Controller('api/v1')
export class ProxyController {
  private readonly apiKey: string | null;

  constructor(
    private readonly proxyService: ProxyService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('HTTP_CLIENT_API_KEY') ?? null;
  }

  @Get('*')
  async handleGet(
    @Req() request: FastifyRequest,
    @Query() query: Record<string, string | string[] | undefined>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    return this.forwardRequest('GET', request, query, undefined, reply);
  }

  @Post('*')
  async handlePost(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Query() query: Record<string, string | string[] | undefined>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    return this.forwardRequest('POST', request, query, body, reply);
  }

  private async forwardRequest(
    method: 'GET' | 'POST',
    request: FastifyRequest,
    query: Record<string, string | string[] | undefined>,
    body: unknown,
    reply: FastifyReply,
  ): Promise<unknown> {
    const path = this.extractPath(request.url ?? '');
    const normalizedQuery = this.normalizeQuery(query);
    const headers = this.buildForwardHeaders(request);

    try {
      const response = await this.proxyService.forward(method, path, body, {
        headers,
        query: normalizedQuery,
      });
      reply.status(response.status);
      return response.body;
    } catch (error) {
      throw new BadGatewayException({
        message: 'Upstream request failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private extractPath(url: string): string {
    const path = url.split('?')[0] ?? '';
    const prefix = '/api/v1';

    if (path === prefix) {
      return '/';
    }

    if (path.startsWith(`${prefix}/`)) {
      return path.slice(prefix.length);
    }

    return path || '/';
  }

  private normalizeQuery(
    query: Record<string, string | string[] | undefined>,
  ): Record<string, string> {
    return Object.entries(query).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value === undefined) {
        return acc;
      }

      if (Array.isArray(value)) {
        acc[key] = value[0] ?? '';
        return acc;
      }

      acc[key] = value;
      return acc;
    }, {});
  }

  private buildForwardHeaders(request: FastifyRequest): Record<string, string> | undefined {
    const headers = this.normalizeHeaders(request.headers);
    const apiKey = this.resolveApiKey(headers);

    if (apiKey) {
      headers.api_key = apiKey;
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private normalizeHeaders(headers: FastifyRequest['headers']): Record<string, string> {
    const hopByHopHeaders = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
    ]);

    return Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (hopByHopHeaders.has(normalizedKey)) {
        return acc;
      }

      if (typeof value === 'string') {
        acc[normalizedKey] = value;
        return acc;
      }

      if (Array.isArray(value) && value[0]) {
        acc[normalizedKey] = value[0];
      }

      return acc;
    }, {});
  }

  private resolveApiKey(headers: Record<string, string>): string | null {
    const existingHeader = headers.api_key;
    if (existingHeader && existingHeader.length > 0) {
      return existingHeader;
    }

    if (!this.apiKey) {
      return null;
    }

    return this.apiKey;
  }
}
