import { Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { Public } from '../../shared/decorators/public.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { LOGO_MAX_BYTES } from './logo-image.util.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermission('settings', PermissionAction.VIEW)
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @RequirePermission('settings', PermissionAction.EDIT)
  @Audited('CompanySettings')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }

  /** Public on purpose: the login page shows the center's name and logo before anyone signs in. */
  @Public()
  @Get('branding')
  branding() {
    return this.settingsService.getBranding();
  }

  // Not @Audited: the audit diff would copy the whole inline image into audit_logs on every upload.
  @Post('logo')
  @RequirePermission('settings', PermissionAction.EDIT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }))
  uploadLogo(@UploadedFile() file: { buffer: Buffer } | undefined) {
    return this.settingsService.uploadLogo(file?.buffer);
  }

  @Delete('logo')
  @RequirePermission('settings', PermissionAction.EDIT)
  removeLogo() {
    return this.settingsService.removeLogo();
  }
}
