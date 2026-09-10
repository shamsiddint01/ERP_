import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface PayrollReportFilters {
  periodId?: string;
  departmentId?: string;
  employeeId?: string;
  status?: string;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

/** Every payroll report reads straight from Payroll/PayrollLine — no separate reporting tables to keep in sync. */
@Injectable()
export class PayrollReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filters: PayrollReportFilters): Prisma.PayrollWhereInput {
    return {
      periodId: filters.periodId,
      employeeId: filters.employeeId,
      status: filters.status as never,
      ...(filters.departmentId && { employee: { departmentId: filters.departmentId } }),
    };
  }

  /** Payroll Summary / Payroll Payment Status / Payroll Expense Report — status breakdown plus totals. */
  async getSummary(filters: PayrollReportFilters) {
    const where = this.buildWhere(filters);
    const [statusCounts, totals] = await Promise.all([
      this.prisma.payroll.groupBy({ by: ['status'], where, _count: true, _sum: { grossSalary: true, netSalary: true } }),
      this.prisma.payroll.aggregate({
        where,
        _count: true,
        _sum: { baseAmount: true, overtimeAmount: true, bonusAmount: true, allowanceAmount: true, deductionAmount: true, grossSalary: true, netSalary: true },
      }),
    ]);

    return {
      employeeCount: totals._count,
      totalBase: toNumber(totals._sum.baseAmount),
      totalOvertime: toNumber(totals._sum.overtimeAmount),
      totalBonus: toNumber(totals._sum.bonusAmount),
      totalAllowance: toNumber(totals._sum.allowanceAmount),
      totalDeduction: toNumber(totals._sum.deductionAmount),
      totalGross: toNumber(totals._sum.grossSalary),
      totalNet: toNumber(totals._sum.netSalary),
      byStatus: statusCounts.map((s) => ({
        status: s.status,
        count: s._count,
        gross: toNumber(s._sum.grossSalary),
        net: toNumber(s._sum.netSalary),
      })),
    };
  }

  /** Payroll by Employee / Gross vs Net Salary report. */
  async getByEmployee(filters: PayrollReportFilters) {
    const payrolls = await this.prisma.payroll.findMany({
      where: this.buildWhere(filters),
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { name: true } } } },
        period: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payrolls.map((p) => ({
      payrollNumber: p.payrollNumber,
      period: p.period.name,
      employeeCode: p.employee.employeeCode,
      employee: p.employee.fullName,
      department: p.employee.department?.name ?? '',
      base: toNumber(p.baseAmount),
      overtime: toNumber(p.overtimeAmount),
      bonus: toNumber(p.bonusAmount),
      allowance: toNumber(p.allowanceAmount),
      deduction: toNumber(p.deductionAmount),
      gross: toNumber(p.grossSalary),
      net: toNumber(p.netSalary),
      status: p.status,
    }));
  }

  /** Payroll by Department report. */
  async getByDepartment(filters: PayrollReportFilters) {
    const payrolls = await this.prisma.payroll.findMany({
      where: this.buildWhere(filters),
      include: { employee: { select: { department: { select: { id: true, name: true } } } } },
    });

    const byDept = new Map<string, { department: string; employeeCount: number; gross: number; deduction: number; net: number }>();
    for (const p of payrolls) {
      const key = p.employee.department?.id ?? 'none';
      const name = p.employee.department?.name ?? 'Unassigned';
      const entry = byDept.get(key) ?? { department: name, employeeCount: 0, gross: 0, deduction: 0, net: 0 };
      entry.employeeCount += 1;
      entry.gross += toNumber(p.grossSalary);
      entry.deduction += toNumber(p.deductionAmount);
      entry.net += toNumber(p.netSalary);
      byDept.set(key, entry);
    }
    return Array.from(byDept.values());
  }

  /** Overtime Report. */
  async getOvertimeReport(filters: PayrollReportFilters) {
    const payrolls = await this.prisma.payroll.findMany({
      where: { ...this.buildWhere(filters), overtimeMinutes: { gt: 0 } },
      include: { employee: { select: { employeeCode: true, fullName: true } }, period: { select: { name: true } } },
      orderBy: { overtimeMinutes: 'desc' },
    });
    return payrolls.map((p) => ({
      payrollNumber: p.payrollNumber,
      period: p.period.name,
      employeeCode: p.employee.employeeCode,
      employee: p.employee.fullName,
      overtimeMinutes: p.overtimeMinutes,
      overtimeAmount: toNumber(p.overtimeAmount),
    }));
  }

  /** Allowances / Deductions report — itemized PayrollLine rows of the given type across the filtered payrolls. */
  async getComponentReport(filters: PayrollReportFilters, lineType: 'ALLOWANCE' | 'DEDUCTION' | 'BONUS') {
    const lines = await this.prisma.payrollLine.findMany({
      where: { type: lineType, payroll: this.buildWhere(filters) },
      include: {
        payroll: {
          select: {
            payrollNumber: true,
            period: { select: { name: true } },
            employee: { select: { employeeCode: true, fullName: true } },
          },
        },
        component: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return lines.map((l) => ({
      payrollNumber: l.payroll.payrollNumber,
      period: l.payroll.period.name,
      employeeCode: l.payroll.employee.employeeCode,
      employee: l.payroll.employee.fullName,
      component: l.component?.name ?? l.label,
      amount: toNumber(l.amount),
    }));
  }
}
