import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function TimetableOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/timetable/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load timetable overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable & Room Scheduler"
        description="Class and teacher schedules with automated slot conflict detection (room clashes, teacher double-booking, and period overlaps)."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading timetable summary...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Timetables</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  {data?.stats?.timetablesCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Class schedules created</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Rooms & Labs</CardDescription>
                <CardTitle className="text-3xl font-bold text-blue-600 tabular-nums">
                  {data?.stats?.roomsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Configured instructional venues</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Daily Periods</CardDescription>
                <CardTitle className="text-3xl font-bold text-indigo-600 tabular-nums">
                  {data?.stats?.periodsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Bell schedule intervals</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Conflict Prevention</CardDescription>
                <CardTitle className="text-xl font-bold text-emerald-600">Active (409 Guard)</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Double-booking block enforced</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Configured Rooms & Labs</CardTitle>
              <CardDescription>Venues available for timetable slot allocation.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.rooms?.length === 0 ? (
                <p className="text-sm text-slate-500">No rooms configured yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Room Name</TableHead>
                      <TableHead>Building</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.rooms?.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-slate-900">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.building ?? 'Main Campus'}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{r.capacity}</TableCell>
                        <TableCell className="text-xs capitalize">{r.room_type}</TableCell>
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
