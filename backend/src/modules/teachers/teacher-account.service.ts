import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LOGIN_ACCOUNT_SELECT, LoginAccountService } from '../../shared/accounts/login-account.service.js';

/** A teacher's login — a User with the "Teacher" role, linked through User.employeeId to the teacher's Employee record. */
@Injectable()
export class TeacherAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logins: LoginAccountService,
  ) {}

  private async getEmployee(teacherProfileId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { employee: { select: { id: true, fullName: true, email: true, user: { select: LOGIN_ACCOUNT_SELECT } } } },
    });
    if (!profile) throw new NotFoundException('Teacher profile not found');
    return profile.employee;
  }

  async get(teacherProfileId: string) {
    return (await this.getEmployee(teacherProfileId)).user;
  }

  async create(teacherProfileId: string) {
    const employee = await this.getEmployee(teacherProfileId);
    if (employee.user) throw new ConflictException("Bu o'qituvchida allaqachon login bor");
    return this.logins.create({
      roleName: 'Teacher',
      fullName: employee.fullName,
      preferredEmail: employee.email,
      link: (tx, userId) => tx.user.update({ where: { id: userId }, data: { employeeId: employee.id } }),
    });
  }

  async resetPassword(teacherProfileId: string) {
    return this.logins.resetPassword((await this.get(teacherProfileId))?.id);
  }

  async setActive(teacherProfileId: string, active: boolean) {
    return this.logins.setActive((await this.get(teacherProfileId))?.id, active);
  }
}
