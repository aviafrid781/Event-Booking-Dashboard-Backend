import { Job } from 'bullmq';
import { DataSource, EntityManager } from 'typeorm';
import { BookingProcessor } from './booking.processor';
import { Booking, BookingStatus } from './booking.entity';
import { Event } from '../events/event.entity';
import { ProcessBookingJobData } from './booking.constants';

/**
 * Seat-allocation logic is the heart of the "no overbooking" guarantee.
 * We fake the transaction/manager so we can assert the decision the
 * processor makes for each scenario without a live database.
 */
describe('BookingProcessor', () => {
  let processor: BookingProcessor;
  let booking: Booking;
  let event: Event;

  /** A manager whose findOne returns our booking for Booking, event for Event. */
  function buildManager(): jest.Mocked<Pick<EntityManager, 'findOne' | 'save'>> {
    return {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === Booking ? booking : event),
      ) as never,
      save: jest.fn((e) => Promise.resolve(e)) as never,
    };
  }

  function buildProcessor(
    manager: Pick<EntityManager, 'findOne' | 'save'>,
  ): BookingProcessor {
    const dataSource = {
      transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager),
    } as unknown as DataSource;
    return new BookingProcessor(dataSource, {} as never);
  }

  const job = { data: { bookingId: 1 } } as Job<ProcessBookingJobData>;

  beforeEach(() => {
    booking = {
      id: 1,
      reference: 'ref-1',
      eventId: 1,
      seats: 2,
      status: BookingStatus.PENDING,
      failureReason: null,
    } as Booking;
    event = { id: 1, totalSeats: 5, bookedSeats: 0 } as Event;
  });

  it('CONFIRMS a booking that fits and deducts the seats', async () => {
    const manager = buildManager();
    processor = buildProcessor(manager);

    await processor.process(job);

    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(event.bookedSeats).toBe(2);
    expect(booking.failureReason).toBeNull();
  });

  it('FAILS with a sold-out reason when not enough seats remain', async () => {
    event.bookedSeats = 4; // only 1 left, booking wants 2
    const manager = buildManager();
    processor = buildProcessor(manager);

    await processor.process(job);

    expect(booking.status).toBe(BookingStatus.FAILED);
    expect(event.bookedSeats).toBe(4); // unchanged — no overbooking
    expect(booking.failureReason).toMatch(/sold out/i);
  });

  it('is idempotent: skips a booking that is no longer PENDING', async () => {
    booking.status = BookingStatus.CONFIRMED;
    const manager = buildManager();
    processor = buildProcessor(manager);

    await processor.process(job);

    // No event lookup, no seat mutation on a re-run.
    expect(event.bookedSeats).toBe(0);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('FAILS when the event no longer exists', async () => {
    event = undefined as never;
    const manager = buildManager();
    processor = buildProcessor(manager);

    await processor.process(job);

    expect(booking.status).toBe(BookingStatus.FAILED);
    expect(booking.failureReason).toMatch(/no longer exists/i);
  });
});
