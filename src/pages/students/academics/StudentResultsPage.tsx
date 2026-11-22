import React, { useEffect, useMemo, useState } from 'react';
import { Award, BookOpen, FileText, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ComputedResultRecord, ResultPublicationRecord } from '../../../types/app.ts';

interface PublishedResultsResponse {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    admission_number: string;
  } | null;
  publications: ResultPublicationRecord[];
  subjectResults: ComputedResultRecord[];
}

export function StudentResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublishedResultsResponse>({
    student: null,
    publications: [],
    subjectResults: [],
  });
  const [selectedTermId, setSelectedTermId] = useState<string>('');

  useEffect(() => {
    let active = true;
    apiRequest<PublishedResultsResponse>('/api/school/academics/student/published-results')
      .then((res) => {
        if (!active) return;
        setData(res);
        if (res.publications.length > 0) {
          setSelectedTermId(res.publications[0].academic_term_id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load published academic results.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activePublication = useMemo(
    () =>
      data.publications.find((pub) => pub.academic_term_id === selectedTermId) ??
      data.publications[0] ??
      null,
    [data.publications, selectedTermId],
  );

  const termSubjects = useMemo(() => {
    if (!activePublication) return [];
    return data.subjectResults.filter(
      (row) => row.academic_term_id === activePublication.academic_term_id,
    );
  }, [data.subjectResults, activePublication]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Published Terminal Results"
        description="Official subject scores, averages, class positions, and grading outcomes published by School Administration."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/student/report-cards">
              <Button type="button" size="sm" variant="outline">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Report Cards</span>
              </Button>
            </Link>
            <Link to="/dashboard/student/history">
              <Button type="button" size="sm" variant="outline">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>Academic History</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Loading your published terminal results...
          </CardContent>
        </Card>
      ) : data.publications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[#1E3A8A]">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-[#0F172A]">No Published Results Available Yet</h2>
            <p className="mx-auto max-w-md text-xs text-slate-600 leading-relaxed">
              Terminal assessment scores and grades remain locked while under faculty entry or administrative review. Once School Administration formally publishes results for a term, they will appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Select Published Term</CardTitle>
                <CardDescription>
                  {data.student
                    ? `${data.student.first_name} ${data.student.last_name} · Admission No: ${data.student.admission_number}`
                    : 'Verified published academic record'}
                </CardDescription>
              </div>
              <div className="w-full sm:w-72 space-y-1.5">
                <Label htmlFor="student-result-term">Academic Term</Label>
                <Select
                  id="student-result-term"
                  value={activePublication?.academic_term_id ?? ''}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                >
                  {data.publications.map((pub) => (
                    <option key={pub.id} value={pub.academic_term_id}>
                      {pub.session_name} · {pub.term_name}
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
          </Card>

          {activePublication ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Overall Average</CardDescription>
                    <CardTitle className="text-2xl text-[#1E3A8A] tabular-nums">
                      {activePublication.average_score}%
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    {activePublication.class_name}
                    {activePublication.arm_name ? ` (${activePublication.arm_name})` : ''}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Overall Grade</CardDescription>
                    <CardTitle className="text-2xl text-[#0F172A]">
                      {activePublication.overall_grade}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    {activePublication.overall_remark}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Class Position</CardDescription>
                    <CardTitle className="text-2xl text-[#0F172A] tabular-nums">
                      {activePublication.class_position ?? '—'}
                      <span className="ml-1 text-sm font-normal text-slate-500">
                        of {activePublication.class_size}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    Ranked within class cohort
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Subjects Passed</CardDescription>
                    <CardTitle className="text-2xl text-[#0F172A] tabular-nums">
                      {activePublication.subjects_passed} / {activePublication.subjects_count}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500 capitalize">
                    Status: {activePublication.status}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>
                      Subject Performance — {activePublication.session_name} · {activePublication.term_name}
                    </CardTitle>
                    <CardDescription>
                      Verified Continuous Assessment (CA) and Examination totals computed by institutional grading rules
                    </CardDescription>
                  </div>
                  <Link
                    to={`/dashboard/student/report-cards?termId=${encodeURIComponent(activePublication.academic_term_id)}`}
                  >
                    <Button type="button" size="sm">
                      <Award className="h-4 w-4" aria-hidden="true" />
                      <span>Open Report Card</span>
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {termSubjects.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No subject entries recorded for this published term.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">CA Score</TableHead>
                          <TableHead className="text-right">Exam Score</TableHead>
                          <TableHead className="text-right">Total (%)</TableHead>
                          <TableHead className="text-right">Class Avg</TableHead>
                          <TableHead className="text-center">Position</TableHead>
                          <TableHead className="text-center">Grade</TableHead>
                          <TableHead>Remark</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {termSubjects.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium text-[#0F172A]">
                              <span>{row.subject_name}</span>
                              {row.subject_code ? (
                                <span className="ml-2 font-mono text-xs text-slate-400">
                                  {row.subject_code}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-700">
                              {row.ca_score}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-700">
                              {row.exam_score}
                            </TableCell>
                            <TableCell className="text-right font-bold tabular-nums text-[#0F172A]">
                              {row.percentage_score}%
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-600">
                              {row.class_average}%
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-slate-700">
                              {row.subject_position ?? '—'}
                            </TableCell>
                            <TableCell className="text-center font-bold text-[#1E3A8A]">
                              {row.grade}
                            </TableCell>
                            <TableCell className="text-xs text-slate-700">{row.remark}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Published Term Summaries ({data.publications.length})</CardTitle>
              <CardDescription>All official terms released to your student portal</CardDescription>
            </CardHeader>
            <CardContent>
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
                  {data.publications.map((pub) => (
                    <TableRow key={pub.id}>
                      <TableCell className="text-xs text-slate-600">{pub.session_name}</TableCell>
                      <TableCell className="font-medium text-[#0F172A]">{pub.term_name}</TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {pub.class_name}
                        {pub.arm_name ? ` (${pub.arm_name})` : ''}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-[#1E3A8A]">
                        {pub.average_score}%
                      </TableCell>
                      <TableCell className="text-center font-bold text-[#0F172A]">
                        {pub.overall_grade}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-xs text-slate-700">
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
