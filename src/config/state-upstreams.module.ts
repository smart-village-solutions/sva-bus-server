import { Module } from '@nestjs/common';

import { FederalStateUpstreamService } from './federal-state-upstream.service';

@Module({
  providers: [FederalStateUpstreamService],
  exports: [FederalStateUpstreamService],
})
export class StateUpstreamsModule {}
