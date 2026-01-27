import { BadGatewayException, Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
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
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    return this.forwardRequest('GET', request, undefined, reply);
  }

  @Post('*')
  async handlePost(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    return this.forwardRequest('POST', request, body, reply);
  }

  private async forwardRequest(
    method: 'GET' | 'POST',
    request: FastifyRequest,
    body: unknown,
    reply: FastifyReply,
  ): Promise<unknown> {
    const path = this.extractPath(request.url ?? '');
    const rawQuery = this.extractQueryString(request.url ?? '');
    const pathWithQuery = rawQuery ? `${path}?${rawQuery}` : path;
    const headers = this.buildForwardHeaders(request);

    try {
      const response = await this.proxyService.forward(method, pathWithQuery, body, {
        headers,
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

  private extractQueryString(url: string): string | null {
    const queryIndex = url.indexOf('?');
    if (queryIndex < 0) {
      return null;
    }
    return url.slice(queryIndex + 1) || null;
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
    /**
     * Set of HTTP/1.1 "hop-by-hop" header names (lowercased) that must not be forwarded
     * by a proxy.
     *
     * Hop-by-hop headers are only meaningful for a single transport-level connection
     * (one hop) between two adjacent parties (client ↔ proxy or proxy ↔ upstream). They
     * can control connection behavior and message framing (e.g., `connection`,
     * `keep-alive`, `transfer-encoding`, `upgrade`) and therefore must be stripped when
     * relaying requests/responses to the next hop to avoid leaking connection-specific
     * semantics and to prevent protocol/framing issues.
     *
     * References:
     * - RFC 9110 (HTTP Semantics), "Connection" and hop-by-hop header fields
     * - RFC 9112 (HTTP/1.1), message framing and connection management
     */
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
