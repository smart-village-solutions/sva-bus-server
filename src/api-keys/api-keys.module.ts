import { Module } from '@nestjs/common';

import { CacheModule } from '../cache/cache.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysAdminController } from './api-keys-admin.controller';
import { ProxyAccessGuard } from './proxy-access.guard';

@Module({
  imports: [CacheModule],
  controllers: [ApiKeysAdminController],
  providers: [ApiKeysService, ProxyAccessGuard, AdminAuthGuard],
  exports: [ApiKeysService, ProxyAccessGuard],
})
export class ApiKeysModule {}
