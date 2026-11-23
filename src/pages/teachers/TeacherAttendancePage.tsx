import React, { useCallback, useEffect, useState } from 'react';
import { IdCardAttendanceScanner } from '../../components/attendance/IdCardAttendanceScanner.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Select } from '../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';

interface AssignedClassOption {
  class_id: string;
  class_name: string;
}

interface RosterStudent {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  arm_name: string | null;
  attendanceStatus: 'present' | 'absent' | 'late' | 'excused';
  remarks: string;
  source: string | null;
}

export function TeacherAttendancePage() {
  const [classes, setClasses] = useState<AssignedClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionLabel, setSessionLabel] = useState('Morning Roll Call');
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [canEditDirectly, setCanEditDirectly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{
      assignedClasses: Array<{ class_id: string; class_name: string }>;
    }>('/api/school/teacher-workspace')
      .then((res) => {
        const uniqueMap = new Map<string, AssignedClassOption>();
        for (const c of res.assignedClasses ?? []) {
          if (!uniqueMap.has(c.class_id)) {
            uniqueMap.set(c.class_id, { class_id: c.class_id, class_name: c.class_name });
          }
        }
        const list = Array.from(uniqueMap.values());
        setClasses(list);
        if (list[0]) setSelectedClassId(list[0].class_id);
      })
      .catch(() => {});
  }, []);

  const loadRegister = useCallback(async () => {
    if (!selectedClassId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        classId: selectedClassId,
        date: attendanceDate,
        sessionLabel: sessionLabel.trim() || 'Morning Roll Call',
      });
      const res = await apiRequest<{
        canEditDirectly: boolean;
        roster: RosterStudent[];
      }>(`/api/school/attendance/register?${qs.toString()}`);

      setCanEditDirectly(Boolean(res.canEditDirectly));
      setRoster(res.roster ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load classroom attendance register.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, attendanceDate, sessionLabel]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const handleStatusChange = (
    studentId: string,
    nextStatus: 'present' | 'absent' | 'late' | 'excused',
  ) => {
    setRoster((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, attendanceStatus: nextStatus } : s)),
    );
  };

  const handleSave = async () => {
    if (!selectedClassId || roster.length === 0) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await apiRequest('/api/school/attendance/register', {
        method: 'POST',
        body: {
          classId: selectedClassId,
          attendanceDate,
          sessionLabel: sessionLabel.trim() || 'Morning Roll Call',
          entries: roster.map((s) => ({
            studentId: s.id,
            status: s.attendanceStatus,
            remarks: s.remarks ?? '',
          })),
        },
      });
      setSuccess('Class attendance register saved.');
      await loadRegister();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save class attendance register.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classroom Attendance & QR Scanner"
        description="Scan Student Digital ID QR cards to check students in automatically or update your assigned class roll call register."
      />

      <IdCardAttendanceScanner
        defaultDate={attendanceDate}
        defaultSessionLabel={sessionLabel}
        onScanRecorded={() => {
          void loadRegister();
        }}
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Assigned Class Roll Call Register</CardTitle>
              <CardDescription>
                Live roster reflects both Digital ID QR check-ins and manual roll call edits.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={saving || !canEditDirectly || roster.length === 0}
              onClick={() => void handleSave()}
              className="whitespace-nowrap shrink-0"
            >
              {saving ? 'Saving...' : 'Save Class Register'}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="teacher-att-class">Assigned Class</Label>
              <Select
                id="teacher-att-class"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                {classes.length === 0 ? (
                  <option value="">No assigned classes</option>
                ) : (
                  classes.map((c) => (
                    <option key={c.class_id} value={c.class_id}>
                      {c.class_name}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="teacher-att-date">Attendance Date</Label>
              <Input
                id="teacher-att-date"
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="teacher-att-session">Session Label</Label>
              <Input
                id="teacher-att-session"
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
                placeholder="Morning Roll Call"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-slate-500">
              No classes are assigned to your faculty profile yet. Ask School Administration to assign a class to manage roll call.
            </p>
          ) : loading ? (
            <p className="text-sm text-slate-500">Loading class attendance roster...</p>
          ) : roster.length === 0 ? (
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
                {roster.map((stu) => (
                  <TableRow key={stu.id}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {stu.admission_number}
                    </TableCell>
                    <TableCell className="font-medium text-[#0F172A]">
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
                            disabled={!canEditDirectly}
                            onClick={() => handleStatusChange(stu.id, st)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                              stu.attendanceStatus === st
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
                        disabled={!canEditDirectly}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRoster((prev) =>
                            prev.map((s) => (s.id === stu.id ? { ...s, remarks: val } : s)),
                          );
                        }}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
