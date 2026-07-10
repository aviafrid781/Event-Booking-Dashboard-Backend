import { DataSourceOptions } from 'typeorm';
import { Booking } from '../bookings/booking.entity';
import { Event } from '../events/event.entity';

/**
 * Single source of truth for the TypeORM connection.
 *
 * Used both by the Nest app (AppModule) and by the standalone seed script,
 * so the schema and entity set never drift between the two.
 *
 * `synchronize` is intentionally on by default so the project runs from
 * scratch without a migration step (see README). In production this would
 * be replaced by versioned migrations.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'event_booking',
    entities: [Event, Booking],
    synchronize: process.env.DB_SYNCHRONIZE !== 'false',
    logging: process.env.DB_LOGGING === 'true',
  };
}
