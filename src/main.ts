import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow the Vite dev server (and any origin in this take-home) to call the API.
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared on the DTO
      forbidNonWhitelisted: true, // 400 if the client sends unknown fields
      transform: true, // coerce query/path params to their DTO types
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Event Booking API listening on http://localhost:${port}`);
}

bootstrap();
