import React, { useCallback, useEffect, useState } from 'react';
import { IdCard, RefreshCw, ShieldOff, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { DigitalStudentIdCard } from '../../../components/students/DigitalStudentIdCard.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  SchoolClassRecord,
  StudentDigitalIdCardRecord,
  StudentIdCardDirectoryItem,
} from '../../../types/app.ts';

export function StudentIdCardsPage() {
  const { showToast } = useToast();

  const [students, setStudents] = useState<StudentIdCardDirectoryItem[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [summary, setSummary] = useState({ totalActive: 0, issuedActive: 0, pendingIssue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [actionStudentId, setActionStudentId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<StudentDigitalIdCardRecord | null>(null);
  const [cardModalLoading, setCardModalLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<StudentIdCardDirectoryItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (classFilter !== 'all') qs.set('classId', classFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const res = await apiRequest<{
        students: StudentIdCardDirectoryItem[];
        summary: { totalActive: number; issuedActive: number; pendingIssue: number };
      }>(`/api/school/id-cards${qs.toString() ? `?${qs.toString()}` : ''}`);

      setStudents(res.students ?? []);
      setSummary(res.summary ?? { totalActive: 0, issuedActive: 0, pendingIssue: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Digital ID cards directory.');
    } finally {
      setLoading(false);
    }
  }, [search, classFilter, statusFilter]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes')
      .then((res) => setClasses(res.classes ?? []))
      .catch(() => {});
  }, []);

  const handleBulkIssue = async () => {
    setBulkIssuing(true);
    try {
      const res = await apiRequest<{ issuedCount: number }>('/api/school/id-cards/bulk-issue', {
        method: 'POST',
        body: {
          ...(classFilter !== 'all' ? { classId: classFilter } : {}),
        },
      });
      showToast({
        variant: 'success',
        title: 'Digital ID cards issued',
        description:
          res.issuedCount > 0
            ? `Issued ${res.issuedCount} new student QR ID card(s).`
            : 'All active students in this filter already have an active Digital ID card.',
      });
      await loadDirectory();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Bulk issue failed',
        description: err instanceof Error ? err.message : 'Unable to issue missing ID cards.',
      });
    } finally {
      setBulkIssuing(false);
    }
  };

  const handleIssueOrRotateCard = async (studentId: string, openModal = true) => {
    setActionStudentId(studentId);
    try {
      const res = await apiRequest<{ card: StudentDigitalIdCardRecord }>(
        `/api/school/students/${studentId}/id-card`,
        {
          method: 'POST',
          body: {},
        },
      );
      showToast({
        variant: 'success',
        title: 'Digital ID card ready',
        description: `Card ${res.card.card_number} issued with a unique QR login & attendance code.`,
      });
      if (openModal) {
        setSelectedCard(res.card);
      }
      await loadDirectory();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Issuance failed',
        description: err instanceof Error ? err.message : 'Unable to issue Digital ID card.',
      });
    } finally {
      setActionStudentId(null);
    }
  };

  const handleViewCard = async (studentId: string) => {
    setCardModalLoading(true);
    try {
      const res = await apiRequest<{ card: StudentDigitalIdCardRecord | null }>(
        `/api/school/students/${studentId}/id-card`,
      );
      if (res.card) {
        setSelectedCard(res.card);
      } else {
        await handleIssueOrRotateCard(studentId, true);
      }
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Unable to load card',
        description: err instanceof Error ? err.message : 'Failed to retrieve Digital ID card.',
      });
    } finally {
      setCardModalLoading(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget?.card_id) return;
    setRevoking(true);
    try {
      await apiRequest(`/api/school/id-cards/${revokeTarget.card_id}/revoke`, {
        method: 'PATCH',
        body: { reason: 'Revoked by School Administration' },
      });
      showToast({
        variant: 'success',
        title: 'Digital ID card revoked',
        description: `Card ${revokeTarget.card_number ?? ''} can no longer be used for login or attendance.`,
      });
      if (selectedCard?.id === revokeTarget.card_id) {
        setSelectedCard(null);
      }
      setRevokeTarget(null);
      await loadDirectory();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Revoke failed',
        description: err instanceof Error ? err.message : 'Unable to revoke ID card.',
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Digital ID Cards"
        description="Issue, inspect, print, rotate, and revoke cryptographic QR Digital ID cards for student portal sign-in and attendance scanning."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/attendance/register">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Open QR Attendance Scanner
              </Button>
            </Link>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleBulkIssue()}
              disabled={bulkIssuing}
              className="whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{bulkIssuing ? 'Issuing Missing Cards...' : 'Issue Missing Cards'}</span>
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Enrolled Students</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {summary.totalActive}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active QR ID Cards</CardDescription>
            <CardTitle className="text-3xl font-bold text-emerald-700 tabular-nums">
              {summary.issuedActive}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting Issuance</CardDescription>
            <CardTitle className="text-3xl font-bold text-[#1E3A8A] tabular-nums">
              {summary.pendingIssue}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Digital ID Card Directory ({students.length})</CardTitle>
            <CardDescription>
              Filter students by class or card status and preview or print individual QR credentials.
            </CardDescription>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Search students or card number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, admission no., card no..."
            />
            <Select
              aria-label="Filter by class"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by card status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Card States</option>
              <option value="active">Active Card</option>
              <option value="missing">Not Issued</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading Student Digital ID directory...</p>
          ) : students.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <IdCard className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">
                No students matched your Digital ID filter
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Register students or adjust the class and status filters above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class / Arm</TableHead>
                  <TableHead>Card Number</TableHead>
                  <TableHead>Card Status</TableHead>
                  <TableHead>Last QR Scan</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((st) => {
                  const isBusy = actionStudentId === st.student_id;
                  const statusLabel =
                    st.card_status === 'active'
                      ? 'Active'
                      : st.card_status === 'revoked'
                        ? 'Revoked'
                        : st.card_status === 'expired'
                          ? 'Expired'
                          : 'Not Issued';
                  const statusBadge =
                    st.card_status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : st.card_status === 'revoked'
                        ? 'bg-rose-50 text-rose-700'
                        : st.card_status === 'expired'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600';

                  return (
                    <TableRow key={st.student_id}>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {st.admission_number}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/dashboard/school-admin/students/${st.student_id}`}
                          className="font-semibold text-[#1E3A8A] hover:underline"
                        >
                          {st.first_name} {st.last_name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {st.user_id ? 'Portal login enabled' : 'Attendance QR only'}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {st.class_name
                          ? `${st.class_name}${st.arm_name ? ` (${st.arm_name})` : ''}`
                          : 'Unassigned'}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-slate-700">
                        {st.card_number ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${statusBadge}`}
                        >
                          {statusLabel}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 tabular-nums">
                        {st.last_used_attendance_at
                          ? `Att: ${st.last_used_attendance_at.slice(0, 10)}`
                          : st.last_used_login_at
                            ? `Login: ${st.last_used_login_at.slice(0, 10)}`
                            : 'Unused'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          {st.card_id && st.card_status === 'active' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={cardModalLoading}
                                onClick={() => void handleViewCard(st.student_id)}
                                className="whitespace-nowrap shrink-0"
                              >
                                View / Print
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void handleIssueOrRotateCard(st.student_id, true)}
                                className="whitespace-nowrap shrink-0"
                              >
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Rotate QR</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setRevokeTarget(st)}
                                className="text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
                              >
                                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Revoke</span>
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => void handleIssueOrRotateCard(st.student_id, true)}
                              className="whitespace-nowrap shrink-0"
                            >
                              {isBusy ? 'Issuing...' : 'Issue QR Card'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedCard ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Student Digital ID Card Preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="no-print flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">
                  Digital Student ID Card
                </h2>
                <p className="text-xs text-slate-500">
                  Print, download QR PNG, or copy token for student portal login &amp; attendance.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Close Digital ID Card Preview"
                onClick={() => setSelectedCard(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Close</span>
              </Button>
            </div>

            <DigitalStudentIdCard card={selectedCard} showActions />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={`Revoke ID Card ${revokeTarget?.card_number ?? ''}`}
        description={`Revoking ${revokeTarget?.first_name ?? ''} ${revokeTarget?.last_name ?? ''}'s Digital ID card immediately blocks QR portal login and QR attendance check-in until a replacement card is issued.`}
        confirmLabel="Revoke Card"
        destructive
        busy={revoking}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => void confirmRevoke()}
      />
    </div>
  );
}
