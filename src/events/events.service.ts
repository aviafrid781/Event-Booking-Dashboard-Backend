import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';

export interface EventWithAvailability {
  id: number;
  name: string;
  date: Date;
  totalSeats: number;
  bookedSeats: number;
  remainingSeats: number;
  price: string;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
  ) {}

  /**
   * Lists events with a derived `remainingSeats` count so the frontend
   * doesn't have to compute availability itself.
   */
  async findAll(): Promise<EventWithAvailability[]> {
    const events = await this.eventRepo.find({ order: { date: 'ASC' } });
    return events.map((event) => ({
      id: event.id,
      name: event.name,
      date: event.date,
      totalSeats: event.totalSeats,
      bookedSeats: event.bookedSeats,
      remainingSeats: event.totalSeats - event.bookedSeats,
      price: event.price?.toString(),
    }));
  }
}
