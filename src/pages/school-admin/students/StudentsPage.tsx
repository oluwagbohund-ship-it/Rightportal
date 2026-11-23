import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Plus } from 'lucide-react';
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
import type { PaginationMeta, SchoolClassRecord, StudentRecord } from '../../../types/app.ts';

export function StudentsPage() {
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [admissionYears, setAdmissionYears] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [classIdFilter, setClassIdFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [statusTarget, setStatusTarget] = useState<{
    student: StudentRecord;
    nextStatus: 'active' | 'suspended' | 'graduated' | 'withdrawn';
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) qs.set('search', search.trim());
      if (classIdFilter !== 'all') qs.set('classId', classIdFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (yearFilter !== 'all') qs.set('admissionYear', yearFilter);

      const res = await apiRequest<{
        students: StudentRecord[];
        pagination: PaginationMeta;
        admissionYears: string[];
      }>(`/api/school/students?${qs.toString()}`);

      setStudents(res.students ?? []);
      setPagination(res.pagination);
      setAdmissionYears(res.admissionYears ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load students directory.');
    } finally {
      setLoading(false);
    }
  }, [page, search, classIdFilter, statusFilter, yearFilter]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes')
      .then((res) => setClasses(res.classes ?? []))
      .catch(() => {});
  }, []);

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setUpdatingStatus(true);
    try {
      await apiRequest(`/api/school/students/${statusTarget.student.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusTarget.nextStatus }),
      });
      showToast({
        variant: 'success',
        title: 'Student status updated',
        description: `${statusTarget.student.first_name} ${statusTarget.student.last_name} is now ${statusTarget.nextStatus}.`,
      });
      setStatusTarget(null);
      await loadStudents();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Status update failed',
        description: err instanceof Error ? err.message : 'Unable to update student status.',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const dotColor = (status: string) => {
    if (status === 'active') return 'bg-emerald-600';
    if (status === 'graduated') return 'bg-[#2563EB]';
    if (status === 'suspended') return 'bg-amber-600';
    return 'bg-red-600';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students Directory"
        description="Search enrolled students, filter by class, admission year, or enrollment status, and access profiles, documents, and promotions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/students/id-cards">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Digital ID Cards
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/promotions">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Promotions &amp; Transfers
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/students/register">
              <Button type="button" size="sm" className="whitespace-nowrap shrink-0">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Register Student</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Enrolled Students ({pagination.total})</CardTitle>
              <CardDescription>Multi-criteria student search and tenant-isolated directory</CardDescription>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              aria-label="Search students"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, admission no., email..."
            />
            <Select
              aria-label="Filter by class"
              value={classIdFilter}
              onChange={(e) => {
                setClassIdFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="graduated">Graduated</option>
              <option value="withdrawn">Withdrawn</option>
            </Select>
            <Select
              aria-label="Filter by admission year"
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Admission Years</option>
              {admissionYears.map((y) => (
                <option key={y} value={y}>
                  Admitted {y}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading students directory...</p>
          ) : students.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No matching students found</p>
              <p className="mt-1 text-xs text-slate-500">
                Register a student directly or convert an approved admission application.
              </p>
              <Link to="/dashboard/school-admin/students/register" className="mt-4 inline-block">
                <Button type="button" size="sm">
                  Register First Student
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Class / Arm</TableHead>
                    <TableHead>Guardians</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((st) => (
                    <TableRow key={st.id}>
                      <TableCell className="font-mono text-xs">{st.admission_number}</TableCell>
                      <TableCell>
                        <Link
                          to={`/dashboard/school-admin/students/${st.id}`}
                          className="font-semibold text-[#1E3A8A] hover:underline"
                        >
                          {st.first_name} {st.middle_name ? `${st.middle_name} ` : ''}
                          {st.last_name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {st.gender} · Admitted {st.admission_date}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {st.class_name
                          ? `${st.class_name}${st.arm_name ? ` (${st.arm_name})` : ''}`
                          : 'Unassigned'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-700">
                        {st.guardians_count ?? 0} linked
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-slate-700">
                          <span className={`h-1.5 w-1.5 rounded-full ${dotColor(st.status)}`} />
                          {st.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          <Link to={`/dashboard/school-admin/students/${st.id}`}>
                            <Button type="button" size="sm" variant="outline">
                              Profile
                            </Button>
                          </Link>
                          <Link to={`/dashboard/school-admin/students/${st.id}/edit`}>
                            <Button type="button" size="sm" variant="outline">
                              Edit
                            </Button>
                          </Link>
                          <Link to={`/dashboard/school-admin/students/${st.id}/promotions`}>
                            <Button type="button" size="sm" variant="outline">
                              Promote
                            </Button>
                          </Link>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setStatusTarget({
                                student: st,
                                nextStatus: st.status === 'active' ? 'suspended' : 'active',
                              })
                            }
                            className={st.status === 'active' ? 'text-red-600 hover:bg-red-50' : ''}
                          >
                            {st.status === 'active' ? 'Suspend' : 'Activate'}
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
            ? `Suspend ${statusTarget.student.first_name} ${statusTarget.student.last_name}`
            : `Activate ${statusTarget?.student.first_name ?? ''} ${statusTarget?.student.last_name ?? ''}`
        }
        description={
          statusTarget?.nextStatus === 'suspended'
            ? 'Suspending revokes any linked Student Portal login sessions while preserving historical academic records.'
            : 'Activating restores enrollment and student portal sign-in eligibility.'
        }
        confirmLabel={statusTarget?.nextStatus === 'suspended' ? 'Suspend Student' : 'Activate Student'}
        destructive={statusTarget?.nextStatus === 'suspended'}
        busy={updatingStatus}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  );
}
