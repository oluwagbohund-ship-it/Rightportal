import React, { useEffect, useState } from 'react';
import { BookOpen, ClipboardEdit, History, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AcademicTermRecord, ScoreSubmissionBatchRecord } from '../../../types/app.ts';

interface WorkspacePayload {
  activeTerm: (AcademicTermRecord & { session_name: string }) | null;
  assignedClasses: Array<{
    assignment_id: string;
    role_label: string;
    class_id: string;
    class_name: string;
    arm_name: string | null;
  }>;
  assignedSubjects: Array<{
    assignment_id: string;
    subject_id: string;
    subject_name: string;
    subject_code: string;
    class_id: string | null;
    class_name: string | null;
    arm_name: string | null;
  }>;
  scoreBatches: ScoreSubmissionBatchRecord[];
}

export function TeacherAcademicWorkspacePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WorkspacePayload | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<WorkspacePayload>('/api/school/teacher-workspace')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load academic workspace.');
        }
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
        title="Teacher Academic Control Panel"
        description="Enter continuous assessment and examination scores, review your submission history, and record term attendance and form teacher remarks."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/teacher/academics/scores">
              <Button type="button" size="sm">
                <ClipboardEdit className="h-4 w-4" aria-hidden="true" />
                <span>Open Score Sheet</span>
              </Button>
            </Link>
            <Link to="/dashboard/teacher/academics/comments">
              <Button type="button" size="sm" variant="outline">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span>Comments &amp; Attendance</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Academic Term</CardDescription>
            <CardTitle className="text-lg">
              {loading ? '—' : data?.activeTerm ? data.activeTerm.name : 'Not Activated'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {data?.activeTerm
              ? `${data.activeTerm.session_name} · ${data.activeTerm.start_date} → ${data.activeTerm.end_date}`
              : 'Wait for School Administration to activate a term'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned Subjects &amp; Classes</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {loading
                ? '—'
                : `${data?.assignedSubjects.length ?? 0} subject(s) · ${data?.assignedClasses.length ?? 0} class(es)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Strictly scoped by School Administration assignments
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent Score Batches</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {loading ? '—' : data?.scoreBatches.length ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/dashboard/teacher/academics/history"
              className="text-xs font-semibold text-[#1E3A8A] hover:underline"
            >
              Inspect submission &amp; audit history →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <span>Authorized Subject Allocations</span>
              </CardTitle>
              <CardDescription>Click Enter Scores to open the spreadsheet for any allocation</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!data || data.assignedSubjects.length === 0 ? (
              <p className="text-sm text-slate-500">No subject allocations assigned to you yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Class Scope</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.assignedSubjects.map((sub) => (
                    <TableRow key={sub.assignment_id}>
                      <TableCell className="font-semibold text-[#0F172A]">
                        {sub.subject_name}{' '}
                        <span className="font-mono text-xs text-slate-400">({sub.subject_code})</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {sub.class_name
                          ? `${sub.class_name}${sub.arm_name ? ` (${sub.arm_name})` : ''}`
                          : 'Assigned Classes'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/dashboard/teacher/academics/scores?subjectId=${sub.subject_id}${
                            sub.class_id ? `&classId=${sub.class_id}` : ''
                          }`}
                        >
                          <Button type="button" size="sm" variant="outline">
                            Enter Scores
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <span>Recent Submission Batches</span>
              </CardTitle>
              <CardDescription>Latest draft, submitted, and approved score sheets</CardDescription>
            </div>
            <Link to="/dashboard/teacher/academics/history">
              <Button type="button" size="sm" variant="outline">
                Full Log
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {!data || data.scoreBatches.length === 0 ? (
              <p className="text-sm text-slate-500">No assessment score batches saved yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class / Subject</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.scoreBatches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs font-medium text-[#0F172A]">
                        {b.class_name} · {b.subject_name}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{b.term_name}</TableCell>
                      <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
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
