# Backend: Event Booking API

This folder contains the NestJS backend for the Event Booking System.

## Setup

```bash
cd backend
cp .env.example .env
docker compose up -d 
npm install
npm run seed
npm run start:dev
```

- `npm run seed` creates the database schema and inserts sample events.
- The app expects PostgreSQL and Redis to be available.
- The root `docker-compose.yml` starts Postgres on `5432` and Redis on `6379`.

## Environment

The backend uses `.env.example` for runtime configuration. If you run `docker compose up -d` from the repo root, the defaults should work.

## API Endpoints

### `GET /events`
Returns events with live remaining-seat counts.

### `POST /bookings`
Creates a new booking request.
- Accepts: `requestId`, `eventId`, `customerName`, `customerEmail`, `seats`
- Returns: `202 Accepted` with `reference`, `status`, and a processing message.
- Duplicate `requestId` values are handled idempotently by returning the existing booking.
- The booking is stored as `PENDING` and processed asynchronously.

### `GET /bookings`
Returns a paginated list of bookings.
Query params:
- `eventId`
- `status`
- `page` (default `1`)
- `limit` (default `10`)

### `GET /bookings/:id`
Returns full details for a single booking, including its event.

### `PATCH /bookings/:id`
Updates editable booking fields: `customerName`, `customerEmail`, and `seats`.
The event and status are intentionally not editable once the booking exists.

### `DELETE /bookings/:id`
Deletes a booking and releases seats back to the event if the booking was already `CONFIRMED`.

## Design Notes

- Bookings are created in `PENDING` status and processed asynchronously via BullMQ.
- `POST /bookings` returns quickly with `202 Accepted` and does not wait for seat allocation.
- The booking worker locks the event row with a pessimistic write lock before updating `bookedSeats`.
- This prevents overbooking even under concurrent worker processing.
- `requestId` is a client-generated idempotency key with a database unique constraint.
- The queue uses a stable job ID (`booking-<id>`) for defence in depth.

## Testing

```bash
cd backend
npm test
```

Unit tests cover booking idempotency, job enqueue behavior, and processor seat-allocation logic.
