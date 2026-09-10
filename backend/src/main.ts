import { ConsoleLogger, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

// BigInt (used for AuditLog.id, which is bigserial) has no native JSON
// representation — without this, any response containing an audit log
// row throws "Do not know how to serialize a BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const isProduction = process.env.NODE_ENV === 'production';

/** In production the app must not boot with a missing or obviously-weak signing secret. */
function assertProductionSecrets(): void {
  if (!isProduction) return;
  const secret = process.env.JWT_ACCESS_SECRET;
  const weak = !secret || secret.length < 32 || ['change_me', 'changeme', 'secret'].includes(secret.toLowerCase());
  if (weak) {
    throw new Error('JWT_ACCESS_SECRET must be set to a strong value (>= 32 chars) when NODE_ENV=production');
  }
}

/** Comma-separated list of allowed browser origins; falls back to the Vite dev server outside production. */
function resolveCorsOrigin(): string[] | string {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) return raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (isProduction) {
    Logger.warn(
      'CORS_ORIGIN is not set — browser requests from other origins will be blocked. Set CORS_ORIGIN to your frontend URL.',
      'Bootstrap',
    );
    return [];
  }
  return 'http://localhost:5173';
}

async function bootstrap() {
  assertProductionSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Structured, machine-readable JSON logs in production (timestamp + level +
  // context + message + pid); the familiar coloured output in development.
  app.useLogger(new ConsoleLogger({ json: isProduction, colors: !isProduction }));

  // Behind a reverse proxy, TRUST_PROXY makes req.ip / rate-limiting use the
  // real client IP from X-Forwarded-For. Set it to the number of proxy hops
  // (1 for the provided nginx), or "true". Left off, every client behind the
  // proxy would share one rate-limit bucket.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true');
  }

  // Run OnModuleDestroy hooks (PrismaService.$disconnect, RedisService.disconnect)
  // when the process gets SIGTERM/SIGINT — otherwise a container stop drops
  // connections without closing them.
  app.enableShutdownHooks();

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger is served in development, and in production only when explicitly
  // opted in with ENABLE_SWAGGER=true.
  if (!isProduction || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ERP API')
      .setDescription('Professional ERP system API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  Logger.log(`ERP API listening on port ${port} (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'})`, 'Bootstrap');
}
await bootstrap();
