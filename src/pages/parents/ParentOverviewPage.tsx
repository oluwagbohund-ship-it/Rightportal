import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
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
        title="Guardian Portal"
        description="Verified guardian visibility into your linked wards, published academic results, report cards, and active school calendar."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/parent/academics">
              <Button type="button" size="sm">
                Ward Academics
              </Button>
            </Link>
            <Link to="/dashboard/parent/report-cards">
              <Button type="button" size="sm" variant="outline">
                Report Cards
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
          <CardHeader className="pb-2">
            <CardDescription>Associated School</CardDescription>
            <CardTitle className="text-lg">{user?.activeSchoolName ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            School Code: {user?.activeSchoolCode ?? '—'}{' '}
            {schoolContact ? `· ${schoolContact}` : ''}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Academic Term</CardDescription>
            <CardTitle className="text-lg">
              {loading ? '—' : activeTerm ? activeTerm.name : activeSession ? activeSession.term : 'Pending'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {activeTerm
              ? `${activeTerm.session_name} (${activeTerm.start_date} → ${activeTerm.end_date})`
              : activeSession
                ? activeSession.name
                : 'No active academic term published yet'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Linked Student Wards</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{loading ? '—' : wards.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {wardPublications.length} published report card summary(ies)
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
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
        <CardContent>
          {wardPublications.length === 0 ? (
            <div className="space-y-4 text-sm text-slate-600">
              <p className="text-xs text-slate-500">
                No published ward results are available yet. Once School Administration publishes a term’s results, report cards and subject breakdowns will appear here automatically.
              </p>
              <div className="flex flex-wrap gap-3">
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
    </div>
  );
}
