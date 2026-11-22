import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandLoader } from './components/brand/BrandLoader.tsx';
import { ProtectedRoute } from './components/auth/ProtectedRoute.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { ParentLayout } from './layouts/ParentLayout.tsx';
import { PublicLayout } from './layouts/PublicLayout.tsx';
import { SchoolAdminLayout } from './layouts/SchoolAdminLayout.tsx';
import { StudentLayout } from './layouts/StudentLayout.tsx';
import { TeacherLayout } from './layouts/TeacherLayout.tsx';
import { WorkersLayout } from './layouts/WorkersLayout.tsx';

// Public pages (code-split)
const HomePage = lazy(() =>
  import('./pages/public/HomePage.tsx').then((m) => ({ default: m.HomePage })),
);
const AboutPage = lazy(() =>
  import('./pages/public/AboutPage.tsx').then((m) => ({ default: m.AboutPage })),
);
const FeaturesPage = lazy(() =>
  import('./pages/public/FeaturesPage.tsx').then((m) => ({ default: m.FeaturesPage })),
);
const ContactPage = lazy(() =>
  import('./pages/public/ContactPage.tsx').then((m) => ({ default: m.ContactPage })),
);
const RegisterSchoolPage = lazy(() =>
  import('./pages/public/RegisterSchoolPage.tsx').then((m) => ({
    default: m.RegisterSchoolPage,
  })),
);
const NotFoundPage = lazy(() =>
  import('./pages/public/NotFoundPage.tsx').then((m) => ({ default: m.NotFoundPage })),
);
const PublicSchoolSitePage = lazy(() =>
  import('./pages/public/school-site/PublicSchoolSitePage.tsx').then((m) => ({ default: m.PublicSchoolSitePage })),
);
const PublicSchoolAdmissionsPage = lazy(() =>
  import('./pages/public/school-site/PublicSchoolAdmissionsPage.tsx').then((m) => ({ default: m.PublicSchoolAdmissionsPage })),
);

