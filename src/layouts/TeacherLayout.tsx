import React from 'react';
import {
  Bell,
  BookOpen,
  CalendarRange,
  ClipboardEdit,
  Cpu,
  FolderLock,
  History,
  LayoutDashboard,
  MessageSquare,
  UserCheck,
} from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { PortalShell, type PortalNavItem } from '../components/layout/PortalShell.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const TEACHER_NAV: PortalNavItem[] = [
  { to: '/dashboard/teacher', label: 'Faculty Workspace', icon: LayoutDashboard, end: true },
  { to: '/dashboard/teacher/academics', label: 'Academic Hub', icon: BookOpen, end: true },
  { to: '/dashboard/teacher/academics/scores', label: 'Score Entry', icon: ClipboardEdit },
  { to: '/dashboard/teacher/academics/history', label: 'Assessment History', icon: History },
  { to: '/dashboard/teacher/academics/comments', label: 'Remarks & Traits', icon: MessageSquare },
  { to: '/dashboard/teacher/sessions', label: 'Academic Calendar', icon: CalendarRange },
  { to: '/dashboard/teacher/files', label: 'Documents & Media', icon: FolderLock },
  { to: '/dashboard/teacher/notifications', label: 'Notifications', icon: Bell },
  { to: '/dashboard/teacher/ai-core', label: 'DT AI CORE', icon: Cpu },
  { to: '/dashboard/teacher/profile', label: 'Role & Access', icon: UserCheck },
];

export function TeacherLayout() {
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
      portalLabel="Teacher Workspace"
      breadcrumbPrefix={`${user.activeSchoolName ?? 'School'} / Faculty`}
      headerRightText={`Faculty Tenant: ${user.activeSchoolCode ?? '—'}`}
      sidebarAccentClass="bg-[#1E3A8A] text-white"
      navItems={TEACHER_NAV}
      onLogout={handleLogout}
    >
      <Outlet />
    </PortalShell>
  );
}
