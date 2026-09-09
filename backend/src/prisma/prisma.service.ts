import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // The runtime client connects via this driver adapter (Prisma 7 config
    // style) rather than schema.prisma's datasource.url. That url is still
    // present in the schema purely as a workaround for a Prisma 6.16+ CLI
    // regression (prisma/prisma#28072) where `validate`/`generate` still
    // require it even when a driver adapter is configured — see
    // prisma.config.ts, which is what Migrate actually connects through.
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
