import React, { useEffect, useState } from 'react';
import { Award, BookOpen, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  PromotionRecommendationRecord,
  ResultPublicationRecord,
  StudentClassHistoryRecord,
  StudentRecord,
  StudentSubjectEnrollmentRecord,
} from '../../../types/app.ts';

interface AcademicHistoryPayload {
  student: StudentRecord;
  classHistory: StudentClassHistoryRecord[];
  subjectEnrollments: StudentSubjectEnrollmentRecord[];
  termSummaries: ResultPublicationRecord[];
  promotions: PromotionRecommendationRecord[];
}

export function StudentAcademicHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AcademicHistoryPayload | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ studentRecord: StudentRecord | null }>('/api/school/student-workspace')
      .then(async (ws) => {
        if (!active) return;
        if (!ws.studentRecord) {
          setHistory(null);
          return;
        }
        const detail = await apiRequest<AcademicHistoryPayload>(
          `/api/school/academics/students/${ws.studentRecord.id}/academic-history`,
        );
        if (!active) return;
        setHistory(detail);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load academic history.');
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
        title="Cumulative Academic History"
        description="Complete chronological record of your class progression, subject enrollments, published term summaries, and promotion decisions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/student/results">
              <Button type="button" size="sm" variant="outline">
                <Award className="h-4 w-4" aria-hidden="true" />
                <span>Published Results</span>
              </Button>
            </Link>
            <Link to="/dashboard/student/report-cards">
              <Button type="button" size="sm">
                <span>Report Cards</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Loading your cumulative academic record...
          </CardContent>
        </Card>
      ) : !history ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            No linked student enrollment record was found for your account yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Admission No.</CardDescription>
                <CardTitle className="font-mono text-lg">{history.student.admission_number}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                Admitted {history.student.admission_date}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Current Placement</CardDescription>
                <CardTitle className="text-lg">
                  {history.student.class_name || 'Unassigned'}
                  {history.student.arm_name ? ` (${history.student.arm_name})` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 capitalize">
                Status: {history.student.status}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Subject Enrollments</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{history.subjectEnrollments.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Historical &amp; current subjects</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Published Terms</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{history.termSummaries.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Official term summaries</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <span>Published Terminal Results History ({history.termSummaries.length})</span>
              </CardTitle>
              <CardDescription>
                Historical term averages, positions, and institutional remarks released to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.termSummaries.length === 0 ? (
                <p className="text-xs text-slate-500">No published terminal summaries recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      <TableHead className="text-center">Position</TableHead>
                      <TableHead className="text-right">Report Card</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.termSummaries.map((sum) => (
                      <TableRow key={sum.id}>
                        <TableCell className="text-xs text-slate-600">{sum.session_name}</TableCell>
                        <TableCell className="font-medium text-[#0F172A]">{sum.term_name}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {sum.class_name}
                          {sum.arm_name ? ` (${sum.arm_name})` : ''}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-[#1E3A8A]">
                          {sum.average_score}%
                        </TableCell>
                        <TableCell className="text-center font-bold">{sum.overall_grade}</TableCell>
                        <TableCell className="text-center tabular-nums text-xs">
                          {sum.class_position ? `${sum.class_position} of ${sum.class_size}` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            to={`/dashboard/student/report-cards?termId=${encodeURIComponent(sum.academic_term_id)}`}
                            className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                          >
                            Open
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                  <span>Class Placement &amp; Progression ({history.classHistory.length})</span>
                </CardTitle>
                <CardDescription>Immutable chronological log of class movements</CardDescription>
              </CardHeader>
              <CardContent>
                {history.classHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No class placement entries recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Movement</TableHead>
                        <TableHead>Class</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.classHistory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs tabular-nums">{item.effective_date}</TableCell>
                          <TableCell className="text-xs capitalize text-slate-700">
                            {item.action_type.replace('_', ' ')}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-[#1E3A8A]">
                            {item.from_class_name ? `${item.from_class_name} → ` : ''}
                            {item.to_class_name}
                            {item.to_arm_name ? ` (${item.to_arm_name})` : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                  <span>Subject Enrollments ({history.subjectEnrollments.length})</span>
                </CardTitle>
                <CardDescription>Subjects assigned across academic sessions</CardDescription>
              </CardHeader>
              <CardContent>
                {history.subjectEnrollments.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Subject enrollments are populated once the school enrolls your class cohort for the session.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.subjectEnrollments.map((enr) => (
                        <TableRow key={enr.id}>
                          <TableCell className="text-xs font-medium text-[#0F172A]">
                            {enr.subject_name}{' '}
                            <span className="font-mono text-slate-400">({enr.subject_code})</span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {enr.session_name}
                            {enr.term_name ? ` · ${enr.term_name}` : ''}
                          </TableCell>
                          <TableCell className="text-xs capitalize text-slate-700">{enr.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {history.promotions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Session Promotion Evaluations ({history.promotions.length})</CardTitle>
                <CardDescription>Formal administrative promotion decisions by session</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead>From Class</TableHead>
                      <TableHead>Recommended To</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead>Evaluation</TableHead>
                      <TableHead>Approval Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.promotions.map((pr) => (
                      <TableRow key={pr.id}>
                        <TableCell className="text-xs text-slate-700">{pr.session_name}</TableCell>
                        <TableCell className="text-xs">{pr.from_class_name}</TableCell>
                        <TableCell className="text-xs font-semibold text-[#1E3A8A]">
                          {pr.recommended_to_class_name || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-semibold">
                          {pr.average_score}%
                        </TableCell>
                        <TableCell className="text-xs capitalize">
                          {pr.recommendation.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-xs capitalize font-medium text-[#0F172A]">
                          {pr.approval_status}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
