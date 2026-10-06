import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { AttendanceHubPage } from './pages/attendance/AttendanceHubPage';
import { BranchDetailPage } from './pages/branches/BranchDetailPage';
import { ClassroomDetailPage } from './pages/classrooms/ClassroomDetailPage';
import { CourseDetailPage } from './pages/courses/CourseDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { EnrollmentDetailPage } from './pages/enrollments/EnrollmentDetailPage';
import { ExamDetailPage } from './pages/exams/ExamDetailPage';
import { ExamsPage } from './pages/exams/ExamsPage';
import { GroupDetailPage } from './pages/groups/GroupDetailPage';
import { GroupsPage } from './pages/groups/GroupsPage';
import { LessonAttendancePage } from './pages/lessons/LessonAttendancePage';
import { LessonDetailPage } from './pages/lessons/LessonDetailPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PaymentsHubPage } from './pages/payments/PaymentsHubPage';
import { EducationReportsPage } from './pages/reports/EducationReportsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { StudentDetailPage } from './pages/students/StudentDetailPage';
import { StudentsPage } from './pages/students/StudentsPage';
import { TeacherDetailPage } from './pages/teachers/TeacherDetailPage';
import { TeachersPage } from './pages/teachers/TeachersPage';
import { TuitionDetailPage } from './pages/tuition/TuitionDetailPage';

export default function App() {
  useAuthBootstrap();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />

          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />

          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/teachers/:id" element={<TeacherDetailPage />} />

          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/enrollments/:id" element={<EnrollmentDetailPage />} />

          <Route path="/attendance" element={<AttendanceHubPage />} />
          <Route path="/lessons/:id" element={<LessonDetailPage />} />
          <Route path="/lessons/:id/attendance" element={<LessonAttendancePage />} />

          <Route path="/payments" element={<PaymentsHubPage />} />
          <Route path="/tuition/:id" element={<TuitionDetailPage />} />

          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:id" element={<ExamDetailPage />} />

          <Route path="/reports" element={<EducationReportsPage />} />

          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/branches/:id" element={<BranchDetailPage />} />
          <Route path="/classrooms/:id" element={<ClassroomDetailPage />} />

          <Route path="/notifications" element={<NotificationsPage />} />

          {/* Older links (bookmarks, notifications created before the slimmed-down layout) */}
          <Route path="/tuition" element={<Navigate to="/payments?tab=charges" replace />} />
          <Route path="/attendance/student" element={<Navigate to="/attendance?tab=overview" replace />} />
          <Route path="/lessons" element={<Navigate to="/attendance" replace />} />
          <Route path="/education-reports" element={<Navigate to="/reports" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
