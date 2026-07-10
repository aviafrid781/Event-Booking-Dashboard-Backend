import { QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';

/**
 * These tests exercise the two guarantees the service is responsible for:
 * enqueuing after a successful insert, and idempotency on a duplicate
 * requestId (unique-constraint violation → return the existing booking,
 * do NOT enqueue a second job).
 */
describe('BookingsService', () => {
  let service: BookingsService;
  let repo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let queue: { add: jest.Mock };

  const dto: CreateBookingDto = {
    requestId: 'req-123',
    eventId: 1,
    customerName: 'Rahim Uddin',
    customerEmail: 'rahim@example.com',
    seats: 2,
  };

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x as Booking),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    queue = { add: jest.fn() };
    service = new BookingsService(repo as never, queue as never);
  });

  it('persists a PENDING booking and enqueues a job with a stable jobId', async () => {
    repo.save.mockResolvedValue({ id: 42, reference: 'ref-42', ...dto } as Booking);

    const result = await service.create(dto);

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(42);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [, jobData, opts] = queue.add.mock.calls[0];
    expect(jobData).toEqual({ bookingId: 42 });
    expect(opts).toMatchObject({ jobId: 'booking-42', attempts: 3 });
  });

  it('returns the existing booking and does NOT enqueue on a duplicate requestId', async () => {
    const uniqueViolation = new QueryFailedError('insert', [], new Error());
    (uniqueViolation as unknown as { code: string }).code = '23505';
    repo.save.mockRejectedValue(uniqueViolation);

    const existing = {
      id: 7,
      reference: 'ref-7',
      requestId: dto.requestId,
      status: BookingStatus.PENDING,
    } as Booking;
    repo.findOne.mockResolvedValue(existing);

    const result = await service.create(dto);

    expect(result).toBe(existing);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { requestId: dto.requestId },
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    repo.save.mockRejectedValue(new Error('db is down'));
    await expect(service.create(dto)).rejects.toThrow('db is down');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
