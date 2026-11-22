import React from 'react';
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  FolderLock,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { PortalShell, type PortalNavItem } from '../components/layout/PortalShell.tsx';
import { useAuth } from '../context/AuthContext.tsx';

const OWNER_NAV: PortalNavItem[] = [
  { to: '/dashboard/owner', label: 'Platform Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/owner/schools', label: 'School Management', icon: Building2 },
  { to: '/dashboard/owner/verification', label: 'Verification Queue', icon: CheckCircle2 },
  { to: '/dashboard/owner/workforce', label: 'Workforce Management', icon: Users },
  { to: '/dashboard/owner/database', label: 'Database & Backups', icon: Database },
  { to: '/dashboard/owner/files', label: 'Files & Storage', icon: FolderLock },
  { to: '/dashboard/owner/notifications', label: 'Notifications', icon: Bell },
  { to: '/dashboard/owner/settings', label: 'Platform Settings', icon: Settings },
  { to: '/dashboard/owner/security', label: 'Security Monitoring', icon: ShieldAlert },
  { to: '/dashboard/owner/audit-logs', label: 'Audit Logs', icon: Activity },
  { to: '/dashboard/owner/ai-core', label: 'DT AI CORE', icon: Cpu },
];

export function WorkersLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login/workers');
  };

  return (
    <PortalShell
      user={user}
      portalLabel="Platform Owner Console"
      breadcrumbPrefix="Dave Timi EdTech / Internal Platform Operations"
      headerRightText="Environment: Authorized Workforce"
      sidebarAccentClass="bg-[#2563EB] text-white"
      navItems={OWNER_NAV}
      onLogout={handleLogout}
    >
      <Outlet />
    </PortalShell>
  );
}
