import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TokenAuthGuard } from './token-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (config: ConfigService) =>
        new TokenAuthGuard(config.get<string>('API_TOKEN', '')),
      inject: [ConfigService],
    },
  ],
})
export class AuthModule {}
