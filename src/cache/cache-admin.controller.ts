import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AdminAuthGuard } from '../api-keys/admin-auth.guard';
import { hashKeyForLogging } from '../utils/hash';
import {
  CacheAdminService,
  InvalidateProxyCacheInput,
  InvalidateProxyCacheResult,
} from './cache-admin.service';

type InvalidateBody = {
  scope?: unknown;
  dryRun?: unknown;
  path?: unknown;
  strict?: unknown;
  headers?: unknown;
  pathPrefix?: unknown;
};

type StrictHeadersBody = {
  accept?: unknown;
  acceptLanguage?: unknown;
  apiKey?: unknown;
};

type RequestWithAdminIdentity = FastifyRequest & {
  adminIdentity?: string;
};

@Controller('internal/cache')
@UseGuards(AdminAuthGuard)
export class CacheAdminController {
  private readonly logger = new Logger(CacheAdminController.name);

  constructor(private readonly cacheAdminService: CacheAdminService) {}

  @Post('invalidate')
  async invalidate(
    @Req() request: RequestWithAdminIdentity,
    @Body() body: InvalidateBody,
  ): Promise<InvalidateProxyCacheResult & { ok: true }> {
    try {
      const input = this.parseBody(body);
      const result = await this.cacheAdminService.invalidate(input);
      this.audit(request, { ...result, ...this.buildAuditTargetFromInput(input) }, 'ok');
      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      this.audit(
        request,
        {
          scope: this.tryReadScope(body),
          dryRun: this.readDryRun(body),
          ...this.buildAuditTargetFromBody(body),
        },
        'error',
        {
          reason: this.errorReason(error),
        },
      );
      throw error;
    }
  }

  private parseBody(body: InvalidateBody): InvalidateProxyCacheInput {
    const scope = this.parseScope(body?.scope);
    const dryRun = this.parseOptionalBoolean(body?.dryRun, 'dryRun') ?? false;

    if (scope === 'all') {
      return { scope, dryRun };
    }

    if (scope === 'prefix') {
      const pathPrefix = this.parseRequiredString(body?.pathPrefix, 'pathPrefix');
      return {
        scope,
        pathPrefix,
        dryRun,
      };
    }

    const path = this.parseRequiredString(body?.path, 'path');
    const strict = this.parseOptionalBoolean(body?.strict, 'strict') ?? false;
    const headers = this.parseStrictHeaders(body?.headers);

    return {
      scope,
      path,
      strict,
      headers,
      dryRun,
    };
  }

  private parseScope(value: unknown): 'exact' | 'prefix' | 'all' {
    if (value === 'exact' || value === 'prefix' || value === 'all') {
      return value;
    }

    throw new BadRequestException('scope must be one of: exact, prefix, all');
  }

