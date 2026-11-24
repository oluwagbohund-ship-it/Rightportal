import React from 'react';
import {
  Activity,
  Bell,
  Bot,
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
  { section: 'Executive & Tenants', to: '/dashboard/owner', label: 'Platform Overview', icon: LayoutDashboard, end: true },
  { section: 'Executive & Tenants', to: '/dashboard/owner/schools', label: 'School Management', icon: Building2 },
  { section: 'Executive & Tenants', to: '/dashboard/owner/verification', label: 'Verification Queue', icon: CheckCircle2 },
  { section: 'Executive & Tenants', to: '/dashboard/owner/workforce', label: 'Workforce Management', icon: Users },
  { section: 'Integrations & Ops', to: '/dashboard/owner/telegram', label: 'Telegram Bot', icon: Bot },
  { section: 'Integrations & Ops', to: '/dashboard/owner/notifications', label: 'Notifications', icon: Bell },
  { section: 'Integrations & Ops', to: '/dashboard/owner/files', label: 'Files & Storage', icon: FolderLock },
  { section: 'Integrations & Ops', to: '/dashboard/owner/database', label: 'Database & Backups', icon: Database },
  { section: 'Governance & Security', to: '/dashboard/owner/settings', label: 'Platform Settings', icon: Settings },
  { section: 'Governance & Security', to: '/dashboard/owner/security', label: 'Security Monitoring', icon: ShieldAlert },
  { section: 'Governance & Security', to: '/dashboard/owner/audit-logs', label: 'Audit Logs', icon: Activity },
  { section: 'Governance & Security', to: '/dashboard/owner/ai-core', label: 'DT AI CORE', icon: Cpu },
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
