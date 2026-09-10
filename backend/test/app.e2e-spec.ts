import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health -> 200 liveness, no secrets', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.body.timestamp).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|redis:\/\/|password|secret|DATABASE_URL/i);
  });

  it('GET /api/v1/health/ready -> reports database + redis component status', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.info.database).toHaveProperty('status');
    expect(res.body.info.redis).toHaveProperty('status');
    expect(['ok', 'degraded', 'error']).toContain(res.body.status);
    // Never leaks connection details.
    expect(JSON.stringify(res.body)).not.toMatch(/postgres:\/\/|redis:\/\/|@localhost|password|DATABASE_URL/i);
  });
});
