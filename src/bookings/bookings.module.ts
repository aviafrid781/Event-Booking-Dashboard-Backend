import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOOKING_QUEUE } from './booking.constants';
import { Booking } from './booking.entity';
import { BookingProcessor } from './booking.processor';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    BullModule.registerQueue({ name: BOOKING_QUEUE }),
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingProcessor],
})
export class BookingsModule {}
