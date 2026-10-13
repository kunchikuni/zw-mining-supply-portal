import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(createValidationPipe());
  app.enableCors();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`ZW Supplier Portal API running on port ${port}`);
}
bootstrap();
