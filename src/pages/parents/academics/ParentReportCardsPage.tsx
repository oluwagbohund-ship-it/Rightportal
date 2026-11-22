import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Lock, ShieldAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ReportCardSheet } from '../../../components/academics/ReportCardSheet.tsx';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ReportCardPayload, ResultPublicationRecord } from '../../../types/app.ts';

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
  wards: ParentWardSummary[];
  publications: ResultPublicationRecord[];
}

export function ParentReportCardsPage() {
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get('studentId') || '';
  const initialTermId = searchParams.get('termId') || '';

  const [loadingList, setLoadingList] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wards, setWards] = useState<ParentWardSummary[]>([]);
  const [publications, setPublications] = useState<ResultPublicationRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [selectedTermId, setSelectedTermId] = useState(initialTermId);
  const [report, setReport] = useState<ReportCardPayload | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<ParentWardsResultsResponse>('/api/school/academics/parent/wards-results')
      .then((res) => {
        if (!active) return;
        const w = res.wards ?? [];
        const p = res.publications ?? [];
        setWards(w);
        setPublications(p);

        const defaultWardId =
          (initialStudentId && w.some((x) => x.student_id === initialStudentId) && initialStudentId) ||
          w.find((x) => x.can_view_academic_records === 1)?.student_id ||
          w[0]?.student_id ||
          '';
        setSelectedStudentId(defaultWardId);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load ward report cards.');
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, [initialStudentId]);

  const selectedWard = useMemo(
    () => wards.find((w) => w.student_id === selectedStudentId) ?? null,
    [wards, selectedStudentId],
  );

  const wardPublications = useMemo(
    () => publications.filter((p) => p.student_id === selectedStudentId),
    [publications, selectedStudentId],
  );

  useEffect(() => {
    if (wardPublications.length === 0) {
      setSelectedTermId('');
      return;
    }
    const preferred =
      (initialTermId && wardPublications.some((p) => p.academic_term_id === initialTermId) && initialTermId) ||
      (wardPublications.some((p) => p.academic_term_id === selectedTermId) && selectedTermId) ||
      wardPublications[0].academic_term_id;
    setSelectedTermId(preferred);
  }, [wardPublications, initialTermId, selectedTermId]);

  useEffect(() => {
    if (
      !selectedStudentId ||
      !selectedTermId ||
      selectedWard?.can_view_academic_records !== 1
    ) {
      setReport(null);
      return;
    }

    let active = true;
    setLoadingReport(true);
    setError(null);
    apiRequest<ReportCardPayload>(
      `/api/school/academics/report-cards/${selectedStudentId}?academicTermId=${encodeURIComponent(selectedTermId)}`,
    )
      .then((res) => {
        if (!active) return;
        setReport(res);
      })
      .catch((err) => {
        if (!active) return;
        setReport(null);
        setError(err instanceof Error ? err.message : 'Unable to load official ward report card.');
      })
      .finally(() => {
        if (active) setLoadingReport(false);
      });
    return () => {
      active = false;
    };
  }, [selectedStudentId, selectedTermId, selectedWard]);

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <PageHeader
          title="Ward Report Cards"
          description="Official institutional report sheets, attendance records, teacher comments, and printable PDF downloads for your linked wards."
          actions={
            <Link to="/dashboard/parent/results">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Ward Results</span>
              </Button>
            </Link>
          }
        />

        {error ? <Alert variant="error">{error}</Alert> : null}

        {!loadingList && wards.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Select Ward &amp; Published Term</CardTitle>
              <CardDescription>Choose a linked ward and published academic term to render their official report sheet</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="parent-rc-ward">Student Ward</Label>
                <Select
                  id="parent-rc-ward"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                >
                  {wards.map((w) => (
                    <option key={w.student_id} value={w.student_id}>
                      {w.first_name} {w.last_name} ({w.admission_number})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parent-rc-term">Published Academic Term</Label>
                <Select
                  id="parent-rc-term"
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  disabled={wardPublications.length === 0}
                >
                  {wardPublications.length === 0 ? (
                    <option value="">No published report cards</option>
                  ) : (
                    wardPublications.map((pub) => (
                      <option key={pub.id} value={pub.academic_term_id}>
                        {pub.session_name} · {pub.term_name} ({pub.overall_grade})
                      </option>
                    ))
                  )}
                </Select>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {loadingList ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Loading linked wards...
          </CardContent>
        </Card>
      ) : wards.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            No student wards are linked to your guardian account yet.
          </CardContent>
        </Card>
      ) : selectedWard && selectedWard.can_view_academic_records !== 1 ? (
        <Alert variant="info" title="Academic Access Restricted">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Academic record viewing permission is disabled for this guardian linkage. Contact School Administration to request access.
            </span>
          </div>
        </Alert>
      ) : wardPublications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2.5">
            <Lock className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#0F172A]">
              No Published Report Cards for {selectedWard?.first_name ?? 'Ward'} Yet
            </p>
            <p className="text-xs text-slate-500">
              Report cards appear here automatically once School Administration formally publishes results for a term.
            </p>
          </CardContent>
        </Card>
      ) : loadingReport ? (
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-sm text-slate-500">
            <FileText className="h-4 w-4 animate-pulse text-[#1E3A8A]" aria-hidden="true" />
            <span>Rendering official ward report card...</span>
          </CardContent>
        </Card>
      ) : report ? (
        <ReportCardSheet
          report={report}
          pdfUrl={`/api/school/academics/report-cards/${selectedStudentId}/pdf?academicTermId=${encodeURIComponent(selectedTermId)}`}
        />
      ) : null}
    </div>
  );
}
