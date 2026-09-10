import { BadRequestException, ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function hostWith() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const req = { method: 'POST', originalUrl: '/api/v1/things' };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
  return { res, host };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('passes an HttpException through with its status and body unchanged', () => {
    const { res, host } = hostWith();
    filter.catch(new ConflictException('Only PENDING expenses can be approved'), host as never);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, message: 'Only PENDING expenses can be approved' }));
  });

  it('preserves class-validator array messages from BadRequestException', () => {
    const { res, host } = hostWith();
    filter.catch(new BadRequestException(['name must be a string', 'phone should not be empty']), host as never);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: ['name must be a string', 'phone should not be empty'] }));
  });

  it('maps a Prisma P2002 unique violation to 409', () => {
    const { res, host } = hostWith();
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6.19.3' });
    filter.catch(err, host as never);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  it('maps a Prisma P2025 not-found to 404', () => {
    const { res, host } = hostWith();
    const err = new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6.19.3' });
    filter.catch(err, host as never);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('returns a generic 500 for an unknown error and never leaks its message', () => {
    const { res, host } = hostWith();
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432 while running SELECT * FROM users'), host as never);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' });
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|SELECT|5432/);
  });

  it('does not throw when a NotFoundException carries a plain string response', () => {
    const { res, host } = hostWith();
    expect(() => filter.catch(new NotFoundException('nope'), host as never)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
