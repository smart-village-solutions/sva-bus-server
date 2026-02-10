import { Module } from '@nestjs/common';

import { CacheModule } from '../cache/cache.module';
import { CacheAdminController } from '../cache/cache-admin.controller';
import { CacheAdminService } from '../cache/cache-admin.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysAdminController } from './api-keys-admin.controller';
import { ProxyAccessGuard } from './proxy-access.guard';

@Module({
  imports: [CacheModule],
  controllers: [ApiKeysAdminController, CacheAdminController],
  providers: [ApiKeysService, ProxyAccessGuard, AdminAuthGuard, CacheAdminService],
  exports: [ApiKeysService, ProxyAccessGuard],
})
export class ApiKeysModule {}
