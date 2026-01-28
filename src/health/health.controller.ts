import { Controller, Get } from '@nestjs/common';

import { CacheService } from '../cache/cache.service';

@Controller('health')
export class HealthController {
  constructor(private readonly cacheService: CacheService) {}

  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('cache')
  async getCacheHealth(): Promise<{ status: string; message?: string }> {
    const result = await this.cacheService.checkHealth();
    return { status: result.status, message: result.message };
  }
}
