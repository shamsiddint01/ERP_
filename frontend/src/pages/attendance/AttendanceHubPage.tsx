import { BarChartOutlined, CarryOutOutlined } from '@ant-design/icons';
import { SectionHub } from '../../components/SectionHub';
import { LessonsPage } from '../lessons/LessonsPage';
import { StudentAttendanceOverviewPage } from './StudentAttendanceOverviewPage';

export function AttendanceHubPage() {
  return (
    <SectionHub
      tabs={[
        { key: 'lessons', label: 'Darslar', icon: <CarryOutOutlined />, permission: { module: 'lessons', action: 'VIEW' }, element: <LessonsPage /> },
        {
          key: 'overview',
          label: 'Davomat hisoboti',
          icon: <BarChartOutlined />,
          permission: { module: 'student_attendance', action: 'VIEW' },
          element: <StudentAttendanceOverviewPage />,
        },
      ]}
    />
  );
}
