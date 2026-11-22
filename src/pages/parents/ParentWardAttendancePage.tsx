import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';

export function ParentWardAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/parent/attendance')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load ward attendance.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ward Attendance Monitoring"
        description="Monitor daily attendance and punctuality records for all linked wards."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading ward attendance...</p>
      ) : data?.wards?.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">No linked wards found for your account.</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {data?.wards?.map((item: any) => (
            <Card key={item.ward.id}>
              <CardHeader>
                <CardTitle>
                  {item.ward.first_name} {item.ward.last_name} ({item.ward.admission_number})
                </CardTitle>
                <CardDescription>
                  Class: {item.ward.class_name ?? 'Unassigned'} · Attendance Rate: {item.stats.attendanceRatePercent}%
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500">Total Marked</p>
                    <p className="text-xl font-bold tabular-nums">{item.stats.totalMarked}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900">
                    <p className="text-xs text-emerald-700">Present</p>
                    <p className="text-xl font-bold tabular-nums">{item.stats.present}</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900">
                    <p className="text-xs text-amber-700">Late</p>
                    <p className="text-xl font-bold tabular-nums">{item.stats.late}</p>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-rose-900">
                    <p className="text-xs text-rose-700">Absent</p>
                    <p className="text-xl font-bold tabular-nums">{item.stats.absent}</p>
                  </div>
                </div>

                {item.records?.length === 0 ? (
                  <p className="text-sm text-slate-500">No attendance records logged yet for this ward.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.records.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs tabular-nums">{r.attendance_date}</TableCell>
                          <TableCell className="text-xs">{r.session_label ?? 'Daily Roll'}</TableCell>
                          <TableCell>
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize bg-slate-100 text-slate-800">
                              {r.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">{r.remarks || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
