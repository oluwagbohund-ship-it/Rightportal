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
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
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
  { to: '/dashboard/school-admin', label: 'School Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/school-admin/profile', label: 'School Profile', icon: Landmark },
  { to: '/dashboard/school-admin/admissions', label: 'Admissions', icon: ClipboardCheck },
  { to: '/dashboard/school-admin/students', label: 'Students', icon: GraduationCap },
  { to: '/dashboard/school-admin/teachers', label: 'Teachers', icon: UserCheck },
  { to: '/dashboard/school-admin/parents', label: 'Parents & Guardians', icon: Users },
  { to: '/dashboard/school-admin/classes', label: 'Classes & Arms', icon: Building2 },
  { to: '/dashboard/school-admin/subjects', label: 'Subjects', icon: BookOpen },
  { to: '/dashboard/school-admin/academics', label: 'Academic Hub', icon: BarChart3, end: true },
  { to: '/dashboard/school-admin/academics/sessions', label: 'Sessions Engine', icon: CalendarRange },
  { to: '/dashboard/school-admin/academics/terms', label: 'Terms & Dates', icon: Layers },
  { to: '/dashboard/school-admin/academics/calendar', label: 'Academic Calendar', icon: CalendarDays },
  { to: '/dashboard/school-admin/academics/enrollments', label: 'Subject Enrollments', icon: ListChecks },
  { to: '/dashboard/school-admin/academics/assessments', label: 'Assessments & CA', icon: ClipboardList },
  { to: '/dashboard/school-admin/academics/examinations', label: 'Examinations', icon: ClipboardCheck },
  { to: '/dashboard/school-admin/academics/grading-systems', label: 'Grading Systems', icon: Scale },
  { to: '/dashboard/school-admin/academics/results', label: 'Results Engine', icon: Award },
  { to: '/dashboard/school-admin/academics/broadsheets', label: 'Broadsheets & PDF', icon: FileSpreadsheet },
  { to: '/dashboard/school-admin/academics/promotions', label: 'Academic Promotions', icon: TrendingUp },
  { to: '/dashboard/school-admin/promotions', label: 'Placement Transfers', icon: ArrowUpRight },
  { to: '/dashboard/school-admin/sessions', label: 'Legacy Sessions', icon: CalendarRange },
  { to: '/dashboard/school-admin/members', label: 'Members & Roles', icon: UserCog },
  { to: '/dashboard/school-admin/files', label: 'Files & Media', icon: FolderLock },
  { to: '/dashboard/school-admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/dashboard/school-admin/settings', label: 'School Settings', icon: Settings },
  { to: '/dashboard/school-admin/audit-logs', label: 'Tenant Audit Logs', icon: Activity },
  { to: '/dashboard/school-admin/ai-core', label: 'DT AI CORE', icon: Cpu },
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
