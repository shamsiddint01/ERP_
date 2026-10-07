import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LOGIN_ACCOUNT_SELECT, LoginAccountService } from '../../shared/accounts/login-account.service.js';

/** A student's portal login — a User with the "Student" role, linked through Student.userId. */
@Injectable()
export class StudentAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logins: LoginAccountService,
  ) {}

  async get(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { user: { select: LOGIN_ACCOUNT_SELECT } } });
    if (!student) throw new NotFoundException('Student not found');
    return student.user;
  }

  async create(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { fullName: true, email: true, userId: true } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.userId) throw new ConflictException("Bu o'quvchida allaqachon login bor");
    return this.logins.create({
      roleName: 'Student',
      fullName: student.fullName,
      preferredEmail: student.email,
      link: (tx, userId) => tx.student.update({ where: { id: studentId }, data: { userId } }),
    });
  }

  async resetPassword(studentId: string) {
    return this.logins.resetPassword((await this.get(studentId))?.id);
  }

  /** Deletes only the login; the student record and its history stay. A new login can be issued right after. */
  async remove(studentId: string, actor: { id: string; username: string }) {
    return this.logins.remove((await this.get(studentId))?.id, actor);
  }

  async setActive(studentId: string, active: boolean) {
    return this.logins.setActive((await this.get(studentId))?.id, active);
  }
}
