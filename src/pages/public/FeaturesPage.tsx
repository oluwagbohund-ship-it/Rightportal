import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, GraduationCap, Shield, UserCheck, Users } from 'lucide-react';
import { CORE_OFFERINGS } from '../../components/public/OfferingShowcase.tsx';
import { PUBLIC_MEDIA, VisualMediaFrame } from '../../components/public/publicMedia.tsx';
import { Button } from '../../components/ui/button.tsx';
import { cn } from '../../lib/utils.ts';

type RoleKey = 'admin' | 'teacher' | 'student' | 'parent';

const ROLE_VIEWS: Record<
  RoleKey,
  {
    label: string;
    title: string;
    summary: string;
    tools: [string, string, string];
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  }
> = {
  admin: {
    label: 'School Admin',
    title: 'Full school oversight without complexity',
    summary:
      'Manage classes, verify staff accounts, approve fee proofs, and publish term results from one executive panel.',
    tools: [
      'Create academic sessions, classes, and subject assignments',
      'Verify parent fee transfer receipts and print fee summaries',
      'Approve final result sheets and monitor audit activity',
    ],
    icon: Shield,
  },
  teacher: {
    label: 'Teacher',
    title: 'Built around fast classroom routines',
    summary:
      'Take morning attendance, build CBT quizzes, and record continuous assessment scores without paperwork.',
    tools: [
      'Mark daily roll attendance or verify QR check-ins',
      'Schedule online CBT quizzes with auto-marked objective scores',
      'Submit class broadsheet scores straight into term results',
    ],
    icon: UserCheck,
  },
  student: {
    label: 'Student',
    title: 'Clear schedules, tests, and term reports',
    summary:
      'Write timed digital tests, view class timetables, and download approved report cards anytime.',
    tools: [
      'Sit distraction-free timed CBT examinations with auto-save',
      'Access personal QR attendance pass and weekly timetable',
      'Download official term report cards once published',
    ],
    icon: GraduationCap,
  },
  parent: {
    label: 'Parent',
    title: 'Peace of mind for every child at school',
    summary:
      'Follow ward attendance, upload tuition transfer proofs, and read verified academic reports in one place.',
    tools: [
      'Check daily class arrival and attendance status',
      'View clear tuition statements and upload payment receipts',
      'Read direct school notices and term report cards',
    ],
    icon: Users,
  },
};

