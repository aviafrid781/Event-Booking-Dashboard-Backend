import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Accepts a booking and returns immediately with 202 + a reference.
   * The actual seat allocation happens asynchronously in the queue worker.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateBookingDto) {
    const booking = await this.bookingsService.create(dto);
    return {
      reference: booking.reference,
      status: booking.status,
      message: 'Booking accepted and is being processed.',
    };
  }

  @Get()
  findAll(@Query() query: QueryBookingsDto) {
    return this.bookingsService.findAll(query);
  }

  /** Full details of a single booking (with its event). */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.findOne(id);
  }

  /** Edit the customer/seat fields of an existing booking. */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookingsService.update(id, dto);
  }
}
