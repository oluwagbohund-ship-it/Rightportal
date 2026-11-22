import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReportCardSheet } from '../../../components/academics/ReportCardSheet.tsx';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicTermRecord,
  ComputedResultRecord,
  GradingSystemRecord,
  ReportCardPayload,
  ResultPublicationRecord,
  SchoolClassRecord,
} from '../../../types/app.ts';

export function ResultManagementPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [gradingSystems, setGradingSystems] = useState<GradingSystemRecord[]>([]);

  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [gradingSystemId, setGradingSystemId] = useState('');

  const [publications, setPublications] = useState<ResultPublicationRecord[]>([]);
  const [subjectResults, setSubjectResults] = useState<ComputedResultRecord[]>([]);
  const [computing, setComputing] = useState(false);

  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<ReportCardPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, clsRes, gsRes] = await Promise.all([
        apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ gradingSystems: GradingSystemRecord[] }>(
          '/api/school/academics/grading-systems',
        ),
      ]);
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');
      const loadedGs = gsRes.gradingSystems ?? [];

      setTerms(loadedTerms);
      setClasses(loadedClasses);
      setGradingSystems(loadedGs);

      if (!termId && loadedTerms.length > 0) {
        const cur = loadedTerms.find((t) => t.is_current === 1) ?? loadedTerms[0];
        setTermId(cur.id);
      }
      if (!classId && loadedClasses.length > 0) {
        setClassId(loadedClasses[0].id);
      }
      if (!gradingSystemId && loadedGs.length > 0) {
        const def = loadedGs.find((g) => g.is_default === 1) ?? loadedGs[0];
        setGradingSystemId(def.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load results setup.');
    } finally {
      setLoading(false);
    }
  }, [classId, gradingSystemId, termId]);

  const loadResults = useCallback(async () => {
    if (!termId || !classId) {
      setPublications([]);
      setSubjectResults([]);
      return;
    }
    try {
      const res = await apiRequest<{
        publications: ResultPublicationRecord[];
        subjectResults: ComputedResultRecord[];
      }>(`/api/school/academics/results?academicTermId=${termId}&classId=${classId}`);
      setPublications(res.publications ?? []);
      setSubjectResults(res.subjectResults ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch computed results.');
    }
  }, [classId, termId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const handleCompute = async () => {
    if (!termId || !classId) return;
    setComputing(true);
    try {
      const res = await apiRequest<{
        summary: { computedSubjectsCount: number; rankedStudentsCount: number };
      }>('/api/school/academics/results/compute', {
        method: 'POST',
        body: JSON.stringify({
          academicTermId: termId,
          classId,
          gradingSystemId: gradingSystemId || null,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Results computed cleanly',
        description: `Computed ${res.summary.computedSubjectsCount} subject entries across ${res.summary.rankedStudentsCount} student(s).`,
      });
      setPreviewReport(null);
      setPreviewStudentId(null);
      await loadResults();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Computation failed',
        description: err instanceof Error ? err.message : 'Unable to compute class results.',
      });
    } finally {
      setComputing(false);
    }
  };

  const handlePreviewReportCard = async (studentId: string) => {
    if (!termId) return;
    setPreviewStudentId(studentId);
    setLoadingPreview(true);
    try {
      const res = await apiRequest<ReportCardPayload>(
        `/api/school/academics/report-cards/${studentId}?academicTermId=${termId}`,
      );
      setPreviewReport(res);
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Unable to load report card',
        description: err instanceof Error ? err.message : 'Report card preview failed.',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Result Computation & Inspection Engine"
        description="Execute authoritative server-side weighted computation, apply institutional grading scales, assign class & subject positions, and inspect report cards."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/academics/results/review">
              <Button type="button" size="sm" variant="outline">
                Review Queue
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/academics/results/publish">
              <Button type="button" size="sm" variant="outline">
                Publish &amp; Amend
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/academics/broadsheets">
              <Button type="button" size="sm" variant="outline">
                Broadsheets
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card className="no-print">
        <CardHeader>
          <CardTitle>Computation Scope</CardTitle>
          <CardDescription>
            Choose academic term, class, and grading scale to run or inspect terminal computation
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="rm-term">Academic Term</Label>
            <Select id="rm-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.session_name} · {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-cls">Class</Label>
            <Select id="rm-cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-gs">Grading Scale</Label>
            <Select
              id="rm-gs"
              value={gradingSystemId}
              onChange={(e) => setGradingSystemId(e.target.value)}
            >
              {gradingSystems.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            disabled={computing || !termId || !classId}
            onClick={() => void handleCompute()}
          >
            <Calculator className="h-4 w-4" aria-hidden="true" />
            <span>{computing ? 'Computing Results...' : 'Run Result Computation'}</span>
          </Button>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader>
          <CardTitle>Computed Student Standings ({publications.length})</CardTitle>
          <CardDescription>Ranked strictly on server using institutional tie-ranking &amp; rounding policies</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading computation workspace...</p>
          ) : publications.length === 0 ? (
            <p className="text-sm text-slate-500">
              No computed results exist for this class and term yet. Enter teacher scores first, then run computation above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="tabular-nums">Pos</TableHead>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right tabular-nums">Subjects Passed</TableHead>
                  <TableHead className="text-right tabular-nums">Average (%)</TableHead>
                  <TableHead>Overall Grade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Report Card</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publications.map((pub) => (
                  <TableRow key={pub.id}>
                    <TableCell className="font-bold tabular-nums text-[#1E3A8A]">
                      {pub.class_position ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{pub.admission_number}</TableCell>
                    <TableCell className="font-semibold text-[#0F172A]">
                      {pub.first_name} {pub.last_name}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {pub.subjects_passed} / {pub.subjects_count}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-[#0F172A]">
                      {pub.average_score}%
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      {pub.overall_grade} ({pub.overall_remark})
                    </TableCell>
                    <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                      {pub.status.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handlePreviewReportCard(pub.student_id)}
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Inspect Sheet</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {previewStudentId ? (
        loadingPreview ? (
          <Card>
            <CardContent className="pt-6 text-sm text-slate-500">
              Loading institutional report card...
            </CardContent>
          </Card>
        ) : previewReport ? (
          <ReportCardSheet
            report={previewReport}
            pdfUrl={`/api/school/academics/report-cards/${previewStudentId}/pdf?academicTermId=${termId}`}
          />
        ) : null
      ) : null}

      {subjectResults.length > 0 ? (
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Computed Subject Breakdown ({subjectResults.length})</CardTitle>
            <CardDescription>Server-calculated CA, Exam, Percentage, Class Average, and Subject Rank</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right tabular-nums">CA</TableHead>
                  <TableHead className="text-right tabular-nums">Exam</TableHead>
                  <TableHead className="text-right tabular-nums">Total (%)</TableHead>
                  <TableHead className="text-right tabular-nums">Class Avg</TableHead>
                  <TableHead className="text-center tabular-nums">Rank</TableHead>
                  <TableHead>Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjectResults.map((sr) => (
                  <TableRow key={sr.id}>
                    <TableCell className="font-medium text-[#0F172A]">
                      {sr.first_name} {sr.last_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{sr.subject_name}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{sr.ca_score}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{sr.exam_score}</TableCell>
                    <TableCell className="text-right font-bold text-xs tabular-nums text-[#0F172A]">
                      {sr.percentage_score}%
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-slate-500">
                      {sr.class_average}%
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">
                      {sr.subject_position ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-[#1E3A8A]">
                      {sr.grade} ({sr.remark})
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
