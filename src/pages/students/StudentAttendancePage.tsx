import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';

export function StudentAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const loadAttendance = () => {
    setLoading(true);
    apiRequest<any>('/api/school/student/attendance')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load attendance records.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  const handleScanQr = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanError(null);
    setScanSuccess(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/school/attendance/qr/scan', {
        method: 'POST',
        body: { token: tokenInput.trim() },
      });
      setScanSuccess(res.message);
      setTokenInput('');
      loadAttendance();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to check in with QR code.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance & QR Check-In"
        description="View your attendance history, punctuality rates, and present your Digital ID card or session QR token for roll call."
        actions={
          <Link to="/dashboard/student/id-card">
            <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
              Open My Digital ID Card
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Live QR Attendance Check-In</CardTitle>
          <CardDescription>Enter or scan the QR check-in token provided by your instructor for today's class.</CardDescription>
        </CardHeader>
        <CardContent>
          {scanError ? <Alert variant="error" className="mb-4">{scanError}</Alert> : null}
          {scanSuccess ? <Alert variant="success" className="mb-4">{scanSuccess}</Alert> : null}
          <form onSubmit={handleScanQr} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Paste QR Session Token..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <Button type="submit">Submit Check-In</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-slate-500">Loading attendance data...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Marked Sessions</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  {data?.stats?.totalMarked ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Present Count</CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-600 tabular-nums">
                  {data?.stats?.present ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Late Arrivals</CardDescription>
                <CardTitle className="text-3xl font-bold text-amber-600 tabular-nums">
                  {data?.stats?.late ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Attendance Rate</CardDescription>
                <CardTitle className="text-3xl font-bold text-blue-600 tabular-nums">
                  {data?.stats?.attendanceRatePercent ?? 0}%
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Attendance History Log</CardTitle>
              <CardDescription>Chronological record of your attendance statuses.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.records?.length === 0 ? (
                <p className="text-sm text-slate-500">No attendance records found yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.records?.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">{r.attendance_date}</TableCell>
                        <TableCell className="text-xs">{r.session_label ?? 'Daily Roll'}</TableCell>
                        <TableCell className="text-xs">{r.class_name}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize ${
                              r.status === 'present'
                                ? 'bg-emerald-50 text-emerald-700'
                                : r.status === 'late'
                                  ? 'bg-amber-50 text-amber-700'
                                  : r.status === 'absent'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono uppercase text-slate-500">{r.source}</TableCell>
                        <TableCell className="text-xs text-slate-600">{r.remarks || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
