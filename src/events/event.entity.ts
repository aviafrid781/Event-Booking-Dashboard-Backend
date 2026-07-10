import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Booking } from '../bookings/booking.entity';

@Entity({ name: 'events' })
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ name: 'total_seats', type: 'int' })
  totalSeats: number;

  /**
   * Number of seats already committed to CONFIRMED bookings.
   * Mutated only inside a locked transaction (see BookingProcessor),
   * so it can never exceed `totalSeats`.
   */
  @Column({ name: 'booked_seats', type: 'int', default: 0 })
  bookedSeats: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: number;

  @OneToMany(() => Booking, (booking) => booking.event)
  bookings: Booking[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
