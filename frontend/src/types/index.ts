export type PermissionActionValue = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT';

export interface CurrentUserProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  lastActiveAt: string | null;
  permissions: string[];
}

export interface UserListItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  username: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_INVITE';
  lastActiveAt: string | null;
  createdAt: string;
  role: { id: string; name: string };
}

export interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  createdAt: string;
  _count: { users: number; rolePermissions: number };
}

export interface RoleDetail extends RoleListItem {
  rolePermissions: Array<{
    permission: { id: string; module: string; action: PermissionActionValue };
  }>;
}

export type PermissionCatalog = Record<string, PermissionActionValue[]>;

export interface CompanySettings {
  id: string;
  companyName: string;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  defaultLanguage: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Phase J — the education-center executive dashboard. Every key is present only when the caller's own permissions cover it (see DashboardService's doc comment on the backend); the frontend hides whatever's missing rather than showing a placeholder. */
export interface DashboardOverview {
  kpis: {
    totalStudents?: number;
    activeStudents?: number;
    newStudentsThisMonth?: number;
    activeGroups?: number;
    totalTeachers?: number;
    todaysLessons?: number;
    todaysAttendancePercentage?: number;
    absentStudentsToday?: number;
    overdueTuition?: number;
    outstandingStudentDebt?: number;
    tuitionCollectedThisMonth?: number;
    upcomingExams?: number;
    unreadNotifications: number;
  };
  actionRequired: { key: string; value: number; to: string }[];
}

export interface DashboardScheduleRow {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  group: { id: string; name: string };
  teacherEmployee: { id: string; fullName: string } | null;
  classroom: { id: string; name: string } | null;
  branch: { id: string; name: string };
}

export interface DashboardToday {
  schedule: DashboardScheduleRow[];
  attendance: { present: number; absent: number; late: number; excused: number; total: number; attendancePercentage: number } | null;
  recentPayments: DashboardRecentPayment[];
}

export interface DashboardRecentPayment {
  id: string;
  paymentNumber: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
  studentId: string | null;
  studentName: string | null;
}

export interface DashboardCharts {
  studentGrowth?: { month: string; count: number }[];
  studentsByBranch?: { branchId: string | null; branchName: string; count: number }[];
  enrollmentTrend?: { month: string; count: number }[];
  groupCapacityUtilization?: { groupId: string; name: string; capacity: number; enrolledCount: number; utilizationPercentage: number }[];
  studentsByCourse?: { courseId: string; courseName: string; studentCount: number }[];
  tuitionCollection?: { month: string; amount: number }[];
  /** null = no attendance marked that day (drawn as a gap, never as 0%). */
  attendanceTrend?: { date: string; attendancePercentage: number | null }[];
  /** null = no graded assessments that month. */
  academicPerformance?: { month: string; averageScore: number | null }[];
}

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'ONLINE' | 'CHEQUE';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface Payment {
  id: string;
  paymentNumber: string;
  direction: 'INBOUND' | 'OUTBOUND';
  amount: string;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  referenceType: 'TUITION_CHARGE' | null;
  /** The payer Student's id. */
  referenceId: string | null;
  student: { id: string; studentCode: string; fullName: string } | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  recordedBy: { id: string; fullName: string; username: string } | null;
}

// =========================================================================
// NOTIFICATIONS (Phase 9)
// =========================================================================

