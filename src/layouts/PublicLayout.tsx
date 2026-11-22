import React, { Suspense, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BrandLoader } from '../components/brand/BrandLoader.tsx';
import { Logo } from '../components/brand/Logo.tsx';
import { Button } from '../components/ui/button.tsx';
import { cn } from '../lib/utils.ts';

const NAV_LINKS = [
  { label: 'Home', path: '/', end: true },
  { label: 'About', path: '/about', end: false },
  { label: 'Features', path: '/features', end: false },
  { label: 'Contact', path: '/contact', end: false },
  { label: 'Register School', path: '/register', end: false },
];

export function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Dave Timi EdTech Systems Home"
            className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
          >
            <Logo variant="compact" size="sm" />
          </Link>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap shrink-0 py-1 transition-colors hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm',
                    isActive &&
                      'text-[#1E3A8A] font-semibold underline decoration-[#2563EB] decoration-2 underline-offset-8',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              type="button"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => navigate('/login/school')}
            >
              School Login
            </Button>

            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#0F172A] md:hidden hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <nav aria-label="Mobile Navigation" className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-slate-100 text-[#1E3A8A] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="pt-3 mt-2 border-t border-slate-100">
                <Button
                  type="button"
                  className="w-full h-11"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/login/school');
                  }}
                >
                  School Login
                </Button>
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="flex-1">
        <Suspense fallback={<BrandLoader label="Loading public page..." />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-slate-200 bg-[#0F172A] text-slate-300">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5 space-y-3">
              <Logo variant="white" size="sm" showTagline />
              <p className="text-sm text-slate-300 leading-relaxed max-w-md pt-1">
                Multi-tenant education operating infrastructure engineered for institutional governance, academic lifecycle management, and strict tenant isolation.
              </p>
              <p className="text-xs font-medium text-slate-400">
                Engineered by David Oluwagbohun
              </p>
            </div>

            <div className="md:col-span-3 space-y-3">
              <p className="text-xs font-semibold tracking-wider text-slate-400">Platform</p>
              <ul className="space-y-2 text-sm">
                {NAV_LINKS.map((item) => (
                  <li key={item.path}>
                    <Link to={item.path} className="text-slate-300 hover:text-white transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-4 space-y-3">
              <p className="text-xs font-semibold tracking-wider text-slate-400">
                Access Environments
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    to="/login/school"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    School Portal Login
                  </Link>
                </li>
                <li>
                  <Link
                    to="/register"
                    className="text-slate-300 hover:text-white transition-colors"
                  >
                    Register an Institution
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login/workers"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    DT Workers Access
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-slate-800 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Dave Timi EdTech Systems. All rights reserved.</p>
            <p>Phase 1 Foundation · Multi-Tenant RBAC Architecture</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
