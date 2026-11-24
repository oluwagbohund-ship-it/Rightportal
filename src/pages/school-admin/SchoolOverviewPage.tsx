import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Building2, ClipboardCheck, GraduationCap, UserCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord, SchoolRecord } from '../../types/app.ts';

interface SchoolOverviewCounts {
  totalMembers: number;
  admins: number;
  teachers: number;
  activeTeachers: number;
  students: number;
  activeStudents: number;
  parents: number;
  classes: number;
  subjects: number;
  pendingAdmissions: number;
  academicSessions: number;
  pendingScoreBatches?: number;
  publishedResultsCount?: number;
  pendingPromotionsCount?: number;
}

interface ActiveTermSummary {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  session_name: string;
}

interface RecentStudentItem {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  status: string;
  admission_date: string;
  class_name: string | null;
  arm_name: string | null;
}

interface RecentTeacherItem {
  id: string;
  staff_id_number: string;
  first_name: string;
  last_name: string;
  specialization: string;
  employment_status: string;
  employment_date: string;
}

interface RecentActivityItem {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  resource_type: string;
  outcome: string;
  created_at: string;
}

export function SchoolOverviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<(SchoolRecord & { logo_file_id?: string | null; motto?: string }) | null>(null);
  const [currentSession, setCurrentSession] = useState<AcademicSessionRecord | null>(null);
  const [activeTerm, setActiveTerm] = useState<ActiveTermSummary | null>(null);
  const [counts, setCounts] = useState<SchoolOverviewCounts>({
    totalMembers: 0,
    admins: 0,
    teachers: 0,
    activeTeachers: 0,
    students: 0,
    activeStudents: 0,
    parents: 0,
    classes: 0,
    subjects: 0,
    pendingAdmissions: 0,
    academicSessions: 0,
    pendingScoreBatches: 0,
    publishedResultsCount: 0,
    pendingPromotionsCount: 0,
  });
  const [recentStudents, setRecentStudents] = useState<RecentStudentItem[]>([]);
  const [recentTeachers, setRecentTeachers] = useState<RecentTeacherItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{
      school: SchoolRecord & { logo_file_id?: string | null; motto?: string };
      currentSession: AcademicSessionRecord | null;
      activeTerm?: ActiveTermSummary | null;
      counts: SchoolOverviewCounts;
      recentStudents: RecentStudentItem[];
      recentTeachers: RecentTeacherItem[];
      recentActivity: RecentActivityItem[];
    }>('/api/school/overview')
      .then((res) => {
        if (!active) return;
        setSchool(res.school);
        setCurrentSession(res.currentSession);
        setActiveTerm(res.activeTerm ?? null);
        setCounts(res.counts);
        setRecentStudents(res.recentStudents ?? []);
        setRecentTeachers(res.recentTeachers ?? []);
        setRecentActivity(res.recentActivity ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load school overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = [
    {
      label: 'Total Students',
      value: counts.students,
      meta: `${counts.activeStudents} active enrollment${counts.activeStudents === 1 ? '' : 's'}`,
      icon: GraduationCap,
      to: '/dashboard/school-admin/students',
    },
    {
      label: 'Faculty Teachers',
      value: counts.teachers,
      meta: `${counts.activeTeachers} active staff member${counts.activeTeachers === 1 ? '' : 's'}`,
      icon: UserCheck,
      to: '/dashboard/school-admin/teachers',
    },
    {
      label: 'Parents & Guardians',
      value: counts.parents,
      meta: 'Verified family profiles',
      icon: Users,
      to: '/dashboard/school-admin/parents',
    },
    {
      label: 'Active Classes',
      value: counts.classes,
      meta: 'Class levels & arms',
      icon: Building2,
      to: '/dashboard/school-admin/classes',
    },
    {
      label: 'Curriculum Subjects',
      value: counts.subjects,
      meta: 'Active school subjects',
      icon: BookOpen,
      to: '/dashboard/school-admin/subjects',
    },
    {
      label: 'Admissions Pipeline',
      value: counts.pendingAdmissions,
      meta: 'Pending or approved intake',
      icon: ClipboardCheck,
      to: '/dashboard/school-admin/admissions',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={school?.name ? `${school.name} — Overview` : 'School Overview'}
        description="Real-time operational metrics across students, faculty, guardians, classes, curriculum subjects, and admissions."
        actions={
          <div className="flex flex-wrap gap-2.5">
            <Link to="/dashboard/school-admin/academics">
              <Button type="button" size="sm" variant="outline">
                Academics &amp; Results
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/admissions/new">
              <Button type="button" size="sm" variant="outline">
                New Application
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/students/register">
              <Button type="button" size="sm">
                Register Student
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              {school?.logo_file_id ? (
                <img
                  src={`/api/school/files/${school.logo_file_id}/download`}
                  alt={`${school.name} crest`}
                  className="h-14 w-14 rounded-lg border border-slate-200 object-cover bg-slate-50 shrink-0"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#0F172A] text-white font-bold text-lg">
                  {(school?.name ?? 'S').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-base font-bold text-[#0F172A] truncate">
                    {school?.name ?? user?.activeSchoolName ?? 'School Institution'}
                  </p>
                  <span className="font-mono text-xs font-semibold text-[#1E3A8A]">
                    {school?.code ?? user?.activeSchoolCode}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  {school?.motto ? `"${school.motto}" · ` : ''}
                  {activeTerm
                    ? `Active Term: ${activeTerm.session_name} · ${activeTerm.name} (${activeTerm.start_date} → ${activeTerm.end_date})`
                    : currentSession
                      ? `Current Session: ${currentSession.name} (${currentSession.term})`
                      : 'No active academic term configured yet'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <Link to="/dashboard/school-admin/profile">
                <Button type="button" size="sm" variant="outline">
                  School Profile
                </Button>
              </Link>
              <Link to="/dashboard/school-admin/settings">
                <Button type="button" size="sm" variant="outline">
                  Numbering Settings
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link key={metric.label} to={metric.to} className="group block">
              <Card className="h-full transition-colors group-hover:border-[#2563EB]/50">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardDescription className="font-medium text-slate-600">
                    {metric.label}
                  </CardDescription>
                  <Icon className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tracking-tight text-[#0F172A] tabular-nums">
                    {loading ? '—' : metric.value}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{metric.meta}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Academic Engine &amp; Results Readiness</CardTitle>
            <CardDescription>
              Real-time score submission queues, published terminal results, and pending promotion evaluations
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/academics/results/review">
              <Button type="button" size="sm" variant="outline">
                Review Score Batches ({counts.pendingScoreBatches ?? 0})
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/academics/promotions">
              <Button type="button" size="sm" variant="outline">
                Promotions ({counts.pendingPromotionsCount ?? 0})
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/academics">
              <Button type="button" size="sm">
                Open Academic Hub
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
            <p className="text-xs text-slate-500">Pending Score Batches</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums">
              {loading ? '—' : counts.pendingScoreBatches ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
            <p className="text-xs text-slate-500">Published Report Cards</p>
            <p className="mt-1 text-2xl font-bold text-[#1E3A8A] tabular-nums">
              {loading ? '—' : counts.publishedResultsCount ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
            <p className="text-xs text-slate-500">Pending Promotion Approvals</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums">
              {loading ? '—' : counts.pendingPromotionsCount ?? 0}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Students</CardTitle>
              <CardDescription>Latest student admissions & placements</CardDescription>
            </div>
            <Link
              to="/dashboard/school-admin/students"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap"
            >
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentStudents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <p className="text-sm font-medium text-[#0F172A]">No students registered yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Register a student directly or convert an approved admission application.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentStudents.map((st) => (
                    <TableRow key={st.id}>
                      <TableCell className="font-mono text-xs">{st.admission_number}</TableCell>
                      <TableCell className="font-medium">
                        <Link
                          to={`/dashboard/school-admin/students/${st.id}`}
                          className="text-[#1E3A8A] hover:underline"
                        >
                          {st.first_name} {st.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {st.class_name
                          ? `${st.class_name}${st.arm_name ? ` (${st.arm_name})` : ''}`
                          : 'Unassigned'}
                      </TableCell>
                      <TableCell className="text-xs capitalize text-slate-700">{st.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Teachers</CardTitle>
              <CardDescription>Newly onboarded academic staff</CardDescription>
            </div>
            <Link
              to="/dashboard/school-admin/teachers"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap"
            >
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentTeachers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <p className="text-sm font-medium text-[#0F172A]">No teachers registered yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Add teachers to assign them to classes and curriculum subjects.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTeachers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.staff_id_number}</TableCell>
                      <TableCell className="font-medium">
                        <Link
                          to={`/dashboard/school-admin/teachers/${t.id}`}
                          className="text-[#1E3A8A] hover:underline"
                        >
                          {t.first_name} {t.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {t.specialization || 'General'}
                      </TableCell>
                      <TableCell className="text-xs capitalize text-slate-700">
                        {t.employment_status.replace('_', ' ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Recent Administrative Activity</CardTitle>
            <CardDescription>Audited actions across school records inside your tenant</CardDescription>
          </div>
          <Link
            to="/dashboard/school-admin/audit-logs"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap"
          >
            <span>Full Audit Log</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">No administrative activity recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Resource</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs text-slate-500 tabular-nums">
                      {item.created_at}
                    </TableCell>
                    <TableCell className="font-medium text-xs text-[#0F172A]">{item.action}</TableCell>
                    <TableCell className="text-xs text-slate-600">{item.actor_email}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.resource_type}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TelegramBotConnectCard mode="portal" audience="school" />
    </div>
  );
}
