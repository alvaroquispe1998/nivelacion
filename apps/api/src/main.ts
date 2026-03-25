import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './app/common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      Logger.log(`CORS check origin=${origin} allowedEnv=[${allowedOrigins.join(',')}]`);
      // allow requests without origin (server-to-server, curl, postman)
      if (!origin) {
        Logger.log('CORS allow: no origin (server-to-server)');
        return callback(null, true);
      }

      // allow explicit origins from env first
      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        Logger.log(`CORS allow: matched CORS_ORIGINS for ${origin}`);
        return callback(null, true);
      }

      // allow any subdomain of autonomadeica.edu.pe
      try {
        const hostname = new URL(origin).hostname;
        if (
          hostname === 'autonomadeica.edu.pe' ||
          hostname.endsWith('.autonomadeica.edu.pe')
        ) {
          Logger.log(`CORS allow: matched wildcard for ${hostname}`);
          return callback(null, true);
        }
      } catch (err) {
        Logger.warn(`CORS check failed parsing origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      }

      Logger.warn(`CORS reject origin=${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-period-id'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('UAI Horario y Asistencia API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, doc);

  const configService = app.get(ConfigService);
  const port = Number(configService.get<number | string>('PORT') ?? process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${port}/api`);
}

bootstrap();
