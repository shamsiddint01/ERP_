import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface NormalizedError {
  status: number;
  body: { statusCode: number; message: string | string[]; error: string };
}

/**
 * Global safety net so a client never receives a stack trace, a filesystem
 * path, raw SQL, or an environment value.
 *
 * - HttpException: passed through untouched (preserves the existing
 *   `{ statusCode, message, error }` shape every controller/pipe already returns).
 * - Known Prisma errors: mapped to a clean 4xx.
 * - Everything else: a generic 500. The real error (with stack) is logged
 *   server-side with request context, never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);
    const where = `${req.method} ${req.originalUrl}`;

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${where} -> ${normalized.status}`, exception instanceof Error ? exception.stack : String(exception));
    } else if (!(exception instanceof HttpException)) {
      // A mapped non-HTTP error (e.g. Prisma) — log the detail server-side only.
      this.logger.warn(`${where} -> ${normalized.status}: ${exception instanceof Error ? exception.message : String(exception)}`);
    }

    res.status(normalized.status).json(normalized.body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const body =
        typeof response === 'string'
          ? { statusCode: status, message: response, error: exception.name.replace(/Exception$/, '') }
          : (response as NormalizedError['body']);
      return { status, body };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return this.make(HttpStatus.CONFLICT, 'A record with these unique values already exists', 'Conflict');
        case 'P2025':
          return this.make(HttpStatus.NOT_FOUND, 'The requested record was not found', 'Not Found');
        case 'P2003':
          return this.make(HttpStatus.CONFLICT, 'This operation violates a reference to a related record', 'Conflict');
        default:
          return this.make(HttpStatus.BAD_REQUEST, 'The request could not be processed', 'Bad Request');
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return this.make(HttpStatus.BAD_REQUEST, 'The request could not be processed', 'Bad Request');
    }

    return this.make(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error', 'Internal Server Error');
  }

  private make(status: number, message: string, error: string): NormalizedError {
    return { status, body: { statusCode: status, message, error } };
  }
}
