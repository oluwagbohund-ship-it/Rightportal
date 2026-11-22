import React, { useEffect, useMemo, useState } from 'react';
import { Award, FileText, Lock, ShieldAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ComputedResultRecord, ResultPublicationRecord } from '../../../types/app.ts';

interface ParentWardSummary {
  student_id: string;
  relationship: string;
  can_view_academic_records: number;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
  arm_name: string | null;
}

interface ParentWardsResultsResponse {
  parent: { id: string; full_name: string } | null;
  wards: ParentWardSummary[];
  publications: ResultPublicationRecord[];
  subjectResults: ComputedResultRecord[];
}

export function ParentWardResultsPage() {
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get('studentId') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ParentWardsResultsResponse>({
    parent: null,
    wards: [],
    publications: [],
    subjectResults: [],
  });
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [selectedTermId, setSelectedTermId] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<ParentWardsResultsResponse>('/api/school/academics/parent/wards-results')
      .then((res) => {
        if (!active) return;
        const wards = res.wards ?? [];
        const pubs = res.publications ?? [];
        setData({
          parent: res.parent ?? null,
          wards,
          publications: pubs,
          subjectResults: res.subjectResults ?? [],
        });

        const preferredWard =
          (initialStudentId && wards.find((w) => w.student_id === initialStudentId)?.student_id) ||
          wards.find((w) => w.can_view_academic_records === 1)?.student_id ||
          wards[0]?.student_id ||
          '';
        setSelectedStudentId(preferredWard);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load ward academic results.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialStudentId]);

  const selectedWard = useMemo(
    () => data.wards.find((w) => w.student_id === selectedStudentId) ?? null,
    [data.wards, selectedStudentId],
  );

  const wardPublications = useMemo(
    () => data.publications.filter((p) => p.student_id === selectedStudentId),
    [data.publications, selectedStudentId],
  );

  useEffect(() => {
    if (wardPublications.length === 0) {
      setSelectedTermId('');
      return;
    }
    if (!wardPublications.some((p) => p.academic_term_id === selectedTermId)) {
      setSelectedTermId(wardPublications[0].academic_term_id);
    }
  }, [wardPublications, selectedTermId]);

  const activePublication = useMemo(
    () =>
      wardPublications.find((p) => p.academic_term_id === selectedTermId) ??
      wardPublications[0] ??
      null,
    [wardPublications, selectedTermId],
  );

  const termSubjects = useMemo(() => {
    if (!activePublication) return [];
    return data.subjectResults.filter(
      (r) =>
        r.student_id === selectedStudentId &&
        r.academic_term_id === activePublication.academic_term_id,
    );
  }, [data.subjectResults, selectedStudentId, activePublication]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ward Published Results"
        description="Inspect published Continuous Assessment, examination totals, grades, and class rankings for each authorized ward."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/parent/academics">
              <Button type="button" size="sm" variant="outline">
                Academic Overview
              </Button>
            </Link>
            <Link to="/dashboard/parent/report-cards">
              <Button type="button" size="sm">
                <FileText className="h-4 w-4" aria-hidden="true" />
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
            Loading ward results...
          </CardContent>
        </Card>
      ) : data.wards.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            No student wards are linked to your guardian account yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Filter by Ward &amp; Published Term</CardTitle>
              <CardDescription>
                Only formally published results for wards with academic access enabled are displayed
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="parent-ward-select">Student Ward</Label>
                <Select
                  id="parent-ward-select"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                >
                  {data.wards.map((w) => (
                    <option key={w.student_id} value={w.student_id}>
                      {w.first_name} {w.last_name} ({w.admission_number}) — {w.class_name || 'Unassigned'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parent-term-select">Published Academic Term</Label>
                <Select
                  id="parent-term-select"
                  value={activePublication?.academic_term_id ?? ''}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  disabled={wardPublications.length === 0}
                >
                  {wardPublications.length === 0 ? (
                    <option value="">No published terms available</option>
                  ) : (
                    wardPublications.map((pub) => (
                      <option key={pub.id} value={pub.academic_term_id}>
                        {pub.session_name} · {pub.term_name}
                      </option>
                    ))
                  )}
                </Select>
              </div>
            </CardContent>
          </Card>

          {selectedWard && selectedWard.can_view_academic_records !== 1 ? (
            <Alert variant="info" title="Academic Access Restricted">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Academic record visibility is currently disabled for your guardian linkage with{' '}
                  {selectedWard.first_name} {selectedWard.last_name}. Contact School Administration to update guardian permissions.
                </span>
              </div>
            </Alert>
          ) : wardPublications.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2.5">
                <Lock className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#0F172A]">
                  No Published Results for {selectedWard?.first_name ?? 'Selected Ward'} Yet
                </p>
                <p className="text-xs text-slate-500">
                  Draft and under-review scores remain private until School Administration publishes the term.
                </p>
              </CardContent>
            </Card>
          ) : activePublication ? (
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
                  <CardContent className="text-xs text-slate-500">Cohort position</CardContent>
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
                      Subject Results — {activePublication.session_name} · {activePublication.term_name}
                    </CardTitle>
                    <CardDescription>
                      Published breakdown for {selectedWard?.first_name} {selectedWard?.last_name}
                    </CardDescription>
                  </div>
                  <Link
                    to={`/dashboard/parent/report-cards?studentId=${encodeURIComponent(selectedStudentId)}&termId=${encodeURIComponent(activePublication.academic_term_id)}`}
                  >
                    <Button type="button" size="sm">
                      <Award className="h-4 w-4" aria-hidden="true" />
                      <span>Open Report Card</span>
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {termSubjects.length === 0 ? (
                    <p className="text-xs text-slate-500">No subject results found for this term.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">CA</TableHead>
                          <TableHead className="text-right">Exam</TableHead>
                          <TableHead className="text-right">Total (%)</TableHead>
                          <TableHead className="text-right">Class Avg</TableHead>
                          <TableHead className="text-center">Pos</TableHead>
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
        </>
      )}
    </div>
  );
}
