import React from 'react';
import { Check, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';

const PHASE_1_MODULES = [
  {
    title: 'Multi-Tenant Relational Core',
    detail:
      'Dedicated database records for schools, users, roles, permissions, school memberships, academic sessions, auth sessions, and audit logs.',
  },
  {
    title: 'Separated Authentication Environments',
    detail:
      'Dedicated Workers Login for authorized DT personnel and isolated School Login for school staff, students, and guardians with HTTP-only cookies.',
  },
  {
    title: 'Five Role-Specific Dashboards',
    detail:
      'Distinct navigation and protected endpoints for Platform Owner, School Administrator, Teacher, Student, and Parent.',
  },
  {
    title: 'School Onboarding & Session Control',
    detail:
      'Public school registration creates an isolated tenant, binds the founding School Administrator, and tracks active academic terms.',
  },
  {
    title: 'Server-Enforced Tenant & RBAC Guards',
    detail:
      'All school endpoints resolve tenant identity from the verified server session cookie and enforce granular role permissions.',
  },
  {
    title: 'Security Monitoring & Audit Trails',
    detail:
      'Every authentication attempt, permission denial, tenant mutation, and platform setting update is written to the audit log.',
  },
];

const LATER_PHASE_MODULES = [
  'DT AI CORE Live Analytics & Academic Insights Inference',
  'Student Enrollment, Class Rosters & Timetable Scheduling',
  'Continuous Assessment Gradebooks & Report Card Generation',
  'Daily Attendance Tracking & Guardian Notifications',
  'Institutional Fee Structures, Invoicing & Payment Reconciliation',
];

export function FeaturesPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 space-y-14">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
          Platform Architecture & Capabilities
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A]">
          Transparent Phase 1 foundation built for scale.
        </h1>
        <p className="text-slate-600 leading-relaxed">
          Dave Timi EdTech Systems separates production-ready Phase 1 infrastructure from capabilities scheduled for Phase 2 and Phase 3—ensuring every active control is backed by real server logic.
        </p>
      </div>

      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-[#0F172A]">
          Active in Phase 1 — Foundation & Architecture
        </h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PHASE_1_MODULES.map((mod) => (
            <Card key={mod.title}>
              <CardHeader>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Implemented</span>
                </div>
                <CardTitle className="mt-1 text-base">{mod.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 leading-relaxed">
                {mod.detail}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>Architectural Roadmap</span>
          </div>
          <CardTitle>Reserved for Phase 2 & Phase 3</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            These academic and intelligence modules are intentionally inactive in Phase 1 while their tenant boundaries and permission hooks are established:
          </p>
          <ul className="grid gap-2.5 sm:grid-cols-2 text-sm text-[#0F172A]">
            {LATER_PHASE_MODULES.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#2563EB] shrink-0" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="pt-3 flex flex-wrap gap-3">
            <Button type="button" onClick={() => navigate('/register')}>
              Register Your School
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/contact')}>
              Request Implementation Brief
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
