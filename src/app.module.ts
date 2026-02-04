import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CacheModule } from './cache/cache.module';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { HttpClientModule } from './http-client/http-client.module';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    HttpClientModule,
    CacheModule,
    HealthModule,
    ProxyModule,
  ],
})
export class AppModule {}
