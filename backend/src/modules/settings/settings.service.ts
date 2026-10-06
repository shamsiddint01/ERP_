import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { logoToDataUrl } from './logo-image.util.js';

const DEFAULT_SETTINGS = {
  companyName: "Ta'lim Markazi",
  currency: 'UZS',
  timezone: 'Asia/Tashkent',
  defaultLanguage: 'uz',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) return existing;
    return this.prisma.companySettings.create({ data: DEFAULT_SETTINGS });
  }

  async update(dto: UpdateSettingsDto) {
    const existing = await this.get();
    return this.prisma.companySettings.update({
      where: { id: existing.id },
      data: dto as Prisma.CompanySettingsUpdateInput,
    });
  }

  /** Name + logo only — what the login page and the app shell show. Safe to expose without auth. */
  async getBranding() {
    const { companyName, logoUrl } = await this.get();
    return { companyName, logoUrl };
  }

  async uploadLogo(buffer: Buffer | undefined) {
    const logoUrl = logoToDataUrl(buffer);
    const existing = await this.get();
    return this.prisma.companySettings.update({ where: { id: existing.id }, data: { logoUrl } });
  }

  async removeLogo() {
    const existing = await this.get();
    return this.prisma.companySettings.update({ where: { id: existing.id }, data: { logoUrl: null } });
  }
}
