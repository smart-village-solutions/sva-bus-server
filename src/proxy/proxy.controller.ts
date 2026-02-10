import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
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

  @Get()
  async handleRootGet(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    return this.forwardRequest('GET', request, undefined, reply);
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
    if (body !== undefined && !this.isJsonContentType(request.headers['content-type'])) {
      throw new UnsupportedMediaTypeException('Only application/json payloads are supported');
    }
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
      const { response, cacheStatus, cacheKeyHash } = await this.proxyService.forward(
        method,
        pathWithQuery,
        body,
        {
          headers,
        },
      );
      reply.status(response.status);
      Object.entries(response.headers ?? {}).forEach(([key, value]) => {
        reply.header(key, value);
      });
      if (response.contentType && response.status !== 204 && response.status !== 304) {
        reply.header('content-type', response.contentType);
      }
      if (cacheStatus) {
        reply.header('x-cache', cacheStatus);
      }
      if (cacheKeyHash) {
        reply.header('x-cache-key-hash', cacheKeyHash);
      }
      // 204/304 responses must not include a response body.
      if (response.status === 204 || response.status === 304) {
        return undefined;
      }
      return response.body;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadGatewayException({
        message: 'Upstream request failed',
      });
    }
  }

  /**
   * Extract the path portion for proxying and reject absolute URLs so clients
   * cannot smuggle full upstream URLs ("scheme://") through the proxy.
   */
  private extractPath(url: string): string {
    const path = url.split('?')[0] ?? '';
    const prefix = '/api/v1';

    if (path === prefix) {
      return '/';
    }

    if (path.includes('://')) {
      throw new BadRequestException('Invalid proxy path');
    }

    if (path.startsWith(`${prefix}/`)) {
      return (path.slice(prefix.length) || '/').replace(/^\/+/, '/');
    }

    return (path || '/').replace(/^\/+/, '/');
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
     * Headers that must not be forwarded by a proxy.
     *
     * This includes:
     * 1. Hop-by-hop headers (RFC 9110 Section 7.6.1): Only meaningful for a single
     *    transport-level connection and must be stripped when relaying to the next hop.
     *    Examples: connection, keep-alive, transfer-encoding, upgrade, trailer, te.
     *
     * 2. Headers overridden by the proxy: host and content-length are recalculated
     *    by the HTTP client for the upstream request and must not be forwarded from
     *    the client request.
     *
     * References:
     * - RFC 9110 (HTTP Semantics), Section 7.6.1 "Connection"
     * - RFC 9112 (HTTP/1.1), message framing and connection management
     */
    const blockedHeaders = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-forwarded-port',
      'x-real-ip',
    ]);

    // Normalize the connection header to a single token list so we apply the cleanup once.
    // We read it because it can name additional hop-by-hop headers that must be stripped.
    const connectionHeader = headers.connection as string | string[] | undefined;
    const connectionTokens: string[] = [];
    if (typeof connectionHeader === 'string') {
      connectionTokens.push(...connectionHeader.split(','));
    } else if (Array.isArray(connectionHeader)) {
      connectionHeader.forEach((value) => {
        connectionTokens.push(...value.split(','));
      });
    }

    connectionTokens
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
      .forEach((value) => blockedHeaders.add(value));

    const allowlistedHeaders = new Set([
      'accept',
      'accept-encoding',
      'accept-language',
      'api_key',
      'authorization',
      'content-type',
      'user-agent',
    ]);

    return Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (blockedHeaders.has(normalizedKey)) {
        return acc;
      }

      if (!this.isAllowedHeader(normalizedKey, allowlistedHeaders)) {
        return acc;
      }

      if (typeof value === 'string') {
        acc[normalizedKey] = value;
        return acc;
      }

      if (Array.isArray(value) && value.length > 0) {
        acc[normalizedKey] = value.join(', ');
      }

      return acc;
    }, {});
  }

  private isAllowedHeader(header: string, allowlistedHeaders: Set<string>): boolean {
    // Allow custom app/trace headers (e.g., correlation IDs) without enumerating each one.
    if (header.startsWith('x-')) {
      return true;
    }

    return allowlistedHeaders.has(header);
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

  private isJsonContentType(contentType: string | string[] | undefined): boolean {
    if (!contentType) {
      return false;
    }

    const value = Array.isArray(contentType) ? contentType.join(',') : contentType;
    return value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .some((entry) => entry.includes('application/json') || entry.includes('+json'));
  }
}
