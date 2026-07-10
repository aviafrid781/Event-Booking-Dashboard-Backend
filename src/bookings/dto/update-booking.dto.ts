import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Fields a booking can be edited with after creation. Everything is optional
 * so the client can PATCH just the fields it changed. The event and status are
 * deliberately not editable here — seat allocation is owned by the worker.
 */
export class UpdateBookingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  seats?: number;
}