  private parseRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private parseStrictHeaders(value: unknown):
    | {
        accept?: string;
        acceptLanguage?: string;
        apiKey?: string;
      }
    | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('headers must be an object');
    }

    const payload = value as StrictHeadersBody;

    return {
      accept: this.parseOptionalString(payload.accept, 'headers.accept'),
      acceptLanguage: this.parseOptionalString(payload.acceptLanguage, 'headers.acceptLanguage'),
      apiKey: this.parseOptionalString(payload.apiKey, 'headers.apiKey'),
    };
  }

  private parseOptionalString(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${fieldName} must be a boolean`);
    }

    return value;
  }

  private audit(
    request: RequestWithAdminIdentity,
    input: {
      scope?: string;
      dryRun?: boolean;
      matched?: number;
      deleted?: number;
      path?: string;
      pathPrefix?: string;
      strict?: boolean;
      headerVariantFingerprint?: string;
    },
    result: 'ok' | 'error',
    details?: Record<string, unknown>,
  ): void {
    const requestIdHeader = request.headers['x-request-id'];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;

    const payload = {
      event: 'admin_cache_invalidation_audit',
      action: 'invalidate',
      scope: input.scope ?? 'unknown',
      dryRun: input.dryRun ?? false,
      matched: input.matched ?? null,
      deleted: input.deleted ?? null,
      path: input.path ?? null,
      pathPrefix: input.pathPrefix ?? null,
      strict: input.strict ?? null,
      headerVariantFingerprint: input.headerVariantFingerprint ?? null,
      result,
      adminIdentity: request.adminIdentity ?? 'unknown',
      ip: request.ip ?? 'unknown',
      requestId: requestId ?? null,
      ...details,
    };

    if (result === 'error') {
      this.logger.warn(JSON.stringify(payload));
      return;
    }

    this.logger.log(JSON.stringify(payload));
  }

  private tryReadScope(body: InvalidateBody | undefined): string | undefined {
    return typeof body?.scope === 'string' ? body.scope : undefined;
  }

  private readDryRun(body: InvalidateBody | undefined): boolean {
    return body?.dryRun === true;
  }

  private buildAuditTargetFromInput(input: InvalidateProxyCacheInput): {
    path?: string;
    pathPrefix?: string;
    strict?: boolean;
    headerVariantFingerprint?: string;
  } {
    if (input.scope === 'exact') {
      return {
        path: input.path,
        strict: input.strict ?? false,
        headerVariantFingerprint: this.computeHeaderVariantFingerprint(input.headers),
      };
    }

    if (input.scope === 'prefix') {
      return {
        pathPrefix: input.pathPrefix,
      };
    }

    return {};
  }

  private buildAuditTargetFromBody(body: InvalidateBody | undefined): {
    path?: string;
    pathPrefix?: string;
    strict?: boolean;
    headerVariantFingerprint?: string;
  } {
    const path = typeof body?.path === 'string' ? body.path.trim() : undefined;
    const pathPrefix = typeof body?.pathPrefix === 'string' ? body.pathPrefix.trim() : undefined;
    const strict = typeof body?.strict === 'boolean' ? body.strict : undefined;
    const headerVariantFingerprint = this.computeHeaderVariantFingerprint(
      this.readStrictHeaders(body),
    );

    return {
      path: path && path.length > 0 ? path : undefined,
      pathPrefix: pathPrefix && pathPrefix.length > 0 ? pathPrefix : undefined,
      strict,
      headerVariantFingerprint,
    };
  }

  private readStrictHeaders(
    body: InvalidateBody | undefined,
  ): { accept?: string; acceptLanguage?: string; apiKey?: string } | undefined {
    if (
      !body ||
      typeof body.headers !== 'object' ||
      body.headers === null ||
      Array.isArray(body.headers)
    ) {
      return undefined;
    }

    const payload = body.headers as StrictHeadersBody;
    const accept = typeof payload.accept === 'string' ? payload.accept.trim() : undefined;
    const acceptLanguage =
      typeof payload.acceptLanguage === 'string' ? payload.acceptLanguage.trim() : undefined;
    const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : undefined;

    return {
      accept: accept && accept.length > 0 ? accept : undefined,
      acceptLanguage: acceptLanguage && acceptLanguage.length > 0 ? acceptLanguage : undefined,
      apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
    };
  }

  private computeHeaderVariantFingerprint(
    headers:
      | {
          accept?: string;
          acceptLanguage?: string;
          apiKey?: string;
        }
      | undefined,
  ): string | undefined {
    if (!headers) {
      return undefined;
    }

    const hasAnyHeader = Boolean(headers.accept || headers.acceptLanguage || headers.apiKey);
    if (!hasAnyHeader) {
      return undefined;
    }

    return hashKeyForLogging(
      JSON.stringify({
        accept: headers.accept ?? '',
        acceptLanguage: headers.acceptLanguage ?? '',
        apiKey: headers.apiKey ?? '',
      }),
    );
  }

  private errorReason(error: unknown): string {
    if (error instanceof Error) {
      return error.name;
    }

    return 'UnknownError';
  }
}
