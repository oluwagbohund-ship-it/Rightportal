import React, { useEffect, useState } from 'react';
import { ArrowRight, ClipboardCheck, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AdmissionApplicationRecord } from '../../../types/app.ts';

interface AdmissionSummary {
  total: number;
  pending_review: number;
  more_info_requested: number;
  approved: number;
  rejected: number;
  converted: number;
}

export function AdmissionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdmissionSummary>({
    total: 0,
    pending_review: 0,
    more_info_requested: 0,
    approved: 0,
    rejected: 0,
    converted: 0,
  });
  const [applications, setApplications] = useState<AdmissionApplicationRecord[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{
      summary: AdmissionSummary;
      applications: AdmissionApplicationRecord[];
    }>('/api/school/admissions?limit=8')
      .then((res) => {
        if (!active) return;
        setSummary(res.summary);
        setApplications(res.applications ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load admissions pipeline.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cards = [
    { label: 'Total Applications', value: summary.total, note: 'All intake cycles' },
    { label: 'Pending Review', value: summary.pending_review, note: 'Awaiting decision' },
    { label: 'Info Requested', value: summary.more_info_requested, note: 'Follow-up required' },
    { label: 'Approved (Ready)', value: summary.approved, note: 'Ready for explicit conversion' },
    { label: 'Converted Students', value: summary.converted, note: 'Completed enrollment' },
    { label: 'Declined', value: summary.rejected, note: 'Archived rejections' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admissions & Intake Overview"
        description="Track prospective applications from initial review and verification through explicit conversion into enrolled students."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/admissions/applications">
              <Button type="button" size="sm" variant="outline">
                Full Applications Queue
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/admissions/new">
              <Button type="button" size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>New Application</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums text-[#0F172A]">
                {loading ? '—' : item.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-500">{item.note}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription>
              Review applications carefully. Approving does not auto-enroll until conversion is completed.
            </CardDescription>
          </div>
          <Link
            to="/dashboard/school-admin/admissions/applications"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap"
          >
            <span>Open Queue</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading applications...</p>
          ) : applications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No admission applications yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create a new application to start your review and onboarding pipeline.
              </p>
              <Link to="/dashboard/school-admin/admissions/new" className="mt-4 inline-block">
                <Button type="button" size="sm">
                  Create Application
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Desired Class</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-mono text-xs">{app.application_reference}</TableCell>
                    <TableCell className="font-semibold">
                      <Link
                        to={`/dashboard/school-admin/admissions/${app.id}`}
                        className="text-[#1E3A8A] hover:underline"
                      >
                        {app.applicant_first_name} {app.applicant_last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {app.desired_class_name ?? '—'}
                      {app.desired_arm_name ? ` (${app.desired_arm_name})` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {app.guardian_name} ({app.guardian_phone})
                    </TableCell>
                    <TableCell className="text-xs font-medium capitalize text-slate-700">
                      {app.status.replaceAll('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/dashboard/school-admin/admissions/${app.id}`}>
                        <Button type="button" size="sm" variant="outline">
                          Review
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
    </div>
  );
}
