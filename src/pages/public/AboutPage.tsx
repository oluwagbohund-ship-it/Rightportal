import React, { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { PUBLIC_MEDIA, VisualMediaFrame } from '../../components/public/publicMedia.tsx';
import { Button } from '../../components/ui/button.tsx';
import { cn } from '../../lib/utils.ts';

const PILLARS = [
  {
    id: 'build',
    index: '01. Build',
    title: 'Dependable School Foundations',
    summary:
      'Every school runs inside a strictly isolated tenant workspace with verified credentials and role-checked permissions.',
    highlight: 'Zero shared spreadsheets or mixed school data.',
  },
  {
    id: 'innovate',
    index: '02. Innovate',
    title: 'Connected Academic Workflows',
    summary:
      'Attendance, fee ledgers, and digital CBT examinations connect cleanly so educators enter scores and records once.',
    highlight: 'Real-time visibility for school leaders and parents.',
  },
  {
    id: 'transform',
    index: '03. Transform',
    title: 'Clarity Across Every Device',
    summary:
      'Streamlined dashboards keep daily tasks crisp and responsive across desktop offices and mobile screens.',
    highlight: 'Built around everyday speed and human readability.',
  },
];

function PillarGraphic({ id }: { id: string }) {
  if (id === 'build') {
    return (
      <svg viewBox="0 0 180 76" className="w-full h-auto" aria-hidden="true">
        <rect x="8" y="14" width="48" height="48" rx="10" fill="#EFF6FF" stroke="#93C5FD" />
        <rect x="66" y="8" width="48" height="60" rx="10" fill="#1E3A8A" />
        <rect x="124" y="14" width="48" height="48" rx="10" fill="#EFF6FF" stroke="#93C5FD" />
        <circle cx="90" cy="38" r="10" fill="#3B82F6" />
        <path d="M86 38 L89 41 L95 35" stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'innovate') {
    return (
      <svg viewBox="0 0 180 76" className="w-full h-auto" aria-hidden="true">
        <path d="M24 52 C56 20, 86 58, 114 26 S148 22, 160 18" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="52" r="5" fill="#1E3A8A" />
        <circle cx="90" cy="38" r="5" fill="#2563EB" />
        <circle cx="158" cy="19" r="6" fill="#16A34A" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 180 76" className="w-full h-auto" aria-hidden="true">
      <rect x="18" y="12" width="96" height="54" rx="8" fill="#F8FAFC" stroke="#CBD5E1" />
      <rect x="26" y="20" width="80" height="10" rx="3" fill="#1E3A8A" />
      <rect x="26" y="36" width="38" height="22" rx="4" fill="#DBEAFE" />
      <rect x="70" y="36" width="36" height="22" rx="4" fill="#EFF6FF" />
      <rect x="124" y="18" width="38" height="48" rx="8" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5" />
      <rect x="130" y="26" width="26" height="26" rx="4" fill="#EFF6FF" />
    </svg>
  );
}

export function AboutPage() {
  const [activePillarId, setActivePillarId] = useState<string>('build');
  const activePillar = PILLARS.find((p) => p.id === activePillarId) ?? PILLARS[0];

  return (
    <div className="bg-[#F8FAFC] text-[#0F172A]">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
            <div className="lg:col-span-6 space-y-6 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
                About Dave Timi EdTech Systems
              </p>
              <h1
                className="text-3xl sm:text-5xl font-bold tracking-tight text-[#0F172A] leading-[1.1]"
                style={{ textWrap: 'balance' }}
              >
                Engineering dependable software infrastructure for schools.
              </h1>
              <p className="text-slate-600 text-base leading-relaxed">
                Conceived and architected by David Oluwagbohun around one clear mandate—Build • Innovate • Transform—our platform replaces scattered spreadsheets and disconnected tools with a calm, unified school workspace.
              </p>
              <p className="text-slate-600 text-base leading-relaxed">
                Every school gains strict data ownership, clear role portals, and dependable daily tools without interface bloat.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Button type="button" size="lg" onClick={() => window.location.assign('/register.html')}>
                  <span>Onboard Your School</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <a
                  href="/features.html"
                  className="elastic-interactive inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-[#0F172A] hover:bg-slate-50"
                >
                  Explore What We Offer
                </a>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <VisualMediaFrame
                src={PUBLIC_MEDIA.aboutStudioImg}
                alt="Institutional software engineering and school architecture team studio"
                fallbackTitle="Dave Timi EdTech Systems Studio"
                className="w-full min-h-[320px] lg:h-full shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <p className="text-xs font-medium text-blue-200">
                    Architect &amp; Founder
                  </p>
                  <p className="text-base font-semibold">
                    David Oluwagbohun · Build • Innovate • Transform
                  </p>
                </div>
              </VisualMediaFrame>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Graphical Three Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 max-w-xl">
            <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
              Our Three Principles
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
              Designed for trust from the first login.
            </h2>
          </div>
          <p className="text-sm text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
            <span>{activePillar.highlight}</span>
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PILLARS.map((pillar) => {
            const active = pillar.id === activePillarId;
            return (
              <button
                key={pillar.id}
                type="button"
                onClick={() => setActivePillarId(pillar.id)}
                aria-pressed={active}
                className={cn(
                  'elastic-card text-left rounded-2xl border bg-white p-6 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]',
                  active
                    ? 'border-[#2563EB] shadow-md'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <div className="rounded-xl bg-[#F8FAFC] border border-slate-100 p-3">
                  <PillarGraphic id={pillar.id} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-mono font-semibold text-[#2563EB]">
                    {pillar.index}
                  </p>
                  <h3 className="text-lg font-bold text-[#0F172A]">{pillar.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{pillar.summary}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
