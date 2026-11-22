import React from 'react';
import { Download, Printer } from 'lucide-react';
import { Logo } from '../brand/Logo.tsx';
import { Button } from '../ui/button.tsx';
import type { ReportCardPayload } from '../../types/app.ts';

interface ReportCardSheetProps {
  report: ReportCardPayload;
  pdfUrl: string;
}

export function ReportCardSheet({ report, pdfUrl }: ReportCardSheetProps) {
  const {
    school,
    term,
    student,
    template,
    publication,
    subjectResults,
    gradingBands,
    attendance,
    traits,
    teacherComment,
    principalComment,
  } = report;

  const fullName = `${student.first_name} ${student.middle_name ? `${student.middle_name} ` : ''}${student.last_name}`;
  const classDisplay = `${publication.result_class_name}${publication.result_arm_name ? ` (${publication.result_arm_name})` : ''}`;

  const showPosition = template ? template.show_position === 1 : true;
  const showClassAverage = template ? template.show_class_average === 1 : true;
  const showAttendance = template ? template.show_attendance === 1 : true;
  const showTraits = template ? template.show_affective_traits === 1 : true;
  const showScale = template ? template.show_grading_scale === 1 : true;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs text-slate-600">
          Official Report Sheet ·{' '}
          <span className="font-semibold text-[#0F172A]">
            {term.session_name} · {term.name}
          </span>{' '}
          · Status:{' '}
          <span className="font-semibold uppercase text-[#1E3A8A]">{publication.status}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            <span>Print Report Card</span>
          </Button>
          <a href={pdfUrl} download>
            <Button type="button" size="sm">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download PDF</span>
            </Button>
          </a>
        </div>
      </div>

      <article className="print-sheet mx-auto max-w-4xl rounded-xl border border-slate-300 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        {/* School Identity Header (preserving tenant custom logo) */}
        <header className="report-card-header flex flex-col gap-4 border-b-2 border-[#0F172A] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {school.logo_file_id ? (
              <img
                src={`/api/school/files/${school.logo_file_id}/download`}
                alt={`${school.name} crest`}
                className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover bg-slate-50"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#0F172A] text-white font-bold text-xl">
                {school.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
                {school.name}
              </h2>
              {school.motto ? (
                <p className="text-xs italic text-slate-600">&ldquo;{school.motto}&rdquo;</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-600">
                {[school.physical_address, school.city, school.country].filter(Boolean).join(', ')}
                {school.contact_email ? ` · ${school.contact_email}` : ''}
              </p>
            </div>
          </div>

          <div className="sm:text-right shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              {template?.header_subtitle || 'Terminal Academic Report Card'}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#0F172A]">
              {term.session_name} · {term.name}
            </p>
            <p className="text-xs font-mono text-slate-500">Code: {school.code}</p>
          </div>
        </header>

        {/* Student Metadata Summary Grid */}
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-[#F8FAFC] p-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div>
            <p className="text-slate-500">Student Name</p>
            <p className="mt-0.5 text-sm font-bold text-[#0F172A]">{fullName}</p>
          </div>
          <div>
            <p className="text-slate-500">Admission Number</p>
            <p className="mt-0.5 text-sm font-mono font-semibold text-[#0F172A]">
              {student.admission_number}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Class / Arm</p>
            <p className="mt-0.5 text-sm font-semibold text-[#1E3A8A]">{classDisplay}</p>
          </div>
          <div>
            <p className="text-slate-500">Gender</p>
            <p className="mt-0.5 text-sm font-medium text-[#0F172A]">{student.gender}</p>
          </div>
        </section>

        {/* Overall Performance KPI Row */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Subjects Passed
            </p>
            <p className="mt-1 text-lg font-bold text-[#0F172A] tabular-nums">
              {publication.subjects_passed} / {publication.subjects_count}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Overall Average
            </p>
            <p className="mt-1 text-lg font-bold text-[#1E3A8A] tabular-nums">
              {publication.average_score}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Overall Grade
            </p>
            <p className="mt-1 text-lg font-bold text-[#0F172A]">
              {publication.overall_grade}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({publication.overall_remark})
              </span>
            </p>
          </div>
          {showPosition ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Class Position
              </p>
              <p className="mt-1 text-lg font-bold text-[#0F172A] tabular-nums">
                {publication.class_position ? `${publication.class_position}` : '—'}{' '}
                <span className="text-xs font-normal text-slate-500">
                  of {publication.class_size}
                </span>
              </p>
            </div>
          ) : null}
        </section>

        {/* Subject Breakdown Table */}
        <section className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-[#0F172A] text-white">
                <th className="px-3 py-2.5 font-semibold">Subject</th>
                <th className="px-3 py-2.5 font-semibold text-right tabular-nums">CA</th>
                <th className="px-3 py-2.5 font-semibold text-right tabular-nums">Exam</th>
                <th className="px-3 py-2.5 font-semibold text-right tabular-nums">Total (%)</th>
                {showClassAverage ? (
                  <th className="px-3 py-2.5 font-semibold text-right tabular-nums">Class Avg</th>
                ) : null}
                {showPosition ? (
                  <th className="px-3 py-2.5 font-semibold text-center tabular-nums">Pos</th>
                ) : null}
                <th className="px-3 py-2.5 font-semibold text-center">Grade</th>
                <th className="px-3 py-2.5 font-semibold">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 border border-slate-200">
              {subjectResults.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-[#0F172A]">
                    <span>{row.subject_name}</span>
                    {row.subject_code ? (
                      <span className="ml-2 font-mono text-[11px] text-slate-400">
                        {row.subject_code}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.ca_score}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.exam_score}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-[#0F172A]">
                    {row.percentage_score}%
                  </td>
                  {showClassAverage ? (
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {row.class_average}%
                    </td>
                  ) : null}
                  {showPosition ? (
                    <td className="px-3 py-2 text-center tabular-nums text-slate-700">
                      {row.subject_position ?? '—'}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-center font-bold text-[#1E3A8A]">{row.grade}</td>
                  <td className="px-3 py-2 text-slate-700">{row.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Attendance + Behavioral/Psychomotor Traits */}
        {(showAttendance && attendance) || (showTraits && traits.length > 0) ? (
          <section className="grid gap-4 sm:grid-cols-2">
            {showAttendance && attendance ? (
              <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#0F172A]">
                  Term Attendance Summary
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Days Opened:</span>{' '}
                    <span className="font-semibold tabular-nums">{attendance.days_opened}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Days Present:</span>{' '}
                    <span className="font-semibold tabular-nums text-emerald-700">
                      {attendance.days_present}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Days Absent:</span>{' '}
                    <span className="font-semibold tabular-nums text-slate-700">
                      {attendance.days_absent}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Late Arrivals:</span>{' '}
                    <span className="font-semibold tabular-nums text-slate-700">
                      {attendance.late_count}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {showTraits && traits.length > 0 ? (
              <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#0F172A]">
                  Affective &amp; Psychomotor Traits (Scale 1–5)
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {traits.map((t) => (
                    <div key={`${t.trait_category}-${t.trait_name}`} className="flex justify-between gap-2">
                      <span className="text-slate-600 truncate">{t.trait_name}</span>
                      <span className="font-bold tabular-nums text-[#1E3A8A]">{t.rating}/5</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Teacher & Principal Comments */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Class Teacher&rsquo;s Remark
            </p>
            <p className="text-sm text-[#0F172A] leading-relaxed">
              {teacherComment || 'Consistent academic participation recorded throughout the term.'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {template?.principal_title || 'Principal / Head of School'}&rsquo;s Remark
            </p>
            <p className="text-sm text-[#0F172A] leading-relaxed">
              {principalComment || 'Satisfactory progress. Continue building strong study habits.'}
            </p>
          </div>
        </section>

        {/* Grading Key */}
        {showScale && gradingBands.length > 0 ? (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-2">
              Institutional Grading Scale Key
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
              {gradingBands.map((b, i) => (
                <span key={`${b.grade}-${i}`} className="tabular-nums">
                  <strong className="text-[#0F172A]">{b.grade}</strong> ({b.min_score}–{b.max_score}%):{' '}
                  {b.remark}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Footer with Official Dave Timi EdTech Platform Attribution */}
        <footer className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {template?.footer_note ||
              'Official academic record generated under verified school tenant authority.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400">Powered by</span>
            <Logo variant="dark" size="xs" />
          </div>
        </footer>
      </article>
    </div>
  );
}
