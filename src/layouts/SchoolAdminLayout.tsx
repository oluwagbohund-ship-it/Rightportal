import React from 'react';
import {
  Activity,
  ArrowUpRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  FileSpreadsheet,
  FolderLock,
  GraduationCap,
  IdCard,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  QrCode,
  Scale,
  Settings,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { PortalShell, type PortalNavItem } from '../components/layout/PortalShell.tsx';
import { Alert } from '../components/ui/alert.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const SCHOOL_ADMIN_NAV: PortalNavItem[] = [
  { section: 'Institution', to: '/dashboard/school-admin', label: 'School Overview', icon: LayoutDashboard, end: true },
  { section: 'Institution', to: '/dashboard/school-admin/profile', label: 'School Profile', icon: Landmark },
  { section: 'Institution', to: '/dashboard/school-admin/admissions', label: 'Admissions', icon: ClipboardCheck },
  { section: 'People & Attendance', to: '/dashboard/school-admin/students', label: 'Students', icon: GraduationCap, end: true },
  { section: 'People & Attendance', to: '/dashboard/school-admin/students/id-cards', label: 'Digital ID Cards', icon: IdCard },
  { section: 'People & Attendance', to: '/dashboard/school-admin/teachers', label: 'Teachers', icon: UserCheck },
  { section: 'People & Attendance', to: '/dashboard/school-admin/parents', label: 'Parents & Guardians', icon: Users },
  { section: 'People & Attendance', to: '/dashboard/school-admin/attendance', label: 'Attendance Overview', icon: ClipboardList, end: true },
  { section: 'People & Attendance', to: '/dashboard/school-admin/attendance/register', label: 'QR & Roll Attendance', icon: QrCode },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/academics', label: 'Academic Hub', icon: BarChart3, end: true },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/classes', label: 'Classes & Arms', icon: Building2 },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/subjects', label: 'Subjects', icon: BookOpen },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/academics/sessions', label: 'Sessions Engine', icon: CalendarRange },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/academics/terms', label: 'Terms & Dates', icon: Layers },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/academics/calendar', label: 'Academic Calendar', icon: CalendarDays },
  { section: 'Academics & Structure', to: '/dashboard/school-admin/academics/enrollments', label: 'Subject Enrollments', icon: ListChecks },
  { section: 'Exams & Results', to: '/dashboard/school-admin/academics/assessments', label: 'Assessments & CA', icon: ClipboardList },
  { section: 'Exams & Results', to: '/dashboard/school-admin/academics/examinations', label: 'Examinations', icon: ClipboardCheck },
  { section: 'Exams & Results', to: '/dashboard/school-admin/academics/grading-systems', label: 'Grading Systems', icon: Scale },
  { section: 'Exams & Results', to: '/dashboard/school-admin/academics/results', label: 'Results Engine', icon: Award },
  { section: 'Exams & Results', to: '/dashboard/school-admin/academics/broadsheets', label: 'Broadsheets & PDF', icon: FileSpreadsheet },
  { section: 'Exams & Results', to: '/dashboard/school-admin/academics/promotions', label: 'Academic Promotions', icon: TrendingUp },
  { section: 'Exams & Results', to: '/dashboard/school-admin/promotions', label: 'Placement Transfers', icon: ArrowUpRight },
  { section: 'System & Governance', to: '/dashboard/school-admin/sessions', label: 'Legacy Sessions', icon: CalendarRange },
  { section: 'System & Governance', to: '/dashboard/school-admin/members', label: 'Members & Roles', icon: UserCog },
  { section: 'System & Governance', to: '/dashboard/school-admin/files', label: 'Files & Media', icon: FolderLock },
  { section: 'System & Governance', to: '/dashboard/school-admin/notifications', label: 'Notifications', icon: Bell },
  { section: 'System & Governance', to: '/dashboard/school-admin/settings', label: 'School Settings', icon: Settings },
  { section: 'System & Governance', to: '/dashboard/school-admin/audit-logs', label: 'Tenant Audit Logs', icon: Activity },
  { section: 'System & Governance', to: '/dashboard/school-admin/ai-core', label: 'DT AI CORE', icon: Cpu },
];

export function SchoolAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login/school');
  };

  const verificationBanner =
    user.activeSchoolStatus === 'pending_verification' ? (
      <Alert variant="info" title="Institution Verification Pending">
        Your school tenant ({user.activeSchoolCode}) is active for internal setup while awaiting verification by Dave Timi EdTech platform operations.
      </Alert>
    ) : null;

  return (
    <PortalShell
      user={user}
      portalLabel="School Administrator Console"
      breadcrumbPrefix={`${user.activeSchoolName ?? 'School'} / Administration`}
      headerRightText={`Tenant: ${user.activeSchoolCode ?? '—'} · Status: ${(
        user.activeSchoolStatus ?? 'active'
      ).replace('_', ' ')}`}
      sidebarAccentClass="bg-[#1E3A8A] text-white"
      navItems={SCHOOL_ADMIN_NAV}
      onLogout={handleLogout}
      banner={verificationBanner}
    >
      <Outlet />
    </PortalShell>
  );
}
