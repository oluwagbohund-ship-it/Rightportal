import React, { Suspense, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import type { AuthUser } from '../../types/app.ts';
import { cn } from '../../lib/utils.ts';
import { BrandLoader } from '../brand/BrandLoader.tsx';
import { Logo } from '../brand/Logo.tsx';
import { Button } from '../ui/button.tsx';

export interface PortalNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface PortalShellProps {
  user: AuthUser;
  portalLabel: string;
  breadcrumbPrefix: string;
  headerRightText: string;
  sidebarAccentClass?: string;
  navItems: PortalNavItem[];
  onLogout: () => Promise<void>;
  banner?: React.ReactNode;
  children: React.ReactNode;
}

export function PortalShell({
  user,
  portalLabel,
  breadcrumbPrefix,
  headerRightText,
  sidebarAccentClass = 'bg-[#1E3A8A] text-white',
  navItems,
  onLogout,
  banner,
  children,
}: PortalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  };

  const { logoutAll } = useAuth();
  const handleLogoutAll = async () => {
    setSigningOut(true);
    try {
      await logoutAll();
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  };

  const SidebarContent = (
    <div className="flex h-full flex-col bg-[#0F172A] text-slate-200">
      <div className="shrink-0 border-b border-slate-800 px-5 py-4 space-y-2">
        <Logo variant="white" size="xs" />
        <p className="text-[11px] font-medium text-slate-400 pl-0.5">{portalLabel}</p>
      </div>

      <nav aria-label={`${portalLabel} Navigation`} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex w-full min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]',
                  isActive
                    ? sidebarAccentClass
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-slate-800 p-4 space-y-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-white truncate">{user.fullName}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
          <p className="text-xs text-slate-400 pt-1">
            {user.roleName}
            {user.activeSchoolCode ? ` · ${user.activeSchoolCode}` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={signingOut}
          onClick={() => void handleLogout()}
          className="w-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white hover:border-slate-600"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
        </Button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void handleLogoutAll()}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Sign out all devices
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 border-r border-slate-200">
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-xl">
            <button
              type="button"
              aria-label="Close dashboard navigation"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open dashboard navigation"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-[#0F172A] lg:hidden hover:bg-slate-50"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{breadcrumbPrefix}</p>
              <p className="text-sm sm:text-base font-semibold text-[#0F172A] truncate">
                {portalLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs text-slate-600">
            <span className="hidden sm:inline font-mono">{headerRightText}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {banner}
            <Suspense fallback={<BrandLoader label="Loading workspace module..." className="rounded-xl border border-slate-200 bg-white" />}>
              {children}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
