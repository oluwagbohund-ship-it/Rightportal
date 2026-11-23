import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IdCardAttendanceScanner } from '../../../components/attendance/IdCardAttendanceScanner.tsx';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

interface RegisterStudentRow {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  arm_name: string | null;
  attendanceStatus: 'present' | 'absent' | 'late' | 'excused';
  remarks: string;
  source: string | null;
}

export function AttendanceRegisterPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionLabel, setSessionLabel] = useState('Morning Roll Call');
  const [students, setStudents] = useState<RegisterStudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ classes: any[] }>('/api/school/classes')
      .then((res) => {
        setClasses(res.classes ?? []);
        if (res.classes?.[0]) setSelectedClassId(res.classes[0].id);
      })
      .catch(() => {});
  }, []);

  const loadRegister = useCallback(() => {
    if (!selectedClassId) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      classId: selectedClassId,
      date,
      sessionLabel: sessionLabel.trim() || 'Morning Roll Call',
    });
    apiRequest<{ roster: RegisterStudentRow[] }>(`/api/school/attendance/register?${qs.toString()}`)
      .then((res) => setStudents(res.roster ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load register.'))
      .finally(() => setLoading(false));
  }, [selectedClassId, date, sessionLabel]);

  useEffect(() => {
    loadRegister();
  }, [loadRegister]);

  const handleStatusChange = (
    studentId: string,
    status: 'present' | 'absent' | 'late' | 'excused',
  ) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, attendanceStatus: status } : s)),
    );
  };

  const handleSave = async () => {
    if (!selectedClassId || students.length === 0) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await apiRequest('/api/school/attendance/register', {
        method: 'POST',
        body: {
          classId: selectedClassId,
          attendanceDate: date,
          sessionLabel: sessionLabel.trim() || 'Morning Roll Call',
          entries: students.map((s) => ({
            studentId: s.id,
            status: s.attendanceStatus ?? 'present',
            remarks: s.remarks ?? '',
          })),
        },
      });
      setSuccess('Attendance register saved successfully.');
      loadRegister();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save attendance register.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Attendance Register & QR Scanner"
        description="Scan Student Digital ID QR cards for instant check-in or mark daily roll call per class."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/students/id-cards">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Manage ID Cards
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/attendance">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Attendance Overview
              </Button>
            </Link>
          </div>
        }
      />

      <IdCardAttendanceScanner
        defaultDate={date}
        defaultSessionLabel={sessionLabel}
        onScanRecorded={() => {
          loadRegister();
        }}
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Register Filters</CardTitle>
          <CardDescription>Select class, roll call session, and date to view or edit attendance.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="att-reg-class">Class</Label>
            <Select
              id="att-reg-class"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              {classes.length === 0 ? (
                <option value="">No classes available</option>
              ) : (
                classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.code})
                  </option>
                ))
              )}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="att-reg-date">Attendance Date</Label>
            <Input
              id="att-reg-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="att-reg-session">Roll Call Session</Label>
            <Input
              id="att-reg-session"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              placeholder="Morning Roll Call"
            />
          </div>
          <Button type="button" onClick={loadRegister} className="whitespace-nowrap shrink-0">
            Load Register
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Student Attendance Roster</CardTitle>
            <CardDescription>
              Mark status for each student on {date} ({sessionLabel}).
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || students.length === 0}
            className="whitespace-nowrap shrink-0"
          >
            {saving ? 'Saving...' : 'Save Register'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading roster...</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-slate-500">No active students found in this class.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((stu) => {
                  const status = stu.attendanceStatus ?? 'present';
                  return (
                    <TableRow key={stu.id}>
                      <TableCell className="font-mono text-xs tabular-nums">{stu.admission_number}</TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {stu.first_name} {stu.last_name}
                        {stu.arm_name ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            ({stu.arm_name})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs uppercase text-slate-500">
                        {stu.source ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(['present', 'absent', 'late', 'excused'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(stu.id, st)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                                status === st
                                  ? st === 'present'
                                    ? 'bg-emerald-600 text-white'
                                    : st === 'late'
                                      ? 'bg-amber-600 text-white'
                                      : st === 'absent'
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Remarks for ${stu.first_name} ${stu.last_name}`}
                          placeholder="Optional remark..."
                          value={stu.remarks ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStudents((prev) =>
                              prev.map((s) => (s.id === stu.id ? { ...s, remarks: val } : s)),
                            );
                          }}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

