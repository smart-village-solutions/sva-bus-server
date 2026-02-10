import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AdminAuthGuard } from './admin-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyInput } from './types';

type CreateApiKeyBody = {
  owner?: unknown;
  label?: unknown;
  contact?: unknown;
  expiresAt?: unknown;
  createdBy?: unknown;
};

type RequestWithAdminIdentity = FastifyRequest & {
  adminIdentity?: string;
};

@Controller('internal/api-keys')
@UseGuards(AdminAuthGuard)
export class ApiKeysAdminController {
  private readonly logger = new Logger(ApiKeysAdminController.name);

  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  async create(
    @Req() request: RequestWithAdminIdentity,
    @Body() body: CreateApiKeyBody,
  ): Promise<unknown> {
    const input = this.parseCreateBody(body);

    try {
      const { apiKey, record } = await this.apiKeysService.createApiKey(input);
      this.audit(request, 'create', 'ok', {
        keyId: record.keyId,
        owner: record.owner,
      });

      return {
        keyId: record.keyId,
        apiKey,
        owner: record.owner,
        label: record.label,
        contact: record.contact,
        createdAt: record.createdAt,
        createdBy: record.createdBy,
        expiresAt: record.expiresAt,
        revoked: record.revoked,
      };
    } catch (error) {
      this.audit(request, 'create', 'error', {
        owner: input.owner,
        reason: this.errorReason(error),
      });
      throw error;
    }
  }

  @Get()
  async list(@Req() request: RequestWithAdminIdentity): Promise<unknown> {
    try {
      const items = await this.apiKeysService.listApiKeys();
      this.audit(request, 'list', 'ok', { count: items.length });

      return {
        items: items.map((item) => ({
          keyId: item.keyId,
          owner: item.owner,
          label: item.label,
          contact: item.contact,
          createdAt: item.createdAt,
          createdBy: item.createdBy,
          expiresAt: item.expiresAt,
          revoked: item.revoked,
          revokedAt: item.revokedAt,
        })),
      };
    } catch (error) {
      this.audit(request, 'list', 'error', { reason: this.errorReason(error) });
      throw error;
    }
  }

  @Post(':keyId/revoke')
  async revoke(
    @Req() request: RequestWithAdminIdentity,
    @Param('keyId') keyId: string,
  ): Promise<unknown> {
    const parsedKeyId = this.parseKeyId(keyId);

    try {
      await this.apiKeysService.revokeApiKey(parsedKeyId);
      this.audit(request, 'revoke', 'ok', { keyId: parsedKeyId });
      return { ok: true };
    } catch (error) {
      this.audit(request, 'revoke', 'error', {
        keyId: parsedKeyId,
        reason: this.errorReason(error),
      });
      throw error;
    }
  }

  @Post(':keyId/activate')
  async activate(
    @Req() request: RequestWithAdminIdentity,
    @Param('keyId') keyId: string,
  ): Promise<unknown> {
    const parsedKeyId = this.parseKeyId(keyId);

    try {
      await this.apiKeysService.activateApiKey(parsedKeyId);
      this.audit(request, 'activate', 'ok', { keyId: parsedKeyId });
      return { ok: true };
    } catch (error) {
      this.audit(request, 'activate', 'error', {
        keyId: parsedKeyId,
        reason: this.errorReason(error),
      });
      throw error;
    }
  }

  @Delete(':keyId')
  async remove(
    @Req() request: RequestWithAdminIdentity,
    @Param('keyId') keyId: string,
  ): Promise<unknown> {
    const parsedKeyId = this.parseKeyId(keyId);

    try {
      await this.apiKeysService.deleteApiKey(parsedKeyId);
      this.audit(request, 'delete', 'ok', { keyId: parsedKeyId });
      return { ok: true };
    } catch (error) {
      this.audit(request, 'delete', 'error', {
        keyId: parsedKeyId,
        reason: this.errorReason(error),
      });
      throw error;
    }
  }

  private parseCreateBody(body: CreateApiKeyBody): CreateApiKeyInput {
    const owner = typeof body?.owner === 'string' ? body.owner.trim() : '';
    if (owner.length === 0) {
      throw new BadRequestException('owner is required');
    }

    const label = this.optionalString(body?.label, 'label');
    const contact = this.optionalString(body?.contact, 'contact');
    const createdBy = this.optionalString(body?.createdBy, 'createdBy');
    const expiresAt = this.optionalIsoDate(body?.expiresAt, 'expiresAt');

    return {
      owner,
      label,
      contact,
      createdBy,
      expiresAt,
    };
  }

  private parseKeyId(value: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException('keyId is required');
    }

    return normalized;
  }

  private optionalString(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private optionalIsoDate(value: unknown, fieldName: string): string | undefined {
    const normalized = this.optionalString(value, fieldName);
    if (!normalized) {
      return undefined;
    }

    const isoDateTimePattern =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (!isoDateTimePattern.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be an ISO-8601 datetime`);
    }

    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`${fieldName} must be an ISO-8601 datetime`);
    }

    return new Date(parsed).toISOString();
  }

  private audit(
    request: RequestWithAdminIdentity,
    action: 'create' | 'list' | 'revoke' | 'activate' | 'delete',
    result: 'ok' | 'error',
    details?: Record<string, unknown>,
  ): void {
    const requestIdHeader = request.headers['x-request-id'];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
    const payload = {
      event: 'admin_api_key_audit',
      action,
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

  private errorReason(error: unknown): string {
    if (error instanceof Error) {
      return error.name;
    }
    return 'UnknownError';
  }
}
