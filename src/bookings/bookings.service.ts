import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { QueryFailedError, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  BOOKING_QUEUE,
  PROCESS_BOOKING_JOB,
  ProcessBookingJobData,
} from './booking.constants';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

/**
 * Postgres error code for a unique-constraint violation.
 * We use it to detect duplicate `requestId` submissions.
 */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectQueue(BOOKING_QUEUE)
    private readonly bookingQueue: Queue<ProcessBookingJobData>,
  ) {}

  /**
   * Creates a PENDING booking and enqueues it for async processing.
   *
   * Idempotency: `request_id` has a UNIQUE constraint. If the same
   * requestId is submitted again, the insert fails and we return the
   * EXISTING booking instead of creating a second one — so the endpoint
   * is safe to retry.
   */
  async create(dto: CreateBookingDto): Promise<Booking> {
    const booking = this.bookingRepo.create({
      reference: uuidv4(),
      requestId: dto.requestId,
      eventId: dto.eventId,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      seats: dto.seats,
      status: BookingStatus.PENDING,
    });

    let saved: Booking;
    try {
      saved = await this.bookingRepo.save(booking);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const existing = await this.bookingRepo.findOne({
          where: { requestId: dto.requestId },
        });
        this.logger.warn(
          `Duplicate requestId=${dto.requestId}; returning existing booking ${existing?.reference}`,
        );
        return existing;
      }
      throw err;
    }

    // Enqueue AFTER the row is committed so the worker can always find it.
    await this.bookingQueue.add(
      PROCESS_BOOKING_JOB,
      { bookingId: saved.id },
      {
        // A stable jobId gives us queue-level de-duplication too, on top of
        // the DB unique constraint (belt and braces).
        jobId: `booking-${saved.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    return saved;
  }

  async findAll(query: QueryBookingsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.event', 'event')
      .orderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.eventId) {
      qb.andWhere('booking.eventId = :eventId', { eventId: query.eventId });
    }
    if (query.status) {
      qb.andWhere('booking.status = :status', { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Fetches a single booking (with its event) or throws 404. */
  async findOne(id: number): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { event: true },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  /**
   * Updates the editable customer/seat fields of a booking. The event and
   * status are intentionally left untouched — seat allocation is owned by the
   * queue worker, not by this endpoint.
   */
  async update(id: number, dto: UpdateBookingDto): Promise<Booking> {
    const booking = await this.findOne(id);
    if (dto.customerName !== undefined) booking.customerName = dto.customerName;
    if (dto.customerEmail !== undefined)
      booking.customerEmail = dto.customerEmail;
    if (dto.seats !== undefined) booking.seats = dto.seats;
    return this.bookingRepo.save(booking);
  }

  /** Deletes a booking, or throws 404 if it doesn't exist. */
  async remove(id: number): Promise<void> {
    const result = await this.bookingRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === PG_UNIQUE_VIOLATION
    );
  }
}
