import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AdmissionApplicationRecord, PaginationMeta } from '../../../types/app.ts';

export function AdmissionApplicationsPage() {
  const [applications, setApplications] = useState<AdmissionApplicationRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const res = await apiRequest<{
        applications: AdmissionApplicationRecord[];
        pagination: PaginationMeta;
      }>(`/api/school/admissions?${qs.toString()}`);

      setApplications(res.applications ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load applications queue.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const dotColor = (status: string) => {
    if (status === 'approved') return 'bg-emerald-600';
    if (status === 'converted') return 'bg-[#2563EB]';
    if (status === 'rejected') return 'bg-red-600';
    return 'bg-amber-500';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admission Applications Queue"
        description="Filter prospective student applications by workflow status, inspect documents, approve or request follow-up, and convert into active students."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/admissions">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Admissions Overview</span>
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

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Applications ({pagination.total})</CardTitle>
            <CardDescription>Search by applicant name, guardian name, or reference code</CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Search applications"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search reference or name..."
              className="w-56"
            />
            <Select
              aria-label="Filter by admission status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-48"
            >
              <option value="all">All Statuses</option>
              <option value="pending_review">Pending Review</option>
              <option value="more_info_requested">More Info Requested</option>
              <option value="approved">Approved (Ready to Convert)</option>
              <option value="converted">Converted to Student</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading applications queue...</p>
          ) : applications.length === 0 ? (
            <p className="text-sm text-slate-500">No applications match the selected filter.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Target Class</TableHead>
                    <TableHead>Guardian</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-mono text-xs">{app.application_reference}</TableCell>
                      <TableCell>
                        <Link
                          to={`/dashboard/school-admin/admissions/${app.id}`}
                          className="font-semibold text-[#1E3A8A] hover:underline"
                        >
                          {app.applicant_first_name} {app.applicant_last_name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {app.gender} · DOB {app.date_of_birth}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {app.desired_class_name ?? '—'}
                        {app.desired_arm_name ? ` (${app.desired_arm_name})` : ''}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {app.guardian_name}
                        <p className="text-slate-500">{app.guardian_phone}</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {app.documents_count ?? 0}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-slate-700">
                          <span className={`h-1.5 w-1.5 rounded-full ${dotColor(app.status)}`} />
                          {app.status.replaceAll('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/dashboard/school-admin/admissions/${app.id}`}>
                          <Button type="button" size="sm" variant="outline">
                            {app.status === 'approved' ? 'Convert / Details' : 'Inspect'}
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                <span className="tabular-nums">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