function CardVectorVisual({ id }: { id: string }) {
  if (id === 'portals') {
    return (
      <svg viewBox="0 0 280 92" className="w-full h-auto" aria-hidden="true">
        <rect x="12" y="18" width="56" height="56" rx="12" fill="#1E3A8A" />
        <rect x="78" y="18" width="56" height="56" rx="12" fill="#2563EB" />
        <rect x="144" y="18" width="56" height="56" rx="12" fill="#EFF6FF" stroke="#93C5FD" />
        <rect x="210" y="18" width="56" height="56" rx="12" fill="#EFF6FF" stroke="#93C5FD" />
        <text x="40" y="50" textAnchor="middle" fill="#FFF" fontSize="10" fontWeight="700">Admin</text>
        <text x="106" y="50" textAnchor="middle" fill="#FFF" fontSize="10" fontWeight="700">Staff</text>
        <text x="172" y="50" textAnchor="middle" fill="#1E3A8A" fontSize="10" fontWeight="700">Student</text>
        <text x="238" y="50" textAnchor="middle" fill="#1E3A8A" fontSize="10" fontWeight="700">Parent</text>
      </svg>
    );
  }
  if (id === 'attendance') {
    return (
      <svg viewBox="0 0 280 92" className="w-full h-auto" aria-hidden="true">
        <rect x="14" y="14" width="64" height="64" rx="12" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
        <rect x="28" y="28" width="14" height="14" rx="2" fill="#1E3A8A" />
        <rect x="50" y="28" width="14" height="14" rx="2" fill="#1E3A8A" />
        <rect x="28" y="50" width="14" height="14" rx="2" fill="#1E3A8A" />
        <rect x="50" y="50" width="14" height="14" rx="2" fill="#60A5FA" />
        {[100, 134, 168, 202, 236].map((x, idx) => {
          const h = [44, 52, 40, 56, 48][idx];
          return (
            <g key={x}>
              <rect x={x} y="16" width="20" height="60" rx="6" fill="#F1F5F9" />
              <rect x={x} y={76 - h} width="20" height={h} rx="6" fill="#2563EB" />
            </g>
          );
        })}
      </svg>
    );
  }
  if (id === 'finance') {
    return (
      <svg viewBox="0 0 280 92" className="w-full h-auto" aria-hidden="true">
        <rect x="14" y="14" width="166" height="64" rx="12" fill="#FFFFFF" stroke="#CBD5E1" />
        <rect x="28" y="28" width="96" height="8" rx="4" fill="#CBD5E1" />
        <rect x="28" y="46" width="132" height="8" rx="4" fill="#DBEAFE" />
        <rect x="28" y="62" width="76" height="6" rx="3" fill="#E2E8F0" />
        <rect x="192" y="14" width="74" height="64" rx="12" fill="#1E3A8A" />
        <circle cx="229" cy="40" r="14" fill="#2563EB" />
        <path d="M223 40 L227 44 L236 35" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        <text x="229" y="67" textAnchor="middle" fill="#BFDBFE" fontSize="8.5" fontWeight="600">PDF Receipt</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 280 92" className="w-full h-auto" aria-hidden="true">
      <rect x="14" y="14" width="166" height="64" rx="12" fill="#FFFFFF" stroke="#CBD5E1" />
      <rect x="26" y="26" width="142" height="12" rx="4" fill="#EFF6FF" />
      <rect x="26" y="45" width="98" height="8" rx="4" fill="#E2E8F0" />
      <rect x="26" y="60" width="120" height="8" rx="4" fill="#2563EB" />
      <rect x="192" y="14" width="74" height="64" rx="12" fill="#0F172A" />
      <circle cx="229" cy="46" r="18" fill="none" stroke="#3B82F6" strokeWidth="5" strokeDasharray="88 114" strokeLinecap="round" />
      <text x="229" y="50" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700">92%</text>
    </svg>
  );
}

export function FeaturesPage() {
  const [selectedRole, setSelectedRole] = useState<RoleKey>('admin');
  const activeRole = ROLE_VIEWS[selectedRole];
  const RoleIcon = activeRole.icon;

  return (
    <div className="bg-[#F8FAFC] text-[#0F172A]">
      {/* Visual Classroom Header */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
              <p className="text-xs font-semibold tracking-tight text-[#2563EB]">
                What We Offer
              </p>
              <h1
                className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#0F172A] leading-[1.08]"
                style={{ textWrap: 'balance' }}
              >
                Focused school essentials built for everyday flow.
              </h1>
              <p className="text-slate-600 text-base leading-relaxed">
                Instead of overwhelming schools with cluttered menus, Dave Timi EdTech Systems centers on four core pillars that run daily campus life cleanly.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button type="button" size="lg" onClick={() => window.location.assign('/register.html')}>
                  <span>Register Your School</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <a
                  href="/contact.html"
                  className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-[#0F172A] hover:bg-slate-50 transition-colors"
                >
                  Request School Demo
                </a>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <VisualMediaFrame
                src={PUBLIC_MEDIA.digitalClassroomImg}
                alt="Students completing digital tablet assessments in a sunlit modern classroom"
                fallbackTitle="Interactive Digital Classroom"
                className="w-full min-h-[300px] lg:h-full border border-slate-200"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <p className="text-xs font-medium text-blue-200">
                    Classroom to Parent Office
                  </p>
                  <p className="font-display text-base font-semibold">
                    Live attendance, digital CBT exams, and clean report generation.
                  </p>
                </div>
              </VisualMediaFrame>
            </div>
          </div>
        </div>
      </section>

      {/* Curated 4 Core Offerings in Graphical 2x2 Grid */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
            Four Core Offerings
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Everything essential—presented simply, backed by verified school isolation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {CORE_OFFERINGS.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                className="rounded-xl border border-slate-200 bg-white p-6 sm:p-7 space-y-5 transition-colors hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono font-semibold text-[#2563EB] tabular-nums">
                      {mod.index}. Core Offering
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold text-[#0F172A]">{mod.title}</h3>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#F8FAFC] text-[#1E3A8A]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200/70 bg-[#F8FAFC] p-3">
                  <CardVectorVisual id={mod.id} />
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">{mod.shortDesc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Role Preview Switcher */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 space-y-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-tight text-[#2563EB]">
                Role Experience Switcher
              </p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#0F172A]">
                See how each school member uses the portal
              </h2>
            </div>

            <div
              role="tablist"
              aria-label="Preview portal by role"
              className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1.5"
            >
              {(Object.keys(ROLE_VIEWS) as RoleKey[]).map((key) => {
                const active = key === selectedRole;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedRole(key)}
                    className={cn(
                      'elastic-interactive whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium',
                      active
                        ? 'bg-[#1E3A8A] text-white shadow-sm'
                        : 'text-slate-600 hover:text-[#0F172A]',
                    )}
                  >
                    {ROLE_VIEWS[key].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            key={selectedRole}
            className="elastic-panel-swap grid gap-8 lg:grid-cols-12 lg:items-center rounded-xl border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8"
          >
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-slate-200 text-[#1E3A8A] shadow-sm">
                <RoleIcon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-2xl font-bold text-[#0F172A]">{activeRole.title}</h3>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                {activeRole.summary}
              </p>
              <div className="pt-2">
                <Button type="button" onClick={() => window.location.assign('/register.html')}>
                  Get Started With a School Code
                </Button>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-3">
              {activeRole.tools.map((tool, index) => (
                <div
                  key={tool}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <span className="tabular-nums text-xs font-mono font-bold text-[#2563EB] pt-0.5">
                    0{index + 1}
                  </span>
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[#0F172A]">{tool}</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
