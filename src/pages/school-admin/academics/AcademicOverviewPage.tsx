import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileSpreadsheet,
  Layers,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AcademicOverviewPayload } from '../../../types/app.ts';

export function AcademicOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AcademicOverviewPayload | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<AcademicOverviewPayload>('/api/school/academics/overview')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load academic overview.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = data?.stats;

  const kpis = [
    {
      label: 'Academic Sessions & Terms',
      value: stats ? `${stats.sessionsCount} / ${stats.termsCount}` : '—',
      meta: data?.activeTerm
        ? `Active: ${data.activeTerm.session_name} (${data.activeTerm.name})`
        : 'Configure an active term',
      to: '/dashboard/school-admin/academics/sessions',
      icon: CalendarDays,
    },
    {
      label: 'Subject Enrollments',
      value: stats ? String(stats.activeEnrollmentsCount) : '—',
      meta: 'Active student-subject allocations',
      to: '/dashboard/school-admin/academics/enrollments',
      icon: BookOpen,
    },
    {
      label: 'Pending Score Batches',
      value: stats ? String(stats.pendingScoreBatchesCount) : '—',
      meta: `${stats?.assessmentComponentsCount ?? 0} active assessment components`,
      to: '/dashboard/school-admin/academics/results/review',
      icon: ClipboardList,
    },
    {
      label: 'Published Results (Term)',
      value: stats ? String(stats.publishedResultsCount) : '—',
      meta: `${stats?.computedResultsCount ?? 0} subject scores computed`,
      to: '/dashboard/school-admin/academics/results/publish',
      icon: CheckSquare,
    },
    {
      label: 'Scheduled Examinations',
      value: stats ? String(stats.examinationsCount) : '—',
      meta: `${stats?.gradingSystemsCount ?? 0} active grading scale(s)`,
      to: '/dashboard/school-admin/academics/examinations',
      icon: Award,
    },
    {
      label: 'Promotion Decisions',
      value: stats ? String(stats.pendingPromotionsCount) : '—',
      meta: 'Pending explicit admin review',
      to: '/dashboard/school-admin/academics/promotions',
      icon: TrendingUp,
    },
  ];

  const workspaceShortcuts = [
    {
      title: 'Sessions & Policy Settings',
      desc: 'Session lifecycle, overlap rules, rounding & promotion criteria',
      to: '/dashboard/school-admin/academics/sessions',
      icon: CalendarDays,
    },
    {
      title: 'Terms & Academic Calendar',
      desc: 'Term dates, exam windows, holidays & school activities',
      to: '/dashboard/school-admin/academics/terms',
      icon: Layers,
    },
    {
      title: 'Student Subject Enrollment',
      desc: 'Bulk assign compulsory & elective subjects per class/term',
      to: '/dashboard/school-admin/academics/enrollments',
      icon: BookOpen,
    },
    {
      title: 'Assessment Weights',
      desc: 'CA, tests, assignments & exam percentage components',
      to: '/dashboard/school-admin/academics/assessments/components',
      icon: BarChart3,
    },
    {
      title: 'Grading Scales',
      desc: 'Band boundaries, GPA points & pass thresholds',
      to: '/dashboard/school-admin/academics/grading-systems',
      icon: Scale,
    },
    {
      title: 'Results & Broadsheets',
      desc: 'Compute averages, rank classes, publish & export PDF/CSV',
      to: '/dashboard/school-admin/academics/results',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academics & Results Control Center"
        description="End-to-end orchestration across academic calendars, subject enrollments, continuous assessments, examinations, grading scales, results publication, broadsheets, and promotions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/academics/calendar">
              <Button type="button" size="sm" variant="outline">
                Academic Calendar
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/academics/results">
              <Button type="button" size="sm">
                Compute &amp; Manage Results
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.to} className="group block">
              <Card className="h-full transition-colors group-hover:border-[#2563EB]/50">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardDescription className="font-medium text-slate-600">{item.label}</CardDescription>
                  <Icon className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tracking-tight text-[#0F172A] tabular-nums">
                    {loading ? '—' : item.value}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick Module Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle>Academic Engine Modules</CardTitle>
          <CardDescription>Direct navigation to institutional configuration and processing suites</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaceShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <Link
                key={shortcut.to}
                to={shortcut.to}
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-[#2563EB]/60 hover:bg-slate-50"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0F172A]">{shortcut.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{shortcut.desc}</p>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Class Performance Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Class Performance Analytics</CardTitle>
              <CardDescription>
                {data?.activeTerm
                  ? `Computed averages for ${data.activeTerm.session_name} · ${data.activeTerm.name}`
                  : 'Computed class performance snapshot'}
              </CardDescription>
            </div>
            <Link to="/dashboard/school-admin/academics/broadsheets">
              <Button type="button" size="sm" variant="outline">
                Broadsheets
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {!data || data.classPerformance.length === 0 ? (
              <p className="text-sm text-slate-500">
                No class results have been computed yet for the active term.
              </p>
            ) : (
              data.classPerformance.map((cp) => (
                <div key={cp.class_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#0F172A]">{cp.class_name}</span>
                    <span className="text-slate-600 tabular-nums">
                      Avg <strong className="text-[#1E3A8A]">{cp.class_average}%</strong> ·{' '}
                      {cp.ranked_students} student(s) · {cp.published_count} published
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full bg-[#2563EB] transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, cp.class_average))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events + Score Submission Queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Score Submissions</CardTitle>
              <CardDescription>Latest teacher assessment batches awaiting verification or published</CardDescription>
            </div>
            <Link to="/dashboard/school-admin/academics/results/review">
              <Button type="button" size="sm" variant="outline">
                Review Queue
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!data || data.recentBatches.length === 0 ? (
              <p className="text-sm text-slate-500">No teacher score batches submitted yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentBatches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium text-[#0F172A]">{b.subject_name}</TableCell>
                      <TableCell className="text-xs text-slate-600">{b.class_name}</TableCell>
                      <TableCell className="text-xs text-slate-600">{b.term_name}</TableCell>
                      <TableCell className="text-xs font-semibold capitalize text-[#1E3A8A]">
                        {b.status.replace('_', ' ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