export type NotificationType =
  | 'SYSTEM'
  | 'STUDENT_ABSENT'
  | 'STUDENT_LATE'
  | 'STUDENT_REPEATED_ABSENCE'
  | 'TUITION_DUE'
  | 'TUITION_OVERDUE'
  | 'TUITION_PAYMENT_RECEIVED'
  | 'EXAM_UPCOMING'
  | 'GRADES_PUBLISHED';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface NotificationItem {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage extends PaginatedResult<NotificationItem> {
  unreadCount: number;
}

export interface NotificationQuery {
  page?: number;
  pageSize?: number;
  isRead?: boolean;
  type?: NotificationType;
  from?: string;
  to?: string;
}

// =========================================================================
// EDUCATION CENTER — STUDENTS — Phase B
// =========================================================================

export type StudentStatus = 'ACTIVE' | 'PAUSED' | 'GRADUATED' | 'INACTIVE' | 'LEFT';

export interface StudentListItem {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  status: StudentStatus;
  registrationDate: string;
  source: string | null;
  branchId: string | null;
  branch: { id: string; name: string; code: string } | null;
  createdAt: string;
  _count: { enrollments: number };
}

export interface StudentEnrollmentItem {
  id: string;
  studentId: string;
  groupId: string;
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  agreedTuition: string | null;
  discountAmount: string | null;
  notes: string | null;
  createdAt: string;
  group: {
    id: string;
    name: string;
    code: string;
    status: StudentGroupStatus;
    course: { id: string; name: string; code: string };
    branch: { id: string; name: string; code: string };
    teacherEmployee: { id: string; fullName: string } | null;
  };
}

export interface StudentDetail extends StudentListItem {
  address: string | null;
  photoUrl: string | null;
  emergencyContact: string | null;
  notes: string | null;
  userId: string | null;
  user: { id: string; username: string; status: string } | null;
  updatedAt: string;
  enrollments: StudentEnrollmentItem[];
}

// =========================================================================
// EDUCATION CENTER — COURSE CATEGORIES / COURSES / BRANCHES / CLASSROOMS — Phase C
// =========================================================================

export type CourseCategoryStatus = 'ACTIVE' | 'INACTIVE';
export type CourseStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type CourseLevel = 'BEGINNER' | 'ELEMENTARY' | 'PRE_INTERMEDIATE' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED';
export type BranchStatus = 'ACTIVE' | 'INACTIVE';
export type ClassroomStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface CourseCategoryListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: CourseCategoryStatus;
  createdAt: string;
  _count: { courses: number };
}

export interface CourseListItem {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string; code: string } | null;
  name: string;
  code: string;
  description: string | null;
  level: CourseLevel | null;
  durationWeeks: number | null;
  lessonDurationMinutes: number;
  defaultTuition: string;
  status: CourseStatus;
  createdAt: string;
  _count: { studentGroups: number };
}

export type CourseDetail = CourseListItem;

export interface BranchListItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  managerEmployeeId: string | null;
  managerEmployee: { id: string; fullName: string } | null;
  workingHours: string | null;
  notes: string | null;
  status: BranchStatus;
  createdAt: string;
  _count: { classrooms: number; students: number; studentGroups: number };
}

export interface BranchDetail extends Omit<BranchListItem, '_count'> {
  classrooms: Array<{ id: string; name: string; roomNumber: string; capacity: number; status: ClassroomStatus }>;
  _count: { students: number };
  activeGroupCount: number;
}

export interface ClassroomListItem {
  id: string;
  branchId: string;
  branch: { id: string; name: string; code: string };
  name: string;
  roomNumber: string;
  capacity: number;
  equipment: string | null;
  notes: string | null;
  status: ClassroomStatus;
  createdAt: string;
  _count: { studentGroups: number };
}

export type ClassroomDetail = ClassroomListItem;

// =========================================================================
// EDUCATION CENTER — GROUPS / TEACHER PROFILES / ENROLLMENTS — Phase D
// =========================================================================

export type StudentGroupStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type TeacherProfileStatus = 'ACTIVE' | 'INACTIVE';
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CANCELLED' | 'TRANSFERRED';

export interface GroupListItem {
  id: string;
  code: string;
  name: string;
  courseId: string;
  course: { id: string; name: string; code: string };
  branchId: string;
  branch: { id: string; name: string; code: string };
  classroomId: string | null;
  classroom: { id: string; name: string; roomNumber: string } | null;
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  capacity: number;
  tuitionAmount: string | null;
  level: CourseLevel | null;
  startDate: string;
  endDate: string | null;
  status: StudentGroupStatus;
  notes: string | null;
  createdAt: string;
  enrolledCount: number;
  availableSeats: number;
}

export interface GroupDetail extends GroupListItem {
  enrollments: Array<{
    id: string;
    studentId: string;
    student: { id: string; studentCode: string; fullName: string; status: StudentStatus };
    groupId: string;
    startDate: string;
    endDate: string | null;
    status: EnrollmentStatus;
    agreedTuition: string | null;
    discountAmount: string | null;
    notes: string | null;
    createdAt: string;
  }>;
}

export interface TeacherEmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  hireDate: string;
}

export interface TeacherListItem {
  id: string;
  employeeId: string;
  employee: TeacherEmployeeSummary & { _count: { taughtGroups: number } };
  bio: string | null;
  specialization: string | null;
  qualification: string | null;
  experienceYears: number | null;
  status: TeacherProfileStatus;
  hourlyRate: string | null;
  perLessonRate: string | null;
  perGroupRate: string | null;
  createdAt: string;
}

export interface TeacherDetail extends Omit<TeacherListItem, 'employee'> {
  employee: TeacherEmployeeSummary;
  groups: Array<{
    id: string;
    code: string;
    name: string;
    status: StudentGroupStatus;
    capacity: number;
    startDate: string;
    endDate: string | null;
    course: { id: string; name: string; code: string };
    branch: { id: string; name: string; code: string };
    enrolledCount: number;
  }>;
  workload: { activeGroupsCount: number; activeStudentsCount: number; totalEnrolledStudents: number };
}

