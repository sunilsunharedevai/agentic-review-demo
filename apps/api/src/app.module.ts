import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
  ],
  controllers: [HealthController, ReviewsController],
  providers: [ReviewsService],
})
export class AppModule {}
