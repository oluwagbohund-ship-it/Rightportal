import React, { useEffect, useState } from 'react';
import { BookOpen, Building2, CalendarDays, FileText, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Skeleton, TableSkeleton } from '../../components/ui/skeleton.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord } from '../../types/app.ts';

interface ParentWardItem {
  guardian_id: string;
  student_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
  arm_name: string | null;
  can_view_academic_records: number;
}

interface WardPublicationSummary {
  student_id: string;
  academic_term_id: string;
  term_name: string;
  average_score: number;
  overall_grade: string;
  class_position: number | null;
  class_size: number;
  status: string;
}

interface ParentActiveTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  session_name: string;
}

export function ParentOverviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolContact, setSchoolContact] = useState('');
  const [activeSession, setActiveSession] = useState<AcademicSessionRecord | null>(null);
  const [activeTerm, setActiveTerm] = useState<ParentActiveTerm | null>(null);
  const [wards, setWards] = useState<ParentWardItem[]>([]);
  const [wardPublications, setWardPublications] = useState<WardPublicationSummary[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{
      profile: { contact_email: string; status: string } | null;
      activeSession: AcademicSessionRecord | null;
      activeTerm?: ParentActiveTerm | null;
      wards?: ParentWardItem[];
      wardPublications?: WardPublicationSummary[];
    }>('/api/school/parent-workspace')
      .then((res) => {
        if (!active) return;
        setSchoolContact(res.profile?.contact_email ?? '');
        setActiveSession(res.activeSession);
        setActiveTerm(res.activeTerm ?? null);
        setWards(res.wards ?? []);
        setWardPublications(res.wardPublications ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load guardian portal.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const wardMap = new Map(wards.map((w) => [w.student_id, w]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Family & Wards"
        title="Guardian Portal"
        description="Verified guardian visibility into your linked wards, published academic results, report cards, and active school calendar."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/parent/academics">
              <Button type="button" size="sm">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>Ward Academics</span>
              </Button>
            </Link>
            <Link to="/dashboard/parent/report-cards">
              <Button type="button" size="sm" variant="outline">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Report Cards</span>
              </Button>
            </Link>
            <Link to="/dashboard/parent/calendar">
              <Button type="button" size="sm" variant="outline">
                Term Calendar
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">Associated School</CardDescription>
            <Building2 className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-lg font-bold text-[#0F172A] truncate">
              {user?.activeSchoolName ?? '—'}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500 truncate">
              School Code: {user?.activeSchoolCode ?? '—'}{' '}
              {schoolContact ? `· ${schoolContact}` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">Current Academic Term</CardDescription>
            <CalendarDays className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-28 my-0.5" />
            ) : (
              <p className="font-display text-lg font-bold text-[#0F172A]">
                {activeTerm ? activeTerm.name : activeSession ? activeSession.term : 'Pending'}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 truncate">
              {activeTerm
                ? `${activeTerm.session_name} (${activeTerm.start_date} → ${activeTerm.end_date})`
                : activeSession
                  ? activeSession.name
                  : 'No active academic term published yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">Linked Student Wards</CardDescription>
            <Users className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-12 my-0.5" />
            ) : (
              <p className="font-display text-2xl font-bold text-[#0F172A] tabular-nums">{wards.length}</p>
            )}
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {wardPublications.length} published report card summary(ies)
            </p>
          </CardContent>
        </Card>
      </div>

      {wards.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
            <div>
              <CardTitle>Linked Wards ({wards.length})</CardTitle>
              <CardDescription>Enrolled students connected to your guardian profile</CardDescription>
            </div>
            <Link to="/dashboard/parent/wards">
              <Button type="button" size="sm" variant="outline">
                Ward Linkage
              </Button>
            </Link>
          </CardHeader>
          <div className="divide-y divide-slate-100">
            {wards.map((ward) => (
              <div key={ward.student_id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-sm">
                <div>
                  <p className="font-semibold text-[#0F172A]">
                    {ward.first_name} {ward.last_name}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    {ward.admission_number}
                    {ward.class_name
                      ? ` · ${ward.class_name}${ward.arm_name ? ` (${ward.arm_name})` : ''}`
                      : ''}
                  </p>
                </div>
                <Link
                  to={`/dashboard/parent/academics?studentId=${encodeURIComponent(ward.student_id)}`}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                >
                  Inspect Academic Progress →
                </Link>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
          <div>
            <CardTitle>Published Ward Academic Summaries ({wardPublications.length})</CardTitle>
            <CardDescription>
              Latest formally released terminal results for authorized wards linked to {user?.fullName}
            </CardDescription>
          </div>
          <Link to="/dashboard/parent/results">
            <Button type="button" size="sm" variant="outline">
              Inspect All Results
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <TableSkeleton rows={3} cols={6} />
          ) : wardPublications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-8 px-4 text-center space-y-4">
              <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
                No published ward results are available yet. Once School Administration publishes a term’s results, report cards and subject breakdowns will appear here automatically.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/dashboard/parent/wards">
                  <Button type="button" size="sm">
                    View Linked Wards
                  </Button>
                </Link>
                <Link to="/dashboard/parent/calendar">
                  <Button type="button" size="sm" variant="outline">
                    Open Term Calendar
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Ward</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Position</TableHead>
                  <TableHead className="text-right">Report Card</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wardPublications.map((pub) => {
                  const ward = wardMap.get(pub.student_id);
                  return (
                    <TableRow key={`${pub.student_id}-${pub.academic_term_id}`}>
                      <TableCell className="font-medium text-[#0F172A]">
                        {ward ? `${ward.first_name} ${ward.last_name}` : 'Linked Ward'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{pub.term_name}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-[#1E3A8A]">
                        {pub.average_score}%
                      </TableCell>
                      <TableCell className="text-center font-bold">{pub.overall_grade}</TableCell>
                      <TableCell className="text-center tabular-nums text-xs">
                        {pub.class_position ? `${pub.class_position} of ${pub.class_size}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/dashboard/parent/report-cards?studentId=${encodeURIComponent(pub.student_id)}&termId=${encodeURIComponent(pub.academic_term_id)}`}
                          className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                        >
                          Open Report Card
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TelegramBotConnectCard mode="portal" audience="school" />
    </div>
  );
}
