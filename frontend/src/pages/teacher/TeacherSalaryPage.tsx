import { useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { getMySalary } from '../../api/salaries';
import { PageErrorState } from '../../components/PageErrorState';
import { PageHeader } from '../../components/PageHeader';
import { SalaryMonthDetail } from '../../components/SalaryMonthDetail';
import { currentPeriod } from '../../utils/salary';

/** Teacher → "Maosh": their % of what their groups' students paid in the month, and what the center has paid out. */
export function TeacherSalaryPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const salaryQuery = useQuery({ queryKey: ['salary', 'me', period], queryFn: () => getMySalary(period) });

  return (
    <div>
      <PageHeader
        title="Maosh"
        subtitle="Guruhlaringiz o'quvchilari to'lagan summadan sizning ulushingiz"
        extra={
          <DatePicker
            picker="month"
            allowClear={false}
            format="MM.YYYY"
            value={dayjs(`${period}-01`)}
            disabledDate={(d) => d.format('YYYY-MM') > currentPeriod()}
            onChange={(d) => d && setPeriod(d.format('YYYY-MM'))}
          />
        }
      />
      {salaryQuery.isError ? (
        <PageErrorState onRetry={() => salaryQuery.refetch()} />
      ) : salaryQuery.isLoading || !salaryQuery.data ? (
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : (
        <SalaryMonthDetail data={salaryQuery.data} />
      )}
    </div>
  );
}