export interface EnrollmentListItem {
  id: string;
  studentId: string;
  student: { id: string; studentCode: string; fullName: string; status: StudentStatus };
  groupId: string;
  group: {
    id: string;
    name: string;
    code: string;
    status: StudentGroupStatus;
    capacity: number;
    tuitionAmount: string | null;
    course: { id: string; name: string; code: string };
    branch: { id: string; name: string; code: string };
    teacherEmployee: { id: string; fullName: string } | null;
  };
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  agreedTuition: string | null;
  discountAmount: string | null;
  notes: string | null;
  createdAt: string;
}

export type EnrollmentDetail = EnrollmentListItem;

export interface TransferredEnrollment extends EnrollmentDetail {
  transferredTo: EnrollmentDetail;
}

// =========================================================================
// EDUCATION CENTER — SCHEDULES / LESSON SESSIONS — Phase E
// =========================================================================

export type ScheduleDayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type ScheduleRecurrenceType = 'WEEKLY';
export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type LessonStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface ScheduleListItem {
  id: string;
  groupId: string;
  group: { id: string; name: string; code: string; status: StudentGroupStatus };
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  classroomId: string | null;
  classroom: { id: string; name: string; roomNumber: string } | null;
  branchId: string;
  branch: { id: string; name: string; code: string };
  dayOfWeek: ScheduleDayOfWeek;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
  recurrenceType: ScheduleRecurrenceType;
  status: ScheduleStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleDetail = ScheduleListItem;

export interface GenerateLessonsResult extends ScheduleDetail {
  generatedCount: number;
  skippedCount: number;
  lessons: LessonListItem[];
}

export interface LessonListItem {
  id: string;
  groupId: string;
  group: { id: string; name: string; code: string };
  scheduleId: string | null;
  schedule: { id: string; dayOfWeek: ScheduleDayOfWeek; startTime: string; endTime: string } | null;
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  classroomId: string | null;
  classroom: { id: string; name: string; roomNumber: string } | null;
  branchId: string;
  branch: { id: string; name: string; code: string };
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  topic: string | null;
  homework: string | null;
  notes: string | null;
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
}

export type LessonDetail = LessonListItem;

// =========================================================================
// STUDENT ATTENDANCE — Phase F
// =========================================================================

export type StudentAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface StudentAttendanceListItem {
  id: string;
  lessonId: string;
  lesson: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: LessonStatus;
    topic: string | null;
    groupId: string;
    group: { id: string; name: string; code: string };
    teacherEmployeeId: string | null;
    teacherEmployee: { id: string; fullName: string } | null;
    branchId: string;
    branch: { id: string; name: string; code: string };
  };
  studentId: string;
  student: { id: string; studentCode: string; fullName: string };
  enrollmentId: string | null;
  enrollment: { id: string; startDate: string; endDate: string | null; status: EnrollmentStatus } | null;
  status: StudentAttendanceStatus;
  markedAt: string;
  markedBy: { id: string; fullName: string };
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudentAttendanceDetail = StudentAttendanceListItem;

export interface AttendanceSummary {
  totalMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  markedAttendancePercentage: number;
}

export interface StudentAttendanceHistoryRecord {
  lessonId: string;
  scheduledStart: string;
  topic: string | null;
  group: { id: string; name: string; code: string };
  status: StudentAttendanceStatus | 'UNMARKED';
  notes: string | null;
  attendanceId: string | null;
}

export interface StudentAttendanceSummary {
  studentId: string;
  eligibleLessons: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
  attendancePercentage: number;
  records: StudentAttendanceHistoryRecord[];
}

export interface GroupAttendanceStudentRow {
  student: { id: string; studentCode: string; fullName: string };
  enrollmentId: string;
  eligibleLessons: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
  attendancePercentage: number;
}

export interface GroupAttendanceSummary {
  groupId: string;
  groupName: string;
  totalLessons: number;
  students: GroupAttendanceStudentRow[];
}

export interface BulkAttendanceResult {
  id: string;
  lessonId: string;
  markedCount: number;
  results: StudentAttendanceListItem[];
}

// =========================================================================
// TUITION BILLING, PAYMENTS, DISCOUNTS & STUDENT BALANCES — Phase G
// =========================================================================

export type TuitionChargeStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type DiscountType = 'PERCENTAGE' | 'FIXED' | 'SIBLING' | 'SCHOLARSHIP' | 'PROMOTIONAL' | 'CUSTOM';

export interface TuitionAllocationRecord {
  id: string;
  amount: string;
  createdAt: string;
  payment: { id: string; paymentNumber: string; method: PaymentMethod; paidAt: string | null };
  allocatedBy: { id: string; fullName: string };
}

export interface TuitionCharge {
  id: string;
  studentId: string;
  student: { id: string; studentCode: string; fullName: string };
  enrollmentId: string;
  enrollment: {
    id: string;
    startDate: string;
    endDate: string | null;
    status: EnrollmentStatus;
    group: { id: string; name: string; code: string; branch: { id: string; name: string } };
  };
  billingPeriod: string;
  amount: string;
  discountAmount: string;
  netAmount: string;
  dueDate: string;
  status: TuitionChargeStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  allocations: TuitionAllocationRecord[];
}

export interface StudentBalance {
  studentId: string;
  totalBilled: number;
  discounts: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

export interface StudentFinancialSummaryCharge extends TuitionCharge {
  allocatedAmount: number;
  outstanding: number;
}

export interface StudentFinancialSummaryPayment extends Payment {
  allocatedAmount: number;
  unallocatedAmount: number;
  tuitionAllocations: Array<{ id: string; amount: string; tuitionChargeId: string }>;
}

export interface StudentFinancialSummaryAllocation {
  id: string;
  amount: string;
  createdAt: string;
  tuitionChargeId: string;
  billingPeriod: string;
  payment: { id: string; paymentNumber: string; method: PaymentMethod };
}

export interface StudentDiscount {
  id: string;
  studentId: string;
  discountId: string;
  discount: Discount;
  enrollmentId: string | null;
  enrollment: { id: string; group: { id: string; name: string } } | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

export interface StudentFinancialSummary {
  balance: StudentBalance;
  charges: StudentFinancialSummaryCharge[];
  payments: StudentFinancialSummaryPayment[];
  allocationHistory: StudentFinancialSummaryAllocation[];
  discounts: StudentDiscount[];
}

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  value: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// EXAMS, GRADES, ACADEMIC PROGRESS & TEACHER COMPENSATION — Phase H
// =========================================================================

export type ExamType = 'QUIZ' | 'MIDTERM' | 'FINAL' | 'MOCK' | 'PLACEMENT' | 'OTHER';
export type ExamStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface Exam {
  id: string;
  title: string;
  courseId: string;
  course: { id: string; name: string; code: string };
  groupId: string;
  group: { id: string; name: string; code: string; teacherEmployeeId: string | null; branch: { id: string; name: string } };
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  date: string;
  maxScore: string;
  passingScore: string;
  type: ExamType;
  status: ExamStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { assessments: number };
}

export interface Assessment {
  id: string;
  examId: string;
  studentId: string;
  student: { id: string; studentCode: string; fullName: string };
  score: string;
  percentage: string;
  grade: string;
  comment: string | null;
  evaluatedBy: { id: string; fullName: string };
  evaluatedAt: string;
  exam: { id: string; title: string; maxScore: string; passingScore: string; date: string; type: ExamType; status: ExamStatus };
}

export interface StudentGradeItem {
  id: string;
  examId: string;
  examTitle: string;
  examType: ExamType;
  examDate: string;
  course: { id: string; name: string; code: string };
  group: { id: string; name: string; code: string };
  score: number;
  maxScore: number;
  passingScore: number;
  percentage: number;
  grade: string;
  passed: boolean;
  comment: string | null;
  evaluatedAt: string;
}

export interface StudentGrades {
  studentId: string;
  items: StudentGradeItem[];
}

export interface StudentCourseProgress {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  totalLessons: number;
  completedLessons: number;
  progressPercentage: number;
}

export interface StudentCompletedGroup {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  endDate: string | null;
}

export interface StudentProgress {
  studentId: string;
  totalExams: number;
  averagePercentage: number;
  passRate: number;
  attendancePercentage: number;
  courseProgress: StudentCourseProgress[];
  completedGroups: StudentCompletedGroup[];
  recentExams: StudentGradeItem[];
}

export interface GroupExamResult {
  examId: string;
  title: string;
  type: ExamType;
  date: string;
  status: ExamStatus;
  maxScore: number;
  passingScore: number;
  assessedCount: number;
  totalEnrolled: number;
  average: number;
  passRate: number;
}

export interface GroupResults {
  groupId: string;
  groupName: string;
  totalEnrolled: number;
  exams: GroupExamResult[];
  overallAverage: number;
  overallPassRate: number;
}

