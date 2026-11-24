import React from 'react';
import {
  Award,
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileText,
  FolderLock,
  GraduationCap,
  History,
  IdCard,
  Shield,
} from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { PortalShell, type PortalNavItem } from '../components/layout/PortalShell.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const STUDENT_NAV: PortalNavItem[] = [
  { section: 'Campus Identity', to: '/dashboard/student', label: 'Student Portal', icon: GraduationCap, end: true },
  { section: 'Campus Identity', to: '/dashboard/student/id-card', label: 'Digital ID Card', icon: IdCard },
  { section: 'Campus Identity', to: '/dashboard/student/attendance', label: 'My Attendance', icon: ClipboardCheck },
  { section: 'Campus Identity', to: '/dashboard/student/term', label: 'Current Term', icon: CalendarDays },
  { section: 'Academic Record', to: '/dashboard/student/results', label: 'Published Results', icon: Award },
  { section: 'Academic Record', to: '/dashboard/student/report-cards', label: 'Report Cards', icon: FileText },
  { section: 'Academic Record', to: '/dashboard/student/history', label: 'Academic History', icon: History },
  { section: 'Account & Updates', to: '/dashboard/student/files', label: 'Profile & Files', icon: FolderLock },
  { section: 'Account & Updates', to: '/dashboard/student/notifications', label: 'Notifications', icon: Bell },
  { section: 'Account & Updates', to: '/dashboard/student/account', label: 'Account & Security', icon: Shield },
];

export function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login/school');
  };

  return (
    <PortalShell
      user={user}
      portalLabel="Student Learning Portal"
      breadcrumbPrefix={`${user.activeSchoolName ?? 'School'} / Student Portal`}
      headerRightText={`Student Tenant: ${user.activeSchoolCode ?? '—'}`}
      sidebarAccentClass="bg-[#2563EB] text-white"
      navItems={STUDENT_NAV}
      onLogout={handleLogout}
    >
      <Outlet />
    </PortalShell>
  );
}
