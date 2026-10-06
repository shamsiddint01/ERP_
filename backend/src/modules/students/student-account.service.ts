import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LOGIN_ACCOUNT_SELECT, LoginAccountService } from '../../shared/accounts/login-account.service.js';
import type { CreateLoginDto, UpdateLoginDto } from '../../shared/accounts/login-account.dto.js';

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

  async create(studentId: string, dto: CreateLoginDto) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { fullName: true, email: true, userId: true } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.userId) throw new ConflictException("Bu o'quvchida allaqachon login bor");
    return this.logins.create({
      roleName: 'Student',
      fullName: student.fullName,
      preferredEmail: student.email,
      username: dto.username,
      password: dto.password,
      link: (tx, userId) => tx.student.update({ where: { id: studentId }, data: { userId } }),
    });
  }

  async update(studentId: string, dto: UpdateLoginDto) {
    const account = await this.get(studentId);
    return this.logins.update(account?.id, dto);
  }
}
