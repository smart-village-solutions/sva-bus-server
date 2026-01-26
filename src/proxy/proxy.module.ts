import { Module } from '@nestjs/common';

import { HttpClientModule } from '../http-client/http-client.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [HttpClientModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
