import React, { useCallback, useEffect, useState } from 'react';
import { Plus, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { PaginationMeta, TeacherRecord } from '../../../types/app.ts';

export function TeachersPage() {
  const { showToast } = useToast();
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
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

  const [statusTarget, setStatusTarget] = useState<{
    teacher: TeacherRecord;
    nextStatus: 'active' | 'suspended';
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const res = await apiRequest<{ teachers: TeacherRecord[]; pagination: PaginationMeta }>(
        `/api/school/teachers?${qs.toString()}`,
      );
      setTeachers(res.teachers ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teachers directory.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setUpdatingStatus(true);
    try {
      await apiRequest(`/api/school/teachers/${statusTarget.teacher.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ employmentStatus: statusTarget.nextStatus }),
      });
      showToast({
        variant: 'success',
        title: 'Teacher status updated',
        description: `${statusTarget.teacher.first_name} ${statusTarget.teacher.last_name} is now ${statusTarget.nextStatus}.`,
      });
      setStatusTarget(null);
      await loadTeachers();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update status.',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const statusTextColor = (status: string) => {
    if (status === 'active') return 'text-emerald-700';
    if (status === 'on_leave') return 'text-amber-700';
    return 'text-red-700';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers & Academic Staff"
        description="Manage teaching staff directories, credentials, employment statuses, and subject or class allocations."
        actions={
          <Link to="/dashboard/school-admin/teachers/register">
            <Button type="button" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Register Teacher</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Faculty Directory ({pagination.total})</CardTitle>
            <CardDescription>Search by name, Staff ID, email, or subject specialization</CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Search teachers"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, Staff ID, email..."
              className="w-60"
            />
            <Select
              aria-label="Filter by employment status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-40"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading teachers directory...</p>
          ) : teachers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <UserCheck className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No teachers found</p>
              <p className="mt-1 text-xs text-slate-500">
                Register teachers to assign them to classes, arms, and subjects.
              </p>
              <Link to="/dashboard/school-admin/teachers/register" className="mt-4 inline-block">
                <Button type="button" size="sm">
                  Register First Teacher
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ID</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Classes / Subjects</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.staff_id_number}</TableCell>
                      <TableCell>
                        <Link
                          to={`/dashboard/school-admin/teachers/${t.id}`}
                          className="font-semibold text-[#1E3A8A] hover:underline"
                        >
                          {t.first_name} {t.middle_name ? `${t.middle_name} ` : ''}
                          {t.last_name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {t.email} · {t.phone}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {t.specialization || t.qualifications || 'General Faculty'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 tabular-nums">
                        {t.active_classes_count ?? 0} classes · {t.active_subjects_count ?? 0} subjects
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold capitalize ${statusTextColor(t.employment_status)}`}>
                          {t.employment_status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <Link to={`/dashboard/school-admin/teachers/${t.id}`}>
                            <Button type="button" size="sm" variant="outline">
                              Profile
                            </Button>
                          </Link>
                          <Link to={`/dashboard/school-admin/teachers/${t.id}/edit`}>
                            <Button type="button" size="sm" variant="outline">
                              Edit
                            </Button>
                          </Link>
                          <Link to={`/dashboard/school-admin/teachers/${t.id}/documents`}>
                            <Button type="button" size="sm" variant="outline">
                              Docs
                            </Button>
                          </Link>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setStatusTarget({
                                teacher: t,
                                nextStatus: t.employment_status === 'active' ? 'suspended' : 'active',
                              })
                            }
                            className={
                              t.employment_status === 'active' ? 'text-red-600 hover:bg-red-50' : ''
                            }
                          >
                            {t.employment_status === 'active' ? 'Suspend' : 'Activate'}
                          </Button>
                        </div>
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

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.nextStatus === 'suspended'
            ? `Suspend ${statusTarget.teacher.first_name} ${statusTarget.teacher.last_name}`
            : `Reactivate ${statusTarget?.teacher.first_name ?? ''} ${statusTarget?.teacher.last_name ?? ''}`
        }
        description={
          statusTarget?.nextStatus === 'suspended'
            ? 'Suspending this teacher immediately revokes active portal login sessions and blocks class access.'
            : 'Reactivating restores active teaching status and portal access.'
        }
        confirmLabel={statusTarget?.nextStatus === 'suspended' ? 'Suspend Teacher' : 'Activate Teacher'}
        destructive={statusTarget?.nextStatus === 'suspended'}
        busy={updatingStatus}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  );
}
