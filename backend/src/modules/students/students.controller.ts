import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { LinkGuardianDto } from './dto/link-guardian.dto.js';
import { QueryStudentDto } from './dto/query-student.dto.js';
import { UpdateGuardianLinkDto } from './dto/update-guardian-link.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @RequirePermission('students', PermissionAction.VIEW)
  findAll(@Query() query: QueryStudentDto) {
    return this.studentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('students', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.findOne(id);
  }

  @Post()
  @RequirePermission('students', PermissionAction.CREATE)
  @Audited('Student')
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('students', PermissionAction.DELETE)
  @Audited('Student', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.remove(id);
  }

  @Post(':id/guardians')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student', 'GUARDIAN_LINK')
  addGuardian(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkGuardianDto) {
    return this.studentsService.addGuardian(id, dto);
  }

  @Patch(':id/guardians/:guardianId')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student', 'GUARDIAN_LINK_UPDATE')
  updateGuardianLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body() dto: UpdateGuardianLinkDto,
  ) {
    return this.studentsService.updateGuardianLink(id, guardianId, dto);
  }

  @Delete(':id/guardians/:guardianId')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student', 'GUARDIAN_UNLINK')
  removeGuardian(@Param('id', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) guardianId: string) {
    return this.studentsService.removeGuardian(id, guardianId);
  }
}
