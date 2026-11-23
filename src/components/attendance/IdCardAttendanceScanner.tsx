import React, { useState } from 'react';
import { QrCode } from 'lucide-react';
import { QrScannerInput } from '../shared/QrScannerInput.tsx';
import { Alert } from '../ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select } from '../ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { IdCardAttendanceScanResult } from '../../types/app.ts';

interface IdCardAttendanceScannerProps {
  defaultDate?: string;
  defaultSessionLabel?: string;
  classId?: string;
  armId?: string;
  onScanRecorded?: (result: IdCardAttendanceScanResult) => void;
}

export function IdCardAttendanceScanner({
  defaultDate = new Date().toISOString().slice(0, 10),
  defaultSessionLabel = 'Morning Roll Call',
  classId,
  armId,
  onScanRecorded,
}: IdCardAttendanceScannerProps) {
  const [attendanceDate, setAttendanceDate] = useState(defaultDate);
  const [sessionLabel, setSessionLabel] = useState(defaultSessionLabel);
  const [status, setStatus] = useState<'present' | 'late'>('present');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [recentScans, setRecentScans] = useState<IdCardAttendanceScanResult[]>([]);

  const handleScan = async (qrToken: string) => {
    setFeedback(null);
    setSubmitting(true);
    try {
      const result = await apiRequest<IdCardAttendanceScanResult>(
        '/api/school/attendance/id-card-scan',
        {
          method: 'POST',
          body: {
            qrToken,
            attendanceDate,
            sessionLabel: sessionLabel.trim() || 'Morning Roll Call',
            status,
            ...(classId ? { classId } : {}),
            ...(armId ? { armId } : {}),
          },
        },
      );

      setFeedback({
        variant: result.alreadyMarked ? 'info' : 'success',
        message: result.alreadyMarked
          ? `${result.student.fullName} (${result.student.admissionNumber}) is already marked ${result.status} for ${result.sessionLabel} on ${result.attendanceDate}.`
          : `Marked ${result.student.fullName} (${result.student.admissionNumber}) as ${result.status.toUpperCase()} in ${result.student.className}.`,
      });

      setRecentScans((prev) => {
        const filtered = prev.filter(
          (item) =>
            !(
              item.student.id === result.student.id &&
              item.attendanceDate === result.attendanceDate &&
              item.sessionLabel === result.sessionLabel
            ),
        );
        return [result, ...filtered].slice(0, 15);
      });

      onScanRecorded?.(result);
    } catch (err) {
      setFeedback({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Unable to record attendance from Digital ID card.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="no-print">
      <CardHeader>
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-[#1E3A8A]" aria-hidden="true" />
          <CardTitle>Digital ID Card Attendance Scanner</CardTitle>
        </div>
        <CardDescription>
          Scan a student’s Digital ID Card QR code via camera, uploaded QR image, or barcode scanner to mark live attendance automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="id-scan-date">Attendance Date</Label>
            <Input
              id="id-scan-date"
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="id-scan-session">Roll Call Session</Label>
            <Input
              id="id-scan-session"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              placeholder="Morning Roll Call"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="id-scan-status">Mark Status As</Label>
            <Select
              id="id-scan-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'present' | 'late')}
            >
              <option value="present">Present (On Time)</option>
              <option value="late">Late Arrival</option>
            </Select>
          </div>
        </div>

        <QrScannerInput
          onScan={handleScan}
          busy={submitting}
          helperText="Each scan verifies the student's active ID card inside this school and updates the class attendance register immediately."
        />

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#0F172A]">
              Recent Scans This Session ({recentScans.length})
            </h4>
            <span className="text-xs text-slate-500">Live QR check-in feed</span>
          </div>

          {recentScans.length === 0 ? (
            <p className="text-xs text-slate-500">
              No Digital ID cards scanned yet in this session. Verified check-ins will appear here immediately.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Card No.</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentScans.map((scan) => (
                  <TableRow key={`${scan.student.id}-${scan.attendanceDate}-${scan.sessionLabel}`}>
                    <TableCell className="font-medium text-[#0F172A]">
                      {scan.student.fullName}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {scan.student.admissionNumber}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-slate-600">
                      {scan.student.cardNumber}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {scan.student.className}
                      {scan.student.armName ? ` (${scan.student.armName})` : ''}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${
                          scan.status === 'present'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {scan.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {scan.alreadyMarked ? 'Already marked' : 'Recorded via ID QR'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
