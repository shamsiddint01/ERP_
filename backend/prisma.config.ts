import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

// Prisma 7 config style, adopted without upgrading Prisma itself (pinned at
// 6.19.3). Migrate/introspection now read the connection from here instead
// of solely from schema.prisma's datasource block. The `url` in
// schema.prisma is kept alongside this as a required workaround for a
// Prisma 6.16+ CLI regression (prisma/prisma#28072) where `validate` and
// `generate` still hard-fail without it, even with a config file present —
// Prisma's own team confirms this is fixed only in v7. The runtime
// PrismaClient (src/prisma/prisma.service.ts) connects via the
// @prisma/adapter-pg driver adapter, independent of both of these.
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  engine: 'classic',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
