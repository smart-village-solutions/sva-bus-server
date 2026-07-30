import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { CacheModule } from '../cache/cache.module';
import { HttpClientModule } from '../http-client/http-client.module';
import { StateUpstreamsModule } from '../config/state-upstreams.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [ApiKeysModule, CacheModule, HttpClientModule, StateUpstreamsModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
