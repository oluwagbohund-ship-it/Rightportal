import React, { Suspense, useEffect, useState } from 'react';
import { ArrowRight, Menu, ShieldCheck, X } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BrandLoader } from '../components/brand/BrandLoader.tsx';
import { Logo } from '../components/brand/Logo.tsx';
import { Button } from '../components/ui/button.tsx';
import { cn } from '../lib/utils.ts';

const NAV_LINKS = [
  { label: 'Home', href: '/index.html', matchPaths: ['/', '/index.html'] },
  { label: 'About', href: '/about.html', matchPaths: ['/about', '/about.html'] },
  { label: 'Features', href: '/features.html', matchPaths: ['/features', '/features.html'] },
  { label: 'Contact', href: '/contact.html', matchPaths: ['/contact', '/contact.html'] },
  { label: 'Register School', href: '/register.html', matchPaths: ['/register', '/register.html'] },
];

export function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ownerClaimed, setOwnerClaimed] = useState<boolean | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    fetch('/api/public/info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ownerClaimed?: boolean } | null) => {
        if (!active || !data || typeof data.ownerClaimed !== 'boolean') return;
        setOwnerClaimed(data.ownerClaimed);
      })
      .catch(() => {
        // Ignore transient network errors for optional setup banner
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const isNavActive = (matchPaths: string[]) => matchPaths.includes(pathname);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <a
            href="/index.html"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Dave Timi EdTech Systems Home"
            className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
          >
            <Logo variant="compact" size="sm" />
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {NAV_LINKS.map((item) => {
              const active = isNavActive(item.matchPaths);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap shrink-0 py-1 transition-colors hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm',
                    active &&
                      'text-[#1E3A8A] font-semibold underline decoration-[#2563EB] decoration-2 underline-offset-8',
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to="/login/workers"
              className="hidden md:inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#0F172A] whitespace-nowrap shrink-0 transition-colors"
            >
              {ownerClaimed === false ? 'Create Owner Account' : 'Owner Portal'}
            </Link>
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
              {NAV_LINKS.map((item) => {
                const active = isNavActive(item.matchPaths);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-slate-100 text-[#1E3A8A] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
              <div className="grid grid-cols-2 gap-2 pt-3 mt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/login/workers');
                  }}
                >
                  {ownerClaimed === false ? 'Create Owner' : 'Owner Login'}
                </Button>
                <Button
                  type="button"
                  className="h-11"
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

      {ownerClaimed === false ? (
        <div className="border-b border-blue-200 bg-[#EFF6FF]">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-xs text-[#1E3A8A]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#2563EB]" aria-hidden="true" />
              <span>
                <strong>First-Time Platform Setup:</strong> No Platform Owner account has been created yet.
              </span>
            </div>
            <Link
              to="/login/workers"
              className="inline-flex items-center gap-1.5 self-start rounded-md bg-[#1E3A8A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 sm:self-auto"
            >
              <span>Create First Platform Owner Account</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}

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
              <p className="text-xs font-semibold text-slate-300">Platform</p>
              <ul className="space-y-2 text-sm">
                {NAV_LINKS.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="text-slate-400 hover:text-white transition-colors">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-4 space-y-3">
              <p className="text-xs font-semibold text-slate-300">
                Access Environments
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    to="/login/school"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    School Portal Login
                  </Link>
                </li>
                <li>
                  <a
                    href="/register.html"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Register an Institution
                  </a>
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
            <p>Multi-Tenant School Operating Platform</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
