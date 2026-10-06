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
import { PortalExamsPage } from './pages/portal/PortalExamsPage';
import { PortalExtraLessonsPage } from './pages/portal/PortalExtraLessonsPage';
import { PortalGroupsPage } from './pages/portal/PortalGroupsPage';
import { PortalHomePage } from './pages/portal/PortalHomePage';
import { PortalHomeworkPage } from './pages/portal/PortalHomeworkPage';
import { PortalLayout } from './pages/portal/PortalLayout';
import { PortalPaymentsPage } from './pages/portal/PortalPaymentsPage';
import { PortalProgressPage } from './pages/portal/PortalProgressPage';
import { PortalSettingsPage } from './pages/portal/PortalSettingsPage';
import { useAuthStore } from './store/auth.store';

/** A student's own cabinet — the only app a student login ever sees. */
function PortalRoutes() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<PortalHomePage />} />
        <Route path="homework" element={<PortalHomeworkPage />} />
        <Route path="groups" element={<PortalGroupsPage />} />
        <Route path="payments" element={<PortalPaymentsPage />} />
        <Route path="exams" element={<PortalExamsPage />} />
        <Route path="progress" element={<PortalProgressPage />} />
        <Route path="extra-lessons" element={<PortalExtraLessonsPage />} />
        <Route path="settings" element={<PortalSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function StaffRoutes() {
  return (
    <Routes>
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
    </Routes>
  );
}

/** Logged-in users get one of two apps: the student portal (a login linked to a student) or the staff app. */
function AuthenticatedApp() {
  const isStudent = useAuthStore((state) => !!state.user?.studentId);
  return isStudent ? <PortalRoutes /> : <StaffRoutes />;
}

export default function App() {
  useAuthBootstrap();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/*" element={<AuthenticatedApp />} />
      </Route>
    </Routes>
  );
}