// Authentication pages (code-split)
const WorkersLoginPage = lazy(() =>
  import('./pages/auth/WorkersLoginPage.tsx').then((m) => ({ default: m.WorkersLoginPage })),
);
const SchoolLoginPage = lazy(() =>
  import('./pages/auth/SchoolLoginPage.tsx').then((m) => ({ default: m.SchoolLoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage.tsx').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage.tsx').then((m) => ({ default: m.ResetPasswordPage })),
);

// Platform Owner & Workforce pages (code-split)
const OwnerOverviewPage = lazy(() =>
  import('./pages/platform-owner/OwnerOverviewPage.tsx').then((m) => ({
    default: m.OwnerOverviewPage,
  })),
);
const OwnerSchoolsPage = lazy(() =>
  import('./pages/platform-owner/OwnerSchoolsPage.tsx').then((m) => ({
    default: m.OwnerSchoolsPage,
  })),
);
const OwnerSchoolVerificationPage = lazy(() =>
  import('./pages/platform-owner/OwnerSchoolVerificationPage.tsx').then((m) => ({
    default: m.OwnerSchoolVerificationPage,
  })),
);
const OwnerWorkforcePage = lazy(() =>
  import('./pages/platform-owner/OwnerWorkforcePage.tsx').then((m) => ({
    default: m.OwnerWorkforcePage,
  })),
);
const OwnerDatabasePage = lazy(() =>
  import('./pages/platform-owner/OwnerDatabasePage.tsx').then((m) => ({
    default: m.OwnerDatabasePage,
  })),
);
const OwnerFilesPage = lazy(() =>
  import('./pages/platform-owner/OwnerFilesPage.tsx').then((m) => ({
    default: m.OwnerFilesPage,
  })),
);
const OwnerNotificationsPage = lazy(() =>
  import('./pages/platform-owner/OwnerNotificationsPage.tsx').then((m) => ({
    default: m.OwnerNotificationsPage,
  })),
);
const OwnerSettingsPage = lazy(() =>
  import('./pages/platform-owner/OwnerSettingsPage.tsx').then((m) => ({
    default: m.OwnerSettingsPage,
  })),
);
const OwnerSecurityPage = lazy(() =>
  import('./pages/platform-owner/OwnerSecurityPage.tsx').then((m) => ({
    default: m.OwnerSecurityPage,
  })),
);
const OwnerAuditLogsPage = lazy(() =>
  import('./pages/platform-owner/OwnerAuditLogsPage.tsx').then((m) => ({
    default: m.OwnerAuditLogsPage,
  })),
);
const OwnerAiCorePage = lazy(() =>
  import('./pages/platform-owner/OwnerAiCorePage.tsx').then((m) => ({
    default: m.OwnerAiCorePage,
  })),
);

// School Administration pages (Phase 1 & 1.5 + Phase 2 code-split)
const SchoolOverviewPage = lazy(() =>
  import('./pages/school-admin/SchoolOverviewPage.tsx').then((m) => ({
    default: m.SchoolOverviewPage,
  })),
);
const SchoolProfilePage = lazy(() =>
  import('./pages/school-admin/SchoolProfilePage.tsx').then((m) => ({
    default: m.SchoolProfilePage,
  })),
);
const SchoolSettingsPage = lazy(() =>
  import('./pages/school-admin/SchoolSettingsPage.tsx').then((m) => ({
    default: m.SchoolSettingsPage,
  })),
);
const SchoolSessionsPage = lazy(() =>
  import('./pages/school-admin/SchoolSessionsPage.tsx').then((m) => ({
    default: m.SchoolSessionsPage,
  })),
);
const SchoolMembersPage = lazy(() =>
  import('./pages/school-admin/SchoolMembersPage.tsx').then((m) => ({
    default: m.SchoolMembersPage,
  })),
);
const SchoolFilesPage = lazy(() =>
  import('./pages/school-admin/SchoolFilesPage.tsx').then((m) => ({
    default: m.SchoolFilesPage,
  })),
);
const SchoolNotificationsPage = lazy(() =>
  import('./pages/school-admin/SchoolNotificationsPage.tsx').then((m) => ({
    default: m.SchoolNotificationsPage,
  })),
);
const SchoolAuditLogsPage = lazy(() =>
  import('./pages/school-admin/SchoolAuditLogsPage.tsx').then((m) => ({
    default: m.SchoolAuditLogsPage,
  })),
);
const SchoolAiCorePage = lazy(() =>
  import('./pages/school-admin/SchoolAiCorePage.tsx').then((m) => ({
    default: m.SchoolAiCorePage,
  })),
);

// Phase 2 — Students
const StudentsPage = lazy(() =>
  import('./pages/school-admin/students/StudentsPage.tsx').then((m) => ({
    default: m.StudentsPage,
  })),
);
const StudentRegistrationPage = lazy(() =>
  import('./pages/school-admin/students/StudentRegistrationPage.tsx').then((m) => ({
    default: m.StudentRegistrationPage,
  })),
);
const StudentProfilePage = lazy(() =>
  import('./pages/school-admin/students/StudentProfilePage.tsx').then((m) => ({
    default: m.StudentProfilePage,
  })),
);
const StudentEditPage = lazy(() =>
  import('./pages/school-admin/students/StudentEditPage.tsx').then((m) => ({
    default: m.StudentEditPage,
  })),
);
const StudentDocumentsPage = lazy(() =>
  import('./pages/school-admin/students/StudentDocumentsPage.tsx').then((m) => ({
    default: m.StudentDocumentsPage,
  })),
);
const StudentPromotionHistoryPage = lazy(() =>
  import('./pages/school-admin/students/StudentPromotionHistoryPage.tsx').then((m) => ({
    default: m.StudentPromotionHistoryPage,
  })),
);

// Phase 2 — Teachers
const TeachersPage = lazy(() =>
  import('./pages/school-admin/teachers/TeachersPage.tsx').then((m) => ({
    default: m.TeachersPage,
  })),
);
const TeacherRegistrationPage = lazy(() =>
  import('./pages/school-admin/teachers/TeacherRegistrationPage.tsx').then((m) => ({
    default: m.TeacherRegistrationPage,
  })),
);
const AdminTeacherProfilePage = lazy(() =>
  import('./pages/school-admin/teachers/TeacherProfilePage.tsx').then((m) => ({
    default: m.TeacherProfilePage,
  })),
);
const TeacherEditPage = lazy(() =>
  import('./pages/school-admin/teachers/TeacherEditPage.tsx').then((m) => ({
    default: m.TeacherEditPage,
  })),
);
const TeacherDocumentsPage = lazy(() =>
  import('./pages/school-admin/teachers/TeacherDocumentsPage.tsx').then((m) => ({
    default: m.TeacherDocumentsPage,
  })),
);

// Phase 2 — Parents & Guardians
const ParentsPage = lazy(() =>
  import('./pages/school-admin/parents/ParentsPage.tsx').then((m) => ({
    default: m.ParentsPage,
  })),
);
const ParentRegistrationPage = lazy(() =>
  import('./pages/school-admin/parents/ParentRegistrationPage.tsx').then((m) => ({
    default: m.ParentRegistrationPage,
  })),
);
const ParentProfilePage = lazy(() =>
  import('./pages/school-admin/parents/ParentProfilePage.tsx').then((m) => ({
    default: m.ParentProfilePage,
  })),
);
const ParentWardManagementPage = lazy(() =>
  import('./pages/school-admin/parents/ParentWardManagementPage.tsx').then((m) => ({
    default: m.ParentWardManagementPage,
  })),
);

// Phase 2 — Classes & Arms
const ClassesPage = lazy(() =>
  import('./pages/school-admin/classes/ClassesPage.tsx').then((m) => ({
    default: m.ClassesPage,
  })),
);
const CreateClassPage = lazy(() =>
  import('./pages/school-admin/classes/CreateClassPage.tsx').then((m) => ({
    default: m.CreateClassPage,
  })),
);
const ClassDetailsPage = lazy(() =>
  import('./pages/school-admin/classes/ClassDetailsPage.tsx').then((m) => ({
    default: m.ClassDetailsPage,
  })),
);
const ClassStudentsPage = lazy(() =>
  import('./pages/school-admin/classes/ClassStudentsPage.tsx').then((m) => ({
    default: m.ClassStudentsPage,
  })),
);
const ClassTeachersPage = lazy(() =>
  import('./pages/school-admin/classes/ClassTeachersPage.tsx').then((m) => ({
    default: m.ClassTeachersPage,
  })),
);

// Phase 2 — Subjects
const SubjectsPage = lazy(() =>
  import('./pages/school-admin/subjects/SubjectsPage.tsx').then((m) => ({
    default: m.SubjectsPage,
  })),
);
const CreateSubjectPage = lazy(() =>
  import('./pages/school-admin/subjects/CreateSubjectPage.tsx').then((m) => ({
    default: m.CreateSubjectPage,
  })),
);
const SubjectDetailsPage = lazy(() =>
  import('./pages/school-admin/subjects/SubjectDetailsPage.tsx').then((m) => ({
    default: m.SubjectDetailsPage,
  })),
);
const SubjectAssignmentsPage = lazy(() =>
  import('./pages/school-admin/subjects/SubjectAssignmentsPage.tsx').then((m) => ({
    default: m.SubjectAssignmentsPage,
  })),
);

// Phase 2 — Admissions
const AdmissionsPage = lazy(() =>
  import('./pages/school-admin/admissions/AdmissionsPage.tsx').then((m) => ({
    default: m.AdmissionsPage,
  })),
);
const AdmissionApplicationsPage = lazy(() =>
  import('./pages/school-admin/admissions/AdmissionApplicationsPage.tsx').then((m) => ({
    default: m.AdmissionApplicationsPage,
  })),
);
const AdmissionDetailsPage = lazy(() =>
  import('./pages/school-admin/admissions/AdmissionDetailsPage.tsx').then((m) => ({
    default: m.AdmissionDetailsPage,
  })),
);
const NewAdmissionPage = lazy(() =>
  import('./pages/school-admin/admissions/NewAdmissionPage.tsx').then((m) => ({
    default: m.NewAdmissionPage,
  })),
);

// Teacher pages (code-split)
const TeacherWorkspacePage = lazy(() =>
  import('./pages/teachers/TeacherWorkspacePage.tsx').then((m) => ({
    default: m.TeacherWorkspacePage,
  })),
);
const TeacherSessionsPage = lazy(() =>
  import('./pages/teachers/TeacherSessionsPage.tsx').then((m) => ({
    default: m.TeacherSessionsPage,
  })),
);
const TeacherFilesPage = lazy(() =>
  import('./pages/teachers/TeacherFilesPage.tsx').then((m) => ({
    default: m.TeacherFilesPage,
  })),
);
const TeacherNotificationsPage = lazy(() =>
  import('./pages/teachers/TeacherNotificationsPage.tsx').then((m) => ({
    default: m.TeacherNotificationsPage,
  })),
);
const TeacherAiCorePage = lazy(() =>
  import('./pages/teachers/TeacherAiCorePage.tsx').then((m) => ({
    default: m.TeacherAiCorePage,
  })),
);
const TeacherProfilePage = lazy(() =>
  import('./pages/teachers/TeacherProfilePage.tsx').then((m) => ({
    default: m.TeacherProfilePage,
  })),
);

// Student pages (code-split)
const StudentOverviewPage = lazy(() =>
  import('./pages/students/StudentOverviewPage.tsx').then((m) => ({
    default: m.StudentOverviewPage,
  })),
);
const StudentTermPage = lazy(() =>
  import('./pages/students/StudentTermPage.tsx').then((m) => ({
    default: m.StudentTermPage,
  })),
);
const StudentFilesPage = lazy(() =>
  import('./pages/students/StudentFilesPage.tsx').then((m) => ({
    default: m.StudentFilesPage,
  })),
);
const StudentNotificationsPage = lazy(() =>
  import('./pages/students/StudentNotificationsPage.tsx').then((m) => ({
    default: m.StudentNotificationsPage,
  })),
);
const StudentAccountPage = lazy(() =>
  import('./pages/students/StudentAccountPage.tsx').then((m) => ({
    default: m.StudentAccountPage,
  })),
);

// Parent pages (code-split)
const ParentOverviewPage = lazy(() =>
  import('./pages/parents/ParentOverviewPage.tsx').then((m) => ({
    default: m.ParentOverviewPage,
  })),
);
const ParentWardsPage = lazy(() =>
  import('./pages/parents/ParentWardsPage.tsx').then((m) => ({
    default: m.ParentWardsPage,
  })),
);
const ParentCalendarPage = lazy(() =>
  import('./pages/parents/ParentCalendarPage.tsx').then((m) => ({
    default: m.ParentCalendarPage,
  })),
);
const ParentNotificationsPage = lazy(() =>
  import('./pages/parents/ParentNotificationsPage.tsx').then((m) => ({
    default: m.ParentNotificationsPage,
  })),
);

// Phase 3 — School Admin Academic Management & Results Engine (code-split)
const AcademicOverviewPage = lazy(() =>
  import('./pages/school-admin/academics/AcademicOverviewPage.tsx').then((m) => ({
    default: m.AcademicOverviewPage,
  })),
);
const AcademicSessionsPage = lazy(() =>
  import('./pages/school-admin/academics/AcademicSessionsPage.tsx').then((m) => ({
    default: m.AcademicSessionsPage,
  })),
);
const AcademicSessionDetailsPage = lazy(() =>
  import('./pages/school-admin/academics/AcademicSessionDetailsPage.tsx').then((m) => ({
    default: m.AcademicSessionDetailsPage,
  })),
);
const TermsPage = lazy(() =>
  import('./pages/school-admin/academics/TermsPage.tsx').then((m) => ({
    default: m.TermsPage,
  })),
);
const AcademicCalendarPage = lazy(() =>
  import('./pages/school-admin/academics/AcademicCalendarPage.tsx').then((m) => ({
    default: m.AcademicCalendarPage,
  })),
);
const SubjectEnrollmentPage = lazy(() =>
  import('./pages/school-admin/academics/SubjectEnrollmentPage.tsx').then((m) => ({
    default: m.SubjectEnrollmentPage,
  })),
);
const AssessmentConfigurationPage = lazy(() =>
  import('./pages/school-admin/academics/AssessmentConfigurationPage.tsx').then((m) => ({
    default: m.AssessmentConfigurationPage,
  })),
);
const AssessmentComponentsPage = lazy(() =>
  import('./pages/school-admin/academics/AssessmentComponentsPage.tsx').then((m) => ({
    default: m.AssessmentComponentsPage,
  })),
);
const ExaminationManagementPage = lazy(() =>
  import('./pages/school-admin/academics/ExaminationManagementPage.tsx').then((m) => ({
    default: m.ExaminationManagementPage,
  })),
);
const GradingSystemsPage = lazy(() =>
  import('./pages/school-admin/academics/GradingSystemsPage.tsx').then((m) => ({
    default: m.GradingSystemsPage,
  })),
);
const ResultManagementPage = lazy(() =>
  import('./pages/school-admin/academics/ResultManagementPage.tsx').then((m) => ({
    default: m.ResultManagementPage,
  })),
);
const ResultReviewPage = lazy(() =>
  import('./pages/school-admin/academics/ResultReviewPage.tsx').then((m) => ({
    default: m.ResultReviewPage,
  })),
);
const ResultPublicationPage = lazy(() =>
  import('./pages/school-admin/academics/ResultPublicationPage.tsx').then((m) => ({
    default: m.ResultPublicationPage,
  })),
);
const BroadsheetsPage = lazy(() =>
  import('./pages/school-admin/academics/BroadsheetsPage.tsx').then((m) => ({
    default: m.BroadsheetsPage,
  })),
);
const PromotionRecommendationsPage = lazy(() =>
  import('./pages/school-admin/academics/PromotionRecommendationsPage.tsx').then((m) => ({
    default: m.PromotionRecommendationsPage,
  })),
);

// Phase 3 — Teacher Academic Workspace (code-split)
const TeacherAcademicWorkspacePage = lazy(() =>
  import('./pages/teachers/academics/TeacherAcademicWorkspacePage.tsx').then((m) => ({
    default: m.TeacherAcademicWorkspacePage,
  })),
);
const TeacherScoreEntryPage = lazy(() =>
  import('./pages/teachers/academics/TeacherScoreEntryPage.tsx').then((m) => ({
    default: m.TeacherScoreEntryPage,
  })),
);
const TeacherAssessmentHistoryPage = lazy(() =>
  import('./pages/teachers/academics/TeacherAssessmentHistoryPage.tsx').then((m) => ({
    default: m.TeacherAssessmentHistoryPage,
  })),
);
const TeacherCommentsPage = lazy(() =>
  import('./pages/teachers/academics/TeacherCommentsPage.tsx').then((m) => ({
    default: m.TeacherCommentsPage,
  })),
);

// Phase 3 — Student Results, Report Cards & Academic History (code-split)
const StudentResultsPage = lazy(() =>
  import('./pages/students/academics/StudentResultsPage.tsx').then((m) => ({
    default: m.StudentResultsPage,
  })),
);
const StudentReportCardsPage = lazy(() =>
  import('./pages/students/academics/StudentReportCardsPage.tsx').then((m) => ({
    default: m.StudentReportCardsPage,
  })),
);
const StudentAcademicHistoryPage = lazy(() =>
  import('./pages/students/academics/StudentAcademicHistoryPage.tsx').then((m) => ({
    default: m.StudentAcademicHistoryPage,
  })),
);

// Phase 3 — Parent Academic Overview, Results & Report Cards (code-split)
const ParentAcademicOverviewPage = lazy(() =>
  import('./pages/parents/academics/ParentAcademicOverviewPage.tsx').then((m) => ({
    default: m.ParentAcademicOverviewPage,
  })),
);
const ParentWardResultsPage = lazy(() =>
  import('./pages/parents/academics/ParentWardResultsPage.tsx').then((m) => ({
    default: m.ParentWardResultsPage,
  })),
);
const ParentReportCardsPage = lazy(() =>
  import('./pages/parents/academics/ParentReportCardsPage.tsx').then((m) => ({
    default: m.ParentReportCardsPage,
  })),
);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function RouteFallback() {
  return <BrandLoader label="Loading workspace module..." />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Website Routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/register" element={<RegisterSchoolPage />} />
                <Route path="/schools/:slug" element={<PublicSchoolSitePage />} />
                <Route path="/schools/:slug/admissions" element={<PublicSchoolAdmissionsPage />} />
              </Route>

              {/* Separate Authentication & Password Recovery Entry Points */}
              <Route path="/login/workers" element={<WorkersLoginPage />} />
              <Route path="/login/school" element={<SchoolLoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Platform Owner & Workforce Protected Routes */}
              <Route
                element={
                  <ProtectedRoute
                    environment="workers"
                    allowedRoles={['platform_owner', 'workforce_admin', 'workforce_support']}
                  />
                }
              >
                <Route path="/dashboard/owner" element={<WorkersLayout />}>
                  <Route index element={<OwnerOverviewPage />} />
                  <Route path="schools" element={<OwnerSchoolsPage />} />
                  <Route path="verification" element={<OwnerSchoolVerificationPage />} />
                  <Route path="workforce" element={<OwnerWorkforcePage />} />
                  <Route path="database" element={<OwnerDatabasePage />} />
                  <Route path="files" element={<OwnerFilesPage />} />
                  <Route path="notifications" element={<OwnerNotificationsPage />} />
                  <Route path="settings" element={<OwnerSettingsPage />} />
                  <Route path="security" element={<OwnerSecurityPage />} />
                  <Route path="audit-logs" element={<OwnerAuditLogsPage />} />
                  <Route path="ai-core" element={<OwnerAiCorePage />} />
                  <Route path="*" element={<Navigate to="/dashboard/owner" replace />} />
                </Route>
              </Route>

              {/* School Administrator Protected Routes */}
              <Route
                element={
                  <ProtectedRoute environment="school" allowedRoles={['school_admin']} />
                }
              >
                <Route path="/dashboard/school-admin" element={<SchoolAdminLayout />}>
                  <Route index element={<SchoolOverviewPage />} />
                  <Route path="profile" element={<SchoolProfilePage />} />
                  <Route path="settings" element={<SchoolSettingsPage />} />

                  {/* Students */}
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="students/register" element={<StudentRegistrationPage />} />
                  <Route path="students/:studentId" element={<StudentProfilePage />} />
                  <Route path="students/:studentId/edit" element={<StudentEditPage />} />
                  <Route path="students/:studentId/documents" element={<StudentDocumentsPage />} />
                  <Route
                    path="students/:studentId/promotions"
                    element={<StudentPromotionHistoryPage />}
                  />
                  <Route path="promotions" element={<StudentPromotionHistoryPage />} />

                  {/* Teachers */}
                  <Route path="teachers" element={<TeachersPage />} />
                  <Route path="teachers/register" element={<TeacherRegistrationPage />} />
                  <Route path="teachers/:teacherId" element={<AdminTeacherProfilePage />} />
                  <Route path="teachers/:teacherId/edit" element={<TeacherEditPage />} />
                  <Route path="teachers/:teacherId/documents" element={<TeacherDocumentsPage />} />

                  {/* Parents & Guardians */}
                  <Route path="parents" element={<ParentsPage />} />
                  <Route path="parents/register" element={<ParentRegistrationPage />} />
                  <Route path="parents/wards" element={<ParentWardManagementPage />} />
                  <Route path="parents/:parentId" element={<ParentProfilePage />} />
                  <Route path="parents/:parentId/wards" element={<ParentWardManagementPage />} />

                  {/* Classes & Arms */}
                  <Route path="classes" element={<ClassesPage />} />
                  <Route path="classes/new" element={<CreateClassPage />} />
                  <Route path="classes/:classId" element={<ClassDetailsPage />} />
                  <Route path="classes/:classId/students" element={<ClassStudentsPage />} />
                  <Route path="classes/:classId/teachers" element={<ClassTeachersPage />} />

                  {/* Subjects */}
                  <Route path="subjects" element={<SubjectsPage />} />
                  <Route path="subjects/new" element={<CreateSubjectPage />} />
                  <Route path="subjects/assignments" element={<SubjectAssignmentsPage />} />
                  <Route path="subjects/:subjectId" element={<SubjectDetailsPage />} />
                  <Route path="subjects/:subjectId/assignments" element={<SubjectAssignmentsPage />} />

                  {/* Admissions */}
                  <Route path="admissions" element={<AdmissionsPage />} />
                  <Route path="admissions/applications" element={<AdmissionApplicationsPage />} />
                  <Route path="admissions/new" element={<NewAdmissionPage />} />
                  <Route path="admissions/:applicationId" element={<AdmissionDetailsPage />} />

                  {/* Phase 3 — Academic Management & Results Engine */}
                  <Route path="academics" element={<AcademicOverviewPage />} />
                  <Route path="academics/sessions" element={<AcademicSessionsPage />} />
                  <Route path="academics/sessions/:sessionId" element={<AcademicSessionDetailsPage />} />
                  <Route path="academics/terms" element={<TermsPage />} />
                  <Route path="academics/calendar" element={<AcademicCalendarPage />} />
                  <Route path="academics/enrollments" element={<SubjectEnrollmentPage />} />
                  <Route path="academics/assessments" element={<AssessmentConfigurationPage />} />
                  <Route path="academics/assessments/components" element={<AssessmentComponentsPage />} />
                  <Route path="academics/examinations" element={<ExaminationManagementPage />} />
                  <Route path="academics/grading-systems" element={<GradingSystemsPage />} />
                  <Route path="academics/results" element={<ResultManagementPage />} />
                  <Route path="academics/results/review" element={<ResultReviewPage />} />
                  <Route path="academics/results/publish" element={<ResultPublicationPage />} />
                  <Route path="academics/broadsheets" element={<BroadsheetsPage />} />
                  <Route path="academics/promotions" element={<PromotionRecommendationsPage />} />

                  {/* Core Tenant Infrastructure */}
                  <Route path="sessions" element={<SchoolSessionsPage />} />
                  <Route path="members" element={<SchoolMembersPage />} />
                  <Route path="files" element={<SchoolFilesPage />} />
                  <Route path="notifications" element={<SchoolNotificationsPage />} />
                  <Route path="audit-logs" element={<SchoolAuditLogsPage />} />
                  <Route path="ai-core" element={<SchoolAiCorePage />} />
                  <Route path="*" element={<Navigate to="/dashboard/school-admin" replace />} />
                </Route>
              </Route>

              {/* Teacher Protected Routes */}
              <Route
                element={<ProtectedRoute environment="school" allowedRoles={['teacher']} />}
              >
                <Route path="/dashboard/teacher" element={<TeacherLayout />}>
                  <Route index element={<TeacherWorkspacePage />} />
                  <Route path="academics" element={<TeacherAcademicWorkspacePage />} />
                  <Route path="academics/scores" element={<TeacherScoreEntryPage />} />
                  <Route path="academics/history" element={<TeacherAssessmentHistoryPage />} />
                  <Route path="academics/comments" element={<TeacherCommentsPage />} />
                  <Route path="sessions" element={<TeacherSessionsPage />} />
                  <Route path="files" element={<TeacherFilesPage />} />
                  <Route path="notifications" element={<TeacherNotificationsPage />} />
                  <Route path="ai-core" element={<TeacherAiCorePage />} />
                  <Route path="profile" element={<TeacherProfilePage />} />
                  <Route path="*" element={<Navigate to="/dashboard/teacher" replace />} />
                </Route>
              </Route>

              {/* Student Protected Routes */}
              <Route
                element={<ProtectedRoute environment="school" allowedRoles={['student']} />}
              >
                <Route path="/dashboard/student" element={<StudentLayout />}>
                  <Route index element={<StudentOverviewPage />} />
                  <Route path="results" element={<StudentResultsPage />} />
                  <Route path="report-cards" element={<StudentReportCardsPage />} />
                  <Route path="history" element={<StudentAcademicHistoryPage />} />
                  <Route path="term" element={<StudentTermPage />} />
                  <Route path="files" element={<StudentFilesPage />} />
                  <Route path="notifications" element={<StudentNotificationsPage />} />
                  <Route path="account" element={<StudentAccountPage />} />
                  <Route path="*" element={<Navigate to="/dashboard/student" replace />} />
                </Route>
              </Route>

              {/* Parent / Guardian Protected Routes */}
              <Route
                element={<ProtectedRoute environment="school" allowedRoles={['parent']} />}
              >
                <Route path="/dashboard/parent" element={<ParentLayout />}>
                  <Route index element={<ParentOverviewPage />} />
                  <Route path="academics" element={<ParentAcademicOverviewPage />} />
                  <Route path="results" element={<ParentWardResultsPage />} />
                  <Route path="report-cards" element={<ParentReportCardsPage />} />
                  <Route path="wards" element={<ParentWardsPage />} />
                  <Route path="calendar" element={<ParentCalendarPage />} />
                  <Route path="notifications" element={<ParentNotificationsPage />} />
                  <Route path="*" element={<Navigate to="/dashboard/parent" replace />} />
                </Route>
              </Route>

              {/* 404 Fallback inside PublicLayout */}
              <Route element={<PublicLayout />}>
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
