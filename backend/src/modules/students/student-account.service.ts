import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateStudentAccountDto, UpdateStudentAccountDto } from './dto/student-account.dto.js';

const PASSWORD_SALT_ROUNDS = 10;
const STUDENT_ROLE = 'Student';

/**
 * A student's portal login. Staff type the username and password themselves
 * and hand them to the student; the login is a regular User with the
 * "Student" role, linked through Student.userId.
 */
@Injectable()
export class StudentAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async get(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { user: { select: { id: true, username: true, status: true, lastActiveAt: true, createdAt: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student.user;
  }

  async create(studentId: string, dto: CreateStudentAccountDto) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { id: true, fullName: true, email: true, userId: true } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.userId) throw new ConflictException("Bu o'quvchida allaqachon login bor");

    const username = dto.username.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) throw new ConflictException('Bu login band');

    const role = await this.prisma.role.findUnique({ where: { name: STUDENT_ROLE } });
    if (!role) throw new InternalServerErrorException('"Student" roli topilmadi — seed ishga tushirilmagan');

    // User.email is required and unique: use the student's own email when it's free, otherwise an internal placeholder.
    const emailTaken = student.email ? await this.prisma.user.findUnique({ where: { email: student.email } }) : null;
    const email = student.email && !emailTaken ? student.email : `${username}@students.local`;

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { fullName: student.fullName, email, username, passwordHash, roleId: role.id, status: 'ACTIVE' },
        select: { id: true, username: true, status: true, lastActiveAt: true, createdAt: true },
      });
      await tx.student.update({ where: { id: studentId }, data: { userId: user.id } });
      return user;
    });
  }

  /** A new password or a block both sign the student out of every device. */
  async update(studentId: string, dto: UpdateStudentAccountDto) {
    const account = await this.get(studentId);
    if (!account) throw new NotFoundException("Bu o'quvchida login yo'q");

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS) : undefined;
    const status = dto.active === undefined ? undefined : dto.active ? 'ACTIVE' : 'SUSPENDED';
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: account.id },
        data: { ...(passwordHash && { passwordHash }), ...(status && { status }) },
        select: { id: true, username: true, status: true, lastActiveAt: true, createdAt: true },
      });
      if (passwordHash || status === 'SUSPENDED') {
        await tx.userSession.updateMany({ where: { userId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return user;
    });
  }
}
