import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: new Logger(),
  });

  const configService = app.get(ConfigService);
  const port = Number(configService.get('PORT') ?? 3000);

  await app.listen(port, '0.0.0.0');
}

bootstrap();
