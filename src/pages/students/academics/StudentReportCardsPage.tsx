import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Lock } from 'lucide-react';
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

interface PublishedResultsResponse {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    admission_number: string;
  } | null;
  publications: ResultPublicationRecord[];
}

export function StudentReportCardsPage() {
  const [searchParams] = useSearchParams();
  const initialTermId = searchParams.get('termId') || '';

  const [loadingList, setLoadingList] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string>('');
  const [publications, setPublications] = useState<ResultPublicationRecord[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>(initialTermId);
  const [report, setReport] = useState<ReportCardPayload | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<PublishedResultsResponse>('/api/school/academics/student/published-results')
      .then((res) => {
        if (!active) return;
        const pubs = res.publications ?? [];
        setStudentId(res.student?.id ?? '');
        setPublications(pubs);
        if (pubs.length > 0) {
          const matched = initialTermId && pubs.some((p) => p.academic_term_id === initialTermId);
          setSelectedTermId(matched ? initialTermId : pubs[0].academic_term_id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load published report cards.');
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, [initialTermId]);

  useEffect(() => {
    if (!studentId || !selectedTermId) {
      setReport(null);
      return;
    }
    let active = true;
    setLoadingReport(true);
    setError(null);
    apiRequest<ReportCardPayload>(
      `/api/school/academics/report-cards/${studentId}?academicTermId=${encodeURIComponent(selectedTermId)}`,
    )
      .then((res) => {
        if (!active) return;
        setReport(res);
      })
      .catch((err) => {
        if (!active) return;
        setReport(null);
        setError(err instanceof Error ? err.message : 'Unable to load report card sheet.');
      })
      .finally(() => {
        if (active) setLoadingReport(false);
      });
    return () => {
      active = false;
    };
  }, [studentId, selectedTermId]);

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <PageHeader
          title="Official Report Cards"
          description="Print-ready institutional report sheets and official PDF downloads for your published academic terms."
          actions={
            <Link to="/dashboard/student/results">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Results</span>
              </Button>
            </Link>
          }
        />

        {error ? <Alert variant="error">{error}</Alert> : null}

        {!loadingList && publications.length > 0 ? (
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Published Report Card Archive</CardTitle>
                <CardDescription>
                  Select an academic term to view, print, or download the official PDF report sheet
                </CardDescription>
              </div>
              <div className="w-full sm:w-80 space-y-1.5">
                <Label htmlFor="student-report-term">Published Academic Term</Label>
                <Select
                  id="student-report-term"
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                >
                  {publications.map((pub) => (
                    <option key={pub.id} value={pub.academic_term_id}>
                      {pub.session_name} · {pub.term_name} ({pub.overall_grade})
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
          </Card>
        ) : null}
      </div>

      {loadingList ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Checking published report cards...
          </CardContent>
        </Card>
      ) : publications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[#1E3A8A]">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-[#0F172A]">No Published Report Cards Yet</h2>
            <p className="mx-auto max-w-md text-xs text-slate-600 leading-relaxed">
              Report cards are generated exclusively for formally published terms. Once your School Administrator publishes results, your institutional report sheet and PDF download will appear here.
            </p>
          </CardContent>
        </Card>
      ) : loadingReport ? (
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-sm text-slate-500">
            <FileText className="h-4 w-4 animate-pulse text-[#1E3A8A]" aria-hidden="true" />
            <span>Rendering official report card...</span>
          </CardContent>
        </Card>
      ) : report ? (
        <ReportCardSheet
          report={report}
          pdfUrl={`/api/school/academics/report-cards/${studentId}/pdf?academicTermId=${encodeURIComponent(selectedTermId)}`}
        />
      ) : null}
    </div>
  );
}
