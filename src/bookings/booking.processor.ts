import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  BOOKING_QUEUE,
  ProcessBookingJobData,
} from './booking.constants';
import { Booking, BookingStatus } from './booking.entity';
import { Event } from '../events/event.entity';

/**
 * Consumes the booking queue and decides CONFIRMED vs FAILED.
 *
 * ── How overbooking is made impossible ─────────────────────────────
 * All seat math happens inside a single DB transaction that takes a
 * PESSIMISTIC WRITE lock (`SELECT ... FOR UPDATE`) on the event row.
 * Any other worker trying to book the same event blocks until this
 * transaction commits, so the "read remaining seats → deduct" step is
 * fully serialized per event. Even with many workers / high concurrency
 * running at once, confirmed seats can never exceed total_seats.
 * ───────────────────────────────────────────────────────────────────
 */
@Processor(BOOKING_QUEUE, {
  concurrency: Number(process.env.BOOKING_WORKER_CONCURRENCY ?? 5),
})
export class BookingProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ProcessBookingJobData>): Promise<void> {
    const { bookingId } = job.data;

    await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: bookingId },
      });

      if (!booking) {
        this.logger.error(`Booking ${bookingId} not found; skipping.`);
        return;
      }

      // Already processed (e.g. a retry of a completed job) — do nothing.
      if (booking.status !== BookingStatus.PENDING) {
        this.logger.warn(
          `Booking ${bookingId} already ${booking.status}; skipping.`,
        );
        return;
      }

      // Lock the event row for the duration of this transaction.
      const event = await manager.findOne(Event, {
        where: { id: booking.eventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) {
        await this.fail(manager, booking, 'Event no longer exists');
        return;
      }

      const remaining = event.totalSeats - event.bookedSeats;
      if (booking.seats > remaining) {
        await this.fail(
          manager,
          booking,
          `Sold out: requested ${booking.seats}, only ${remaining} left`,
        );
        return;
      }

      event.bookedSeats += booking.seats;
      booking.status = BookingStatus.CONFIRMED;
      booking.failureReason = null;

      await manager.save(event);
      await manager.save(booking);

      this.logger.log(
        `Booking ${booking.reference} CONFIRMED (${booking.seats} seats for event ${event.id})`,
      );
    });
  }

  private async fail(
    manager: import('typeorm').EntityManager,
    booking: Booking,
    reason: string,
  ): Promise<void> {
    booking.status = BookingStatus.FAILED;
    booking.failureReason = reason;
    await manager.save(booking);
    this.logger.warn(`Booking ${booking.reference} FAILED: ${reason}`);
  }
}
