import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  /** Client-generated idempotency key (UUID recommended). */
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsInt()
  @Min(1)
  eventId: number;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsEmail()
  customerEmail: string;

  @IsInt()
  @Min(1)
  @Max(50)
  seats: number;
}
