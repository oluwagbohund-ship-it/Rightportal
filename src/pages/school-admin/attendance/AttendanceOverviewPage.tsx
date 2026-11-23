import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function AttendanceOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const loadData = () => {
    setLoading(true);
    apiRequest<any>('/api/school/attendance/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load attendance overview.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const classBreakdown = data?.classBreakdown ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance & QR Register"
        description="Tenant-wide daily attendance monitoring, Digital ID QR scanning, and class roll call registers."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/students/id-cards">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Student Digital ID Cards
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/attendance/register">
              <Button type="button" size="sm" className="whitespace-nowrap shrink-0">
                Scan QR &amp; Mark Register
              </Button>
            </Link>
          </div>
        }
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Loading attendance metrics...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Marked Today</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  {data?.todaySummary?.totalMarked ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                Out of {data?.totalActiveStudents ?? 0} active students
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Attendance Rate</CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-600 tabular-nums">
                  {data?.todaySummary?.attendanceRatePercent ?? 0}%
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                {data?.todaySummary?.present ?? 0} present · {data?.todaySummary?.late ?? 0} late
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending Corrections</CardDescription>
                <CardTitle className="text-3xl font-bold text-amber-600 tabular-nums">
                  {data?.pendingCorrections ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Requiring administrative review</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active QR Sessions</CardDescription>
                <CardTitle className="text-3xl font-bold text-blue-600 tabular-nums">
                  {data?.activeQrSessions ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Live check-in tokens open</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Class Attendance Breakdown</CardTitle>
              <CardDescription>Today’s attendance metrics across active school classes.</CardDescription>
            </CardHeader>
            <CardContent>
              {classBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No active classes configured yet. Create classes to view daily attendance metrics.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class Name</TableHead>
                      <TableHead>Total Students</TableHead>
                      <TableHead>Present</TableHead>
                      <TableHead>Late</TableHead>
                      <TableHead>Absent</TableHead>
                      <TableHead>Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classBreakdown.map((cls: any) => (
                      <TableRow key={cls.class_id}>
                        <TableCell className="font-medium text-slate-900">{cls.class_name}</TableCell>
                        <TableCell className="tabular-nums">{cls.total_students}</TableCell>
                        <TableCell className="tabular-nums text-emerald-600">{cls.present}</TableCell>
                        <TableCell className="tabular-nums text-amber-600">{cls.late}</TableCell>
                        <TableCell className="tabular-nums text-rose-600">{cls.absent}</TableCell>
                        <TableCell className="tabular-nums font-semibold">{cls.attendanceRatePercent}%</TableCell>
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

