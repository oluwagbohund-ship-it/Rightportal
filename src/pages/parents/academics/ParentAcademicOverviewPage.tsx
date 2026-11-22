import React, { useEffect, useState } from 'react';
import { Award, FileText, ShieldAlert, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ResultPublicationRecord } from '../../../types/app.ts';

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
}

export function ParentAcademicOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ParentWardsResultsResponse>({
    parent: null,
    wards: [],
    publications: [],
  });

  useEffect(() => {
    let active = true;
    apiRequest<ParentWardsResultsResponse>('/api/school/academics/parent/wards-results')
      .then((res) => {
        if (!active) return;
        setData({
          parent: res.parent ?? null,
          wards: res.wards ?? [],
          publications: res.publications ?? [],
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load ward academic overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const authorizedWards = data.wards.filter((w) => w.can_view_academic_records === 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ward Academic Overview"
        description="Consolidated guardian view of published academic summaries, term rankings, and official report cards for your linked wards."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/parent/results">
              <Button type="button" size="sm" variant="outline">
                <Award className="h-4 w-4" aria-hidden="true" />
                <span>Ward Results</span>
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
            Loading linked ward academic summaries...
          </CardContent>
        </Card>
      ) : data.wards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[#1E3A8A]">
              <Users className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-[#0F172A]">No Linked Wards Found</h2>
            <p className="mx-auto max-w-md text-xs text-slate-600">
              Your guardian profile has not yet been linked to any student records. Contact School Administration to link your wards.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Linked Wards</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{data.wards.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                {authorizedWards.length} authorized for academic records
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Published Report Terms</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{data.publications.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                Released by School Administration
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Guardian Account</CardDescription>
                <CardTitle className="text-lg truncate">
                  {data.parent?.full_name || 'Verified Guardian'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Active family linkage</CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.wards.map((ward) => {
              const wardPubs = data.publications.filter((p) => p.student_id === ward.student_id);
              const latest = wardPubs[0] ?? null;

              return (
                <Card key={ward.student_id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>
                        {ward.first_name} {ward.last_name}
                      </CardTitle>
                      <CardDescription>
                        <span className="font-mono">{ward.admission_number}</span> ·{' '}
                        {ward.class_name || 'Unassigned'}
                        {ward.arm_name ? ` (${ward.arm_name})` : ''} · {ward.relationship}
                      </CardDescription>
                    </div>
                    {ward.can_view_academic_records === 1 ? (
                      <Link
                        to={`/dashboard/parent/results?studentId=${encodeURIComponent(ward.student_id)}`}
                      >
                        <Button type="button" size="sm" variant="outline">
                          Inspect Results
                        </Button>
                      </Link>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    {ward.can_view_academic_records !== 1 ? (
                      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          Academic record viewing permission is not enabled on this guardian link. Contact School Administration if you require results access.
                        </span>
                      </div>
                    ) : !latest ? (
                      <p className="text-xs text-slate-500">
                        No published terminal results are available for this ward yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3 text-xs">
                          <div>
                            <p className="text-slate-500">Latest Term</p>
                            <p className="font-semibold text-[#0F172A]">{latest.term_name}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Average / Grade</p>
                            <p className="font-bold text-[#1E3A8A] tabular-nums">
                              {latest.average_score}% ({latest.overall_grade})
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Class Position</p>
                            <p className="font-semibold text-[#0F172A] tabular-nums">
                              {latest.class_position
                                ? `${latest.class_position} of ${latest.class_size}`
                                : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/dashboard/parent/results?studentId=${encodeURIComponent(ward.student_id)}`}
                          >
                            <Button type="button" size="sm" variant="outline">
                              Subject Breakdown
                            </Button>
                          </Link>
                          <Link
                            to={`/dashboard/parent/report-cards?studentId=${encodeURIComponent(ward.student_id)}&termId=${encodeURIComponent(latest.academic_term_id)}`}
                          >
                            <Button type="button" size="sm">
                              View Report Card
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {data.publications.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Published Ward Result Ledger ({data.publications.length})</CardTitle>
                <CardDescription>All released terminal results across your authorized wards</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ward</TableHead>
                      <TableHead>Session / Term</TableHead>
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
                        <TableCell className="font-medium text-[#0F172A]">
                          {pub.first_name} {pub.last_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {pub.session_name} · {pub.term_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {pub.class_name}
                          {pub.arm_name ? ` (${pub.arm_name})` : ''}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-[#1E3A8A]">
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
                            Open Sheet
                          </Link>
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
