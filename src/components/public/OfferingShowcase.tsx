import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Coins,
  LayoutGrid,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cn } from '../../lib/utils.ts';

export interface CoreOffering {
  id: 'portals' | 'attendance' | 'finance' | 'cbt';
  index: string;
  title: string;
  shortDesc: string;
  highlights: [string, string, string];
  previewCaption: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

export const CORE_OFFERINGS: CoreOffering[] = [
  {
    id: 'portals',
    index: '01',
    title: 'Dedicated Role Portals',
    shortDesc:
      'Focused workspaces for administrators, teachers, students, and parents with strict school boundaries.',
    highlights: [
      'Instant separation between school staff, learners, and families',
      'Unique School Access Code authorization before onboarding',
      'Responsive workspaces built for both mobile and desktop screens',
    ],
    previewCaption: 'Every member sees only the tools built for their role',
    icon: Users,
  },
  {
    id: 'attendance',
    index: '02',
    title: 'Attendance & QR Check-In',
    shortDesc:
      'Fast morning roll calls, student QR verification, and parent-visible absence alerts.',
    highlights: [
      'Scannable daily QR passes with automatic late thresholds',
      'Clean teacher roll-call sheets organized by class and arm',
      'Structured attendance correction approvals by school admins',
    ],
    previewCaption: 'Verify campus presence across classrooms in seconds',
    icon: QrCode,
  },
  {
    id: 'finance',
    index: '03',
    title: 'Tuition Billing & Receipts',
    shortDesc:
      'Clear term fee schedules, transfer proof review, and verifiable receipts for families.',
    highlights: [
      'Automated fee assignment across classes, arms, and terms',
      'Streamlined transfer receipt upload and bursar verification',
      'Instant printable fee statements and official receipts',
    ],
    previewCaption: 'Transparent school fee balances with clear audit history',
    icon: Coins,
  },
  {
    id: 'cbt',
    index: '04',
    title: 'CBT Exams & Term Results',
    shortDesc:
      'Timed digital assessments that sync directly into broadsheets and student report cards.',
    highlights: [
      'Focused digital test runner with countdown timer and auto-save',
      'Objective auto-scoring paired with smooth essay grading',
      'Printable term report cards published straight to student and parent portals',
    ],
    previewCaption: 'From digital exam desk to published term report card',
    icon: Award,
  },
];

function OfferingGraphicPreview({ offering }: { offering: CoreOffering }) {
  return (
    <div
      key={offering.id}
      className="elastic-panel-swap rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm flex flex-col justify-between gap-6 h-full"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <p className="text-xs font-semibold text-[#2563EB] tabular-nums">
            {offering.index} / Platform Preview
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-[#0F172A]">
            {offering.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{offering.previewCaption}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#1E3A8A]">
          <offering.icon className="h-5 w-5" aria-hidden />
        </div>
      </div>

      {/* Bespoke Graphic Illustration per Offering */}
      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-5">
        {offering.id === 'portals' && (
          <svg
            viewBox="0 0 420 210"
            className="w-full h-auto"
            role="img"
            aria-label="Diagram showing five connected role portals around a school core"
          >
            <defs>
              <linearGradient id="portalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E3A8A" />
                <stop offset="100%" stopColor="#2563EB" />
              </linearGradient>
            </defs>
            {/* Connector Lines */}
            <path
              d="M210 105 L78 46 M210 105 L342 46 M210 105 L78 164 M210 105 L342 164"
              stroke="#93C5FD"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
            {/* Center Core */}
            <rect x="148" y="76" width="124" height="58" rx="14" fill="url(#portalGrad)" />
            <text x="210" y="102" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="700">
              School Workspace
            </text>
            <text x="210" y="119" textAnchor="middle" fill="#BFDBFE" fontSize="10">
              Code-Verified Access
            </text>
            {/* 4 Surrounding Portals */}
            <g>
              <rect x="18" y="20" width="120" height="46" rx="10" fill="#FFFFFF" stroke="#CBD5E1" />
              <text x="78" y="41" textAnchor="middle" fill="#0F172A" fontSize="11" fontWeight="600">
                School Admin
              </text>
              <text x="78" y="55" textAnchor="middle" fill="#64748B" fontSize="9.5">
                Staff · Governance
              </text>
            </g>
            <g>
              <rect x="282" y="20" width="120" height="46" rx="10" fill="#FFFFFF" stroke="#CBD5E1" />
              <text x="342" y="41" textAnchor="middle" fill="#0F172A" fontSize="11" fontWeight="600">
                Teacher Portal
              </text>
              <text x="342" y="55" textAnchor="middle" fill="#64748B" fontSize="9.5">
                Classes · Grading
              </text>
            </g>
            <g>
              <rect x="18" y="144" width="120" height="46" rx="10" fill="#FFFFFF" stroke="#CBD5E1" />
              <text x="78" y="165" textAnchor="middle" fill="#0F172A" fontSize="11" fontWeight="600">
                Student Portal
              </text>
              <text x="78" y="179" textAnchor="middle" fill="#64748B" fontSize="9.5">
                CBT · Report Cards
              </text>
            </g>
            <g>
              <rect x="282" y="144" width="120" height="46" rx="10" fill="#FFFFFF" stroke="#CBD5E1" />
              <text x="342" y="165" textAnchor="middle" fill="#0F172A" fontSize="11" fontWeight="600">
                Parent Portal
              </text>
              <text x="342" y="179" textAnchor="middle" fill="#64748B" fontSize="9.5">
                Fees · Attendance
              </text>
            </g>
          </svg>
        )}

        {offering.id === 'attendance' && (
          <svg
            viewBox="0 0 420 210"
            className="w-full h-auto"
            role="img"
            aria-label="Graphic of daily QR student check-in and weekly class attendance consistency"
          >
            {/* Left QR Scanner Frame */}
            <rect x="18" y="20" width="152" height="170" rx="14" fill="#FFFFFF" stroke="#CBD5E1" />
            <rect x="46" y="40" width="96" height="96" rx="10" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
            <rect x="60" y="54" width="24" height="24" rx="4" fill="#1E3A8A" />
            <rect x="104" y="54" width="24" height="24" rx="4" fill="#1E3A8A" />
            <rect x="60" y="98" width="24" height="24" rx="4" fill="#1E3A8A" />
            <rect x="96" y="96" width="14" height="14" rx="2" fill="#2563EB" />
            <rect x="114" y="110" width="14" height="14" rx="2" fill="#60A5FA" />
            <line x1="42" y1="88" x2="146" y2="88" stroke="#2563EB" strokeWidth="2.5" />
            <text x="94" y="160" textAnchor="middle" fill="#0F172A" fontSize="11" fontWeight="600">
              Morning QR Pass
            </text>
            <text x="94" y="175" textAnchor="middle" fill="#16A34A" fontSize="9.5" fontWeight="600">
              Check-In Verified
            </text>

            {/* Right Presence Chart */}
            <rect x="186" y="20" width="216" height="170" rx="14" fill="#FFFFFF" stroke="#CBD5E1" />
            <text x="206" y="48" fill="#0F172A" fontSize="11.5" fontWeight="700">
              Weekly Class Presence
            </text>
            <text x="206" y="64" fill="#64748B" fontSize="9.5">
              Automated register &amp; guardian notice
            </text>
            {/* Bars */}
            {[
              { x: 212, h: 74, day: 'Mon' },
              { x: 248, h: 82, day: 'Tue' },
              { x: 284, h: 68, day: 'Wed' },
              { x: 320, h: 86, day: 'Thu' },
              { x: 356, h: 78, day: 'Fri' },
            ].map((bar) => (
              <g key={bar.day}>
                <rect x={bar.x} y={160 - 88} width="22" height="88" rx="6" fill="#F1F5F9" />
                <rect x={bar.x} y={160 - bar.h} width="22" height={bar.h} rx="6" fill="#2563EB" />
                <text x={bar.x + 11} y="176" textAnchor="middle" fill="#475569" fontSize="9">
                  {bar.day}
                </text>
              </g>
            ))}
          </svg>
        )}

        {offering.id === 'finance' && (
          <svg
            viewBox="0 0 420 210"
            className="w-full h-auto"
            role="img"
            aria-label="Graphic of transparent tuition statement and instant payment receipt confirmation"
          >
            {/* Ledger Card */}
            <rect x="20" y="18" width="232" height="174" rx="14" fill="#FFFFFF" stroke="#CBD5E1" />
            <text x="38" y="46" fill="#0F172A" fontSize="12" fontWeight="700">
              Term Tuition Statement
            </text>
            <line x1="38" y1="60" x2="234" y2="60" stroke="#E2E8F0" />
            <text x="38" y="84" fill="#475569" fontSize="10.5">
              Tuition &amp; Lab Fee
            </text>
            <text x="234" y="84" textAnchor="end" fill="#0F172A" fontSize="10.5" fontWeight="600">
              Assigned
            </text>
            <text x="38" y="114" fill="#475569" fontSize="10.5">
              Transfer Receipt
            </text>
            <text x="234" y="114" textAnchor="end" fill="#2563EB" fontSize="10.5" fontWeight="600">
              Verified
            </text>
            <text x="38" y="144" fill="#475569" fontSize="10.5">
              Merit Scholarship
            </text>
            <text x="234" y="144" textAnchor="end" fill="#16A34A" fontSize="10.5" fontWeight="600">
              Applied
            </text>
            <rect x="38" y="158" width="196" height="22" rx="6" fill="#ECFDF5" />
            <text x="136" y="173" textAnchor="middle" fill="#047857" fontSize="10" fontWeight="700">
              Balance Cleared · PDF Ready
            </text>

            {/* Right Receipt Card */}
            <rect x="268" y="34" width="132" height="142" rx="14" fill="#1E3A8A" />
            <circle cx="334" cy="76" r="20" fill="#2563EB" />
            <path d="M325 76 L331 82 L344 69" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <text x="334" y="118" textAnchor="middle" fill="#FFFFFF" fontSize="11.5" fontWeight="700">
              Official Receipt
            </text>
            <text x="334" y="136" textAnchor="middle" fill="#BFDBFE" fontSize="9.5">
              Instant Parent Copy
            </text>
            <rect x="292" y="148" width="84" height="10" rx="5" fill="#3B82F6" opacity="0.5" />
          </svg>
        )}

        {offering.id === 'cbt' && (
          <svg
            viewBox="0 0 420 210"
            className="w-full h-auto"
            role="img"
            aria-label="Diagram showing CBT digital assessment timer flowing directly into student report cards"
          >
            {/* Exam Runner Box */}
            <rect x="20" y="20" width="196" height="170" rx="14" fill="#FFFFFF" stroke="#CBD5E1" />
            <text x="38" y="46" fill="#0F172A" fontSize="11.5" fontWeight="700">
              Digital Exam Runner
            </text>
            <rect x="150" y="33" width="50" height="20" rx="6" fill="#EFF6FF" />
            <text x="175" y="47" textAnchor="middle" fill="#1E3A8A" fontSize="9.5" fontWeight="700">
              24:15
            </text>
            <rect x="38" y="64" width="160" height="24" rx="6" fill="#F8FAFC" stroke="#E2E8F0" />
            <text x="50" y="80" fill="#475569" fontSize="9.5">
              Q12 · Multiple Choice
            </text>
            <rect x="38" y="96" width="160" height="26" rx="6" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
            <circle cx="52" cy="109" r="5" fill="#2563EB" />
            <text x="64" y="113" fill="#1E3A8A" fontSize="9.5" fontWeight="600">
              Selected Option Saved
            </text>
            <rect x="38" y="130" width="160" height="24" rx="6" fill="#F8FAFC" stroke="#E2E8F0" />
            <rect x="38" y="164" width="94" height="14" rx="7" fill="#E2E8F0" />
            <rect x="38" y="164" width="68" height="14" rx="7" fill="#2563EB" />

            {/* Arrow Connector */}
            <path d="M224 105 L246 105" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M241 99 L248 105 L241 111" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Report Card Output */}
            <rect x="256" y="20" width="144" height="170" rx="14" fill="#0F172A" />
            <text x="328" y="50" textAnchor="middle" fill="#FFFFFF" fontSize="11.5" fontWeight="700">
              Term Report Sync
            </text>
            <circle cx="328" cy="100" r="30" fill="none" stroke="#1E293B" strokeWidth="7" />
            <circle
              cx="328"
              cy="100"
              r="30"
              fill="none"
              stroke="#3B82F6"
              strokeWidth="7"
              strokeDasharray="152 188"
              strokeLinecap="round"
            />
            <text x="328" y="104" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="700">
              A1
            </text>
            <text x="328" y="156" textAnchor="middle" fill="#93C5FD" fontSize="9.5">
              Broadsheet Updated
            </text>
          </svg>
        )}
      </div>

      <ul className="space-y-2.5">
        {offering.highlights.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-[#2563EB] mt-0.5 shrink-0" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OfferingShowcase() {
  const [selectedId, setSelectedId] = useState<CoreOffering['id']>('portals');
  const activeOffering =
    CORE_OFFERINGS.find((o) => o.id === selectedId) ?? CORE_OFFERINGS[0];

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-stretch">
      <div className="lg:col-span-5 flex flex-col gap-3">
        {CORE_OFFERINGS.map((item) => {
          const active = item.id === activeOffering.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              aria-pressed={active}
              className={cn(
                'elastic-interactive w-full text-left rounded-xl border p-4 sm:p-5 flex items-start gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]',
                active
                  ? 'border-[#2563EB] bg-white shadow-md'
                  : 'border-slate-200 bg-white/75 hover:bg-white hover:border-slate-300',
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                  active
                    ? 'bg-[#1E3A8A] text-white'
                    : 'bg-slate-100 text-slate-600',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold text-[#0F172A]">
                    <span className="tabular-nums text-xs font-mono text-[#2563EB] mr-2">
                      {item.index}.
                    </span>
                    {item.title}
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  {item.shortDesc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="lg:col-span-7">
        <OfferingGraphicPreview offering={activeOffering} />
      </div>
    </div>
  );
}

export function OfferingSummaryIcon() {
  return <LayoutGrid className="h-4 w-4" aria-hidden />;
}

export function TrustIcon() {
  return <ShieldCheck className="h-4 w-4" aria-hidden />;
}
