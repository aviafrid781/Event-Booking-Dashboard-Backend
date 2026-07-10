import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { buildDataSourceOptions } from './data-source.options';

config(); // load .env

/**
 * Standalone seed script (run with `npm run seed`).
 *
 * It relies on `synchronize` to create the schema, then inserts a handful of
 * sample events. It is idempotent: events are matched by name, so re-running
 * updates capacity/price rather than creating duplicates.
 */
const SAMPLE_EVENTS: Array<Pick<Event, 'name' | 'date' | 'totalSeats' | 'price'>> =
  [
    {
      name: 'Tech Conference 2026',
      date: new Date('2026-09-01T09:00:00Z'),
      totalSeats: 100,
      price: 49.99,
    },
    {
      name: 'Live Jazz Night',
      date: new Date('2026-08-15T19:30:00Z'),
      totalSeats: 40,
      price: 25.0,
    },
    {
      name: 'Startup Pitch Day',
      date: new Date('2026-10-05T14:00:00Z'),
      totalSeats: 5, // intentionally small — easy to exercise the "sold out" path
      price: 0.0,
    },
    {
      name: 'AI & Machine Learning Summit',
      date: new Date('2026-11-12T10:00:00Z'),
      totalSeats: 200,
      price: 79.99,
    },
    {
      name: 'Indie Film Screening',
      date: new Date('2026-08-28T18:00:00Z'),
      totalSeats: 60,
      price: 15.0,
    },
    {
      name: 'Food & Wine Festival',
      date: new Date('2026-09-20T12:00:00Z'),
      totalSeats: 150,
      price: 35.5,
    },
  ];

async function seed(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  const repo = dataSource.getRepository(Event);

  for (const sample of SAMPLE_EVENTS) {
    const existing = await repo.findOne({ where: { name: sample.name } });
    if (existing) {
      existing.date = sample.date;
      existing.totalSeats = sample.totalSeats;
      existing.price = sample.price;
      await repo.save(existing);
      // eslint-disable-next-line no-console
      console.log(`↺ updated: ${sample.name}`);
    } else {
      await repo.save(repo.create(sample));
      // eslint-disable-next-line no-console
      console.log(`＋ created: ${sample.name}`);
    }
  }

  await dataSource.destroy();
  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
