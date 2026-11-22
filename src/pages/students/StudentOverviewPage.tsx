import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord, StudentRecord } from '../../types/app.ts';

interface ClassSubjectItem {
  name: string;
  code: string;
  category: string;
  is_compulsory: number;
  weekly_periods: number;
}

interface StudentPromotionItem {
  id: string;
  action_type: string;
  effective_date: string;
  notes: string;
  from_class_name: string | null;
  to_class_name: string;
  to_arm_name: string | null;
}

interface PublishedTermSummary {
  id: string;
  academic_term_id: string;
  term_name: string;
  session_name: string;
  average_score: number;
  overall_grade: string;
  class_position: number | null;
  class_size: number;
  status: string;
}

interface StudentActiveTerm {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  session_name: string;
}

export function StudentOverviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Enrolled Student');
  const [activeSession, setActiveSession] = useState<AcademicSessionRecord | null>(null);
  const [activeTerm, setActiveTerm] = useState<StudentActiveTerm | null>(null);
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectItem[]>([]);
  const [promotionHistory, setPromotionHistory] = useState<StudentPromotionItem[]>([]);
  const [publishedTermResults, setPublishedTermResults] = useState<PublishedTermSummary[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{
      profile: { title: string; status: string } | null;
      activeSession: AcademicSessionRecord | null;
      activeTerm?: StudentActiveTerm | null;
      studentRecord: StudentRecord | null;
      classSubjects: ClassSubjectItem[];
      promotionHistory: StudentPromotionItem[];
      publishedTermResults?: PublishedTermSummary[];
    }>('/api/school/student-workspace')
      .then((res) => {
        if (!active) return;
        setTitle(res.profile?.title || 'Enrolled Student');
        setActiveSession(res.activeSession ?? null);
        setActiveTerm(res.activeTerm ?? null);
        setStudentRecord(res.studentRecord ?? null);
        setClassSubjects(res.classSubjects ?? []);
        setPromotionHistory(res.promotionHistory ?? []);
        setPublishedTermResults(res.publishedTermResults ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load student portal.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Portal"
        description="Your institutional enrollment record, assigned class curriculum, and academic progression timeline."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/student/results">
              <Button type="button" size="sm">
                Published Results
              </Button>
            </Link>
            <Link to="/dashboard/student/report-cards">
              <Button type="button" size="sm" variant="outline">
                Report Cards
              </Button>
            </Link>
            <Link to="/dashboard/student/term">
              <Button type="button" size="sm" variant="outline">
                Term Schedule
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enrolled Institution</CardDescription>
            <CardTitle className="text-lg">{user?.activeSchoolName ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {studentRecord
              ? `Admission No: ${studentRecord.admission_number}`
              : `${loading ? 'Loading...' : title} · ${user?.activeSchoolCode ?? '—'}`}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Class Placement</CardDescription>
            <CardTitle className="text-lg">
              {loading
                ? '—'
                : studentRecord?.class_name
                  ? `${studentRecord.class_name}${studentRecord.arm_name ? ` (${studentRecord.arm_name})` : ''}`
                  : 'Pending Assignment'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 capitalize">
            {studentRecord ? `Status: ${studentRecord.status}` : 'Assigned by School Administration'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Academic Term</CardDescription>
            <CardTitle className="text-lg">
              {loading ? '—' : activeTerm ? activeTerm.name : activeSession ? activeSession.term : 'Not Yet Activated'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {activeTerm
              ? `${activeTerm.session_name} (${activeTerm.start_date} → ${activeTerm.end_date})`
              : activeSession
                ? `${activeSession.name} (${activeSession.start_date} → ${activeSession.end_date})`
                : 'Your School Administrator will activate the upcoming term.'}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Class Subjects ({classSubjects.length})</CardTitle>
            <CardDescription>Curriculum subjects registered for your current class</CardDescription>
          </CardHeader>
          <CardContent>
            {classSubjects.length === 0 ? (
              <p className="text-xs text-slate-500">
                No subjects have been mapped to your current class yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Periods/Wk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classSubjects.map((sub) => (
                    <TableRow key={sub.code}>
                      <TableCell className="font-mono text-xs">{sub.code}</TableCell>
                      <TableCell className="font-medium text-[#0F172A]">{sub.name}</TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {sub.is_compulsory === 1 ? 'Compulsory' : 'Optional'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{sub.weekly_periods}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Placement &amp; Promotion History ({promotionHistory.length})</CardTitle>
            <CardDescription>Official academic movement ledger</CardDescription>
          </CardHeader>
          <CardContent>
            {promotionHistory.length === 0 ? (
              <p className="text-xs text-slate-500">No class placement movements recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead>Placement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotionHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs tabular-nums">{h.effective_date}</TableCell>
                      <TableCell className="text-xs capitalize text-slate-700">
                        {h.action_type.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-[#1E3A8A]">
                        {h.from_class_name ? `${h.from_class_name} → ` : ''}
                        {h.to_class_name}
                        {h.to_arm_name ? ` (${h.to_arm_name})` : ''}
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
            <CardTitle>Published Terminal Results ({publishedTermResults.length})</CardTitle>
            <CardDescription>Official academic results released by School Administration</CardDescription>
          </div>
          <Link to="/dashboard/student/results">
            <Button type="button" size="sm" variant="outline">
              Open Full Results
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {publishedTermResults.length === 0 ? (
            <p className="text-xs text-slate-500">
              No published terminal results are available yet. Published grades and report cards will appear here automatically.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Position</TableHead>
                  <TableHead className="text-right">Report Card</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishedTermResults.map((pub) => (
                  <TableRow key={pub.id}>
                    <TableCell className="text-xs text-slate-600">{pub.session_name}</TableCell>
                    <TableCell className="font-medium text-[#0F172A]">{pub.term_name}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-[#1E3A8A]">
                      {pub.average_score}%
                    </TableCell>
                    <TableCell className="text-center font-bold">{pub.overall_grade}</TableCell>
                    <TableCell className="text-center tabular-nums text-xs">
                      {pub.class_position ? `${pub.class_position} of ${pub.class_size}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={`/dashboard/student/report-cards?termId=${encodeURIComponent(pub.academic_term_id)}`}
                        className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                      >
                        View Sheet
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
