import React from 'react';
import { Award, Bell, BookOpen, Calendar, FileText, Home, Users } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { PortalShell, type PortalNavItem } from '../components/layout/PortalShell.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const PARENT_NAV: PortalNavItem[] = [
  { to: '/dashboard/parent', label: 'Guardian Portal', icon: Home, end: true },
  { to: '/dashboard/parent/academics', label: 'Ward Academics', icon: BookOpen },
  { to: '/dashboard/parent/results', label: 'Ward Results', icon: Award },
  { to: '/dashboard/parent/report-cards', label: 'Report Cards', icon: FileText },
  { to: '/dashboard/parent/wards', label: 'Ward Linkage', icon: Users },
  { to: '/dashboard/parent/calendar', label: 'Term Calendar', icon: Calendar },
  { to: '/dashboard/parent/notifications', label: 'Notifications', icon: Bell },
];

export function ParentLayout() {
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
      portalLabel="Parent / Guardian Portal"
      breadcrumbPrefix={`${user.activeSchoolName ?? 'School'} / Guardian Portal`}
      headerRightText={`Guardian Tenant: ${user.activeSchoolCode ?? '—'}`}
      sidebarAccentClass="bg-[#1E3A8A] text-white"
      navItems={PARENT_NAV}
      onLogout={handleLogout}
    >
      <Outlet />
    </PortalShell>
  );
}
