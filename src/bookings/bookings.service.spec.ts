/// <reference types="jest" />
declare const describe: any;
declare const it: any;
declare const beforeEach: any;
declare const expect: any;
declare const jest: any;
import { QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './booking.entity';
import { Event } from '../events/event.entity';
import { CreateBookingDto } from './dto/create-booking.dto';

/**
 * These tests exercise the two guarantees the service is responsible for:
 * enqueuing after a successful insert, and idempotency on a duplicate
 * requestId (unique-constraint violation → return the existing booking,
 * do NOT enqueue a second job).
 */
describe('BookingsService', () => {
  let service: BookingsService;
  let repo: any;
  let queue: any;

  const dto: CreateBookingDto = {
    requestId: 'req-123',
    eventId: 1,
    customerName: 'Rahim Uddin',
    customerEmail: 'rahim@example.com',
    seats: 2,
  };

  beforeEach(() => {
    const manager = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    repo = {
      create: jest.fn((x) => x as Booking),
      save: jest.fn(),
      findOne: jest.fn(),
      manager,
    };
    queue = { add: jest.fn() };
    service = new BookingsService(repo as never, queue as never);
  });

  it('persists a PENDING booking and enqueues a job with a stable jobId', async () => {
    repo.manager.findOne.mockResolvedValue({
      id: dto.eventId,
      name: 'Test event',
      date: new Date(Date.now() + 100000),
      totalSeats: 10,
      bookedSeats: 0,
      price: 10.0,
    } as Event);
    repo.save.mockResolvedValue({ id: 42, reference: 'ref-42', ...dto } as Booking);

    const result = await service.create(dto);

    expect(repo.manager.findOne).toHaveBeenCalledWith(Event, { where: { id: dto.eventId } });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(42);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [, jobData, opts] = queue.add.mock.calls[0];
    expect(jobData).toEqual({ bookingId: 42 });
    expect(opts).toMatchObject({ jobId: 'booking-42', attempts: 3 });
  });

  it('returns the existing booking and does NOT enqueue on a duplicate requestId', async () => {
    repo.manager.findOne.mockResolvedValue({
      id: dto.eventId,
      name: 'Test event',
      date: new Date(Date.now() + 100000),
      totalSeats: 10,
      bookedSeats: 0,
      price: 10.0,
    } as Event);
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
    repo.manager.findOne.mockResolvedValue({
      id: dto.eventId,
      name: 'Test event',
      date: new Date(Date.now() + 100000),
      totalSeats: 10,
      bookedSeats: 0,
      price: 10.0,
    } as Event);
    repo.save.mockRejectedValue(new Error('db is down'));
    await expect(service.create(dto)).rejects.toThrow('db is down');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('removes a CONFIRMED booking and releases seats back to the event', async () => {
    const manager = repo.manager;
    const booking = {
      id: 1,
      eventId: 10,
      seats: 3,
      status: BookingStatus.CONFIRMED,
    } as Booking;
    const event = {
      id: 10,
      bookedSeats: 7,
      totalSeats: 20,
      name: 'Test event',
      date: new Date(),
      price: 10.0,
      bookings: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Event;

    manager.findOne = jest.fn()
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce(event);
    manager.delete = jest.fn().mockResolvedValue(undefined);
    manager.save = jest.fn().mockResolvedValue(undefined);

    await service.remove(1);

    expect(manager.findOne).toHaveBeenNthCalledWith(1, Booking, { where: { id: 1 } });
    expect(manager.findOne).toHaveBeenNthCalledWith(2, Event, {
      where: { id: booking.eventId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 10,
      bookedSeats: 4,
    }));
    expect(manager.delete).toHaveBeenCalledWith(Booking, 1);
  });

  it('removes a PENDING booking without changing event seats', async () => {
    const manager = repo.manager;
    const booking = {
      id: 2,
      eventId: 11,
      seats: 4,
      status: BookingStatus.PENDING,
    } as Booking;

    manager.findOne = jest.fn().mockResolvedValueOnce(booking);
    manager.delete = jest.fn().mockResolvedValue(undefined);
    manager.save = jest.fn();

    await service.remove(2);

    expect(manager.findOne).toHaveBeenCalledWith(Booking, { where: { id: 2 } });
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.delete).toHaveBeenCalledWith(Booking, 2);
  });
});
