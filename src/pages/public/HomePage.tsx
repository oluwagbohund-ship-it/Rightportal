import React from 'react';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OfferingShowcase } from '../../components/public/OfferingShowcase.tsx';
import { PUBLIC_MEDIA, VisualMediaFrame } from '../../components/public/publicMedia.tsx';
import { Button } from '../../components/ui/button.tsx';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#F8FAFC] text-[#0F172A]">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-7">
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-[#1E3A8A]">
                  Dave Timi EdTech Systems · Build • Innovate • Transform
                </p>
                <h1
                  className="font-bold tracking-[-0.03em] text-[#0F172A] leading-[1.08]"
                  style={{ fontSize: 'clamp(2.35rem, 4.2vw, 3.75rem)', textWrap: 'balance' }}
                >
                  A calm operating platform built for modern schools.
                </h1>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Bring school leadership, teachers, students, and parents into one private digital workspace—from morning QR attendance and tuition receipts to timed CBT exams.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => window.location.assign('/register.html')}
                  className="px-6 py-3 text-base shadow-sm"
                >
                  <span>Register Your School</span>
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Button>
                <a
                  href="/features.html"
                  className="elastic-interactive inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-[#0F172A] hover:bg-slate-50"
                >
                  View What We Offer
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-200 pt-7 text-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
                    <Lock className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                    <span>Code Verified</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Protected onboarding via unique school access codes
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
                    <Users className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                    <span>Role Workspaces</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Dedicated portals for staff, students, and families
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
                    <ShieldCheck className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                    <span>Isolated Data</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Every school operates inside its own private tenant
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <VisualMediaFrame
                src={PUBLIC_MEDIA.heroDashboardImg}
                alt="School executive reviewing live institutional enrollment and attendance analytics"
                fallbackTitle="Dave Timi EdTech Executive Workspace"
                className="w-full min-h-[340px] lg:h-full shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent pointer-events-none" />
                <div className="elastic-float absolute bottom-5 left-5 right-5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-5 py-4 text-white flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-blue-300">
                      Unified School Control
                    </p>
                    <p className="text-sm font-semibold">
                      Attendance · Tuition Ledger · CBT Assessments
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-200 tabular-nums">
                    Multi-Tenant Ready
                  </span>
                </div>
              </VisualMediaFrame>
            </div>
          </div>
        </div>
      </section>

      {/* Curated Interactive Offerings Section (Just a Focused Few) */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20 space-y-10">
        <div className="max-w-2xl space-y-2.5">
          <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
            What We Offer
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A]"
            style={{ textWrap: 'balance' }}
          >
            Four core tools every school uses daily.
          </h2>
          <p className="text-slate-600 text-base leading-relaxed">
            Select an offering below to inspect how it works visually inside your school portal.
          </p>
        </div>

        <OfferingShowcase />
      </section>

      {/* Campus & Onboarding Split */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-stretch">
            <div className="lg:col-span-7 flex">
              <VisualMediaFrame
                src={PUBLIC_MEDIA.campusHubImg}
                alt="Students and school staff collaborating across a modern school campus atrium"
                fallbackTitle="Modern School Campus Infrastructure"
                className="w-full min-h-[300px] lg:h-full"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <p className="text-xs font-medium text-blue-200">
                    Built for Real Campus Rhythm
                  </p>
                  <p className="text-base font-semibold mt-0.5">
                    Works seamlessly across classroom tablets, school offices, and parent phones.
                  </p>
                </div>
              </VisualMediaFrame>
            </div>

            <div className="lg:col-span-5 elastic-card rounded-2xl bg-[#0F172A] text-white p-8 flex flex-col justify-between gap-6 shadow-md">
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-blue-300">
                  Institutional Onboarding
                </p>
                <h3
                  className="text-2xl sm:text-3xl font-bold tracking-tight"
                  style={{ textWrap: 'balance' }}
                >
                  Launch your school portal in minutes.
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Obtain a unique School Access Code from the Platform Owner, create your isolated institution workspace, and sign in with clarity.
                </p>
                <ul className="space-y-2.5 pt-2 text-sm text-slate-200">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <span>Verify your unique School Access Code</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <span>Set up school profile and academic session</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <span>Enter directly as Founding School Admin</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => window.location.assign('/register.html')}
                  className="w-full bg-[#2563EB] hover:bg-blue-600 text-white font-semibold"
                >
                  Register School Tenant
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => navigate('/login/school')}
                  className="w-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                >
                  School Portal Login
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
