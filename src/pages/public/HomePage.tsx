import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Coins,
  Cpu,
  Globe,
  Lock,
  MessageSquare,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';

export function HomePage() {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="bg-[#F8FAFC] text-[#0F172A]">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-8">
              <div className="space-y-4">
                <div className="pb-1">
                  <Logo variant="primary" size="xs" showTagline />
                </div>
                <h1
                  className="font-bold tracking-[-0.03em] text-[#0F172A] leading-[1.08]"
                  style={{ fontSize: 'clamp(2.5rem, 4.5vw, 4rem)', textWrap: 'balance' }}
                >
                  The Next-Generation Operating System for Multi-School Excellence.
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
                  Dave Timi EdTech Systems is an enterprise-grade education management platform designed for serious educational institutions. Delivering server-enforced tenant isolation, five dedicated role portals, real-time QR attendance, secure fee ledgers, responsive CBT examinations, and automated timetable conflict prevention.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Button type="button" size="lg" onClick={() => navigate('/register')} className="px-6 py-3 text-base shadow-md">
                  <span>Register Your School</span>
                  <ArrowRight className="h-5 w-5 ml-1" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => navigate('/features')}
                  className="px-6 py-3 text-base border-slate-300"
                >
                  Explore Architecture
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-200 pt-8 text-sm">
                <div>
                  <p className="font-bold text-[#0F172A] text-base">Tenant Isolated</p>
                  <p className="text-xs text-slate-500 mt-1">Absolute data separation across school entities</p>
                </div>
                <div>
                  <p className="font-bold text-[#0F172A] text-base">5 Portal Roles</p>
                  <p className="text-xs text-slate-500 mt-1">Owner, Admin, Teacher, Student, Parent</p>
                </div>
                <div>
                  <p className="font-bold text-[#0F172A] text-base">Production Hardened</p>
                  <p className="text-xs text-slate-500 mt-1">HTTP-only session cookies & audit trails</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-80 sm:h-[440px] lg:h-[480px] overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-[#0F172A]">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/edtech_hero_dashboard_1795356171864.jpg"
                    alt="Dave Timi EdTech Systems executive management console"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover transform hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-white">
                    <Logo variant="white" size="lg" showTagline />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-6 left-6 right-6 p-4 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-blue-400">ACTIVE INFRASTRUCTURE</p>
                    <p className="text-sm font-semibold">Multi-School SaaS Engine v1.0</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Version 1 Core Modules Showcase */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <p className="text-xs font-semibold tracking-wider text-[#2563EB] uppercase">
            Complete Version 1 Architecture
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F172A]">
            Every institutional workflow unified into a single operating platform.
          </h2>
          <p className="text-slate-600 text-base leading-relaxed">
            Designed with uncompromising rigor for administrators, faculty, learners, and families.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow border-slate-200">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center mb-2">
                <QrCode className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Attendance & QR Check-In</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Daily roll registers, late threshold rules, attendance correction approval workflows, and live QR token check-ins for students.</p>
              <p className="text-xs text-blue-600 font-medium pt-2">Phase 4 Deliverable · Fully Active</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-slate-200">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                <Coins className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Finance & Billing Ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Fee structures, automated student assignment billing, merit scholarships, transfer proof verification, and downloadable PDF receipts.</p>
              <p className="text-xs text-emerald-600 font-medium pt-2">Phase 5 Deliverable · Fully Active</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-slate-200">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
                <Award className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">CBT & Results Engine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Question bank, secure responsive CBT test runner with countdown timer and tab-switch logging, essay grading, and Phase 3 CA sync.</p>
              <p className="text-xs text-indigo-600 font-medium pt-2">Phase 6 Deliverable · Fully Active</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-slate-200">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                <MessageSquare className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Communications & SMTP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Announcements with read receipts, direct messaging between authorized stakeholders, and honest SMTP & FCM delivery status.</p>
              <p className="text-xs text-amber-600 font-medium pt-2">Phase 7 Deliverable · Fully Active</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-slate-200">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2">
                <CalendarRange className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Timetable & 409 Conflict Engine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Room and lab management, bell schedules, automated slot conflict detection blocking double-booking, and PDF timetable exports.</p>
              <p className="text-xs text-purple-600 font-medium pt-2">Phase 8 Deliverable · Fully Active</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow border-slate-200">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-2">
                <Globe className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Microsites & Online Admissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Custom school public websites at <span className="font-mono text-xs">/schools/:slug</span> with built-in online admission application forms.</p>
              <p className="text-xs text-sky-600 font-medium pt-2">Phase 9 Deliverable · Fully Active</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Security & Governance Trust Banner */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#1E3A8A]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>Enterprise Security Architecture</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#0F172A]">
                Engineered with strict isolation and auditable transparency.
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Dave Timi EdTech Systems is built to satisfy institutional compliance requirements. Every database operation enforces tenant isolation via server-verified credentials. Sensitive credentials are protected using robust scrypt password hashing and HTTP-only session cookies.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span className="font-medium text-slate-800">Server-Side Authorization</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span className="font-medium text-slate-800">Complete Audit Logging</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span className="font-medium text-slate-800">Database Integrity Checks</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span className="font-medium text-slate-800">Secure File Attachments</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#0F172A] text-white p-8 rounded-2xl shadow-xl space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-mono text-blue-400">INSTITUTIONAL ONBOARDING</p>
                <h3 className="text-2xl font-bold">Ready to modernize your school?</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Register your institution in minutes and access your dedicated administrative tenant workspace instantly.
                </p>
              </div>
              <div className="space-y-3 pt-2">
                <Button type="button" size="lg" onClick={() => navigate('/register')} className="w-full bg-[#2563EB] hover:bg-blue-600 text-white font-semibold">
                  Register School Tenant
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={() => navigate('/login/school')} className="w-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white">
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
