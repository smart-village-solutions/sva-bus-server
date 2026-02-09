import { Module } from '@nestjs/common';

import { CacheModule } from '../cache/cache.module';
import { HttpClientModule } from '../http-client/http-client.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [CacheModule, HttpClientModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
