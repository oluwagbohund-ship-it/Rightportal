import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function AttendanceRegisterPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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

  const loadRegister = () => {
    if (!selectedClassId) return;
    setLoading(true);
    apiRequest<{ students: any[] }>(`/api/school/attendance/register?classId=${selectedClassId}&date=${date}`)
      .then((res) => setStudents(res.students ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load register.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRegister();
  }, [selectedClassId, date]);

  const handleStatusChange = (studentId: string, status: string) => {
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, currentStatus: status } : s)));
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    try {
      await apiRequest('/api/school/attendance/register', {
        method: 'POST',
        body: {
          classId: selectedClassId,
          attendanceDate: date,
          records: students.map((s) => ({ studentId: s.id, status: s.currentStatus ?? 'present', remarks: s.remarks ?? '' })),
        },
      });
      setSuccess('Attendance register saved successfully.');
      loadRegister();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save attendance register.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Attendance Register"
        description="Mark daily attendance, absences, and late arrivals for students in each class."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Register Filters</CardTitle>
          <CardDescription>Select class and date to take or update attendance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Attendance Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>
          <Button type="button" onClick={loadRegister}>
            Load Register
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Student Attendance Roster</CardTitle>
            <CardDescription>Mark status for each student on {date}.</CardDescription>
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={students.length === 0}>
            Save Register
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
                  <TableHead>Admission No</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((stu) => {
                  const status = stu.currentStatus ?? stu.status ?? 'present';
                  return (
                    <TableRow key={stu.id}>
                      <TableCell className="font-mono text-xs">{stu.admission_number}</TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {stu.first_name} {stu.last_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {(['present', 'absent', 'late', 'excused'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(stu.id, st)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
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
                        <input
                          type="text"
                          placeholder="Optional remark..."
                          value={stu.remarks ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStudents((prev) =>
                              prev.map((s) => (s.id === stu.id ? { ...s, remarks: val } : s)),
                            );
                          }}
                          className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-900"
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
