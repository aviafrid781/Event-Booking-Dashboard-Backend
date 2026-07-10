import { Controller, Get } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /** Returns all events with their remaining seat counts. */
  @Get()
  findAll() {
    return this.eventsService.findAll();
  }
}
