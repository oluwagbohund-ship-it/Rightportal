export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceStatsSummary {
  totalMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendedCount: number;
  attendanceRatePercent: number;
}

export function computeAttendanceStats(statuses: AttendanceStatus[]): AttendanceStatsSummary {
  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;

  for (const s of statuses) {
    if (s === 'present') present++;
    else if (s === 'absent') absent++;
    else if (s === 'late') late++;
    else if (s === 'excused') excused++;
  }

  const totalMarked = statuses.length;
  // Present + Late count as attended sessions; excused sessions are non-penalizing if present+late+excused?
  // Standard educational metric: present + late out of totalMarked (excused still tracked separately).
  const attendedCount = present + late;
  const attendanceRatePercent =
    totalMarked > 0 ? Math.round((attendedCount / totalMarked) * 10000) / 100 : 0;

  return {
    totalMarked,
    present,
    absent,
    late,
    excused,
    attendedCount,
    attendanceRatePercent,
  };
}

export function isQrSessionValid(params: {
  status: string;
  expiresAtIso: string;
  nowMs?: number;
}): { valid: boolean; reason?: string } {
  if (params.status !== 'active') {
    return { valid: false, reason: 'This QR attendance session has already been closed or expired.' };
  }
  const expiresMs = Date.parse(params.expiresAtIso);
  const nowMs = params.nowMs ?? Date.now();
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    return { valid: false, reason: 'This QR attendance code has expired. Request a new session from your teacher or admin.' };
  }
  return { valid: true };
}

export function canTeacherEditAttendanceWindow(params: {
  createdAtIso: string;
  allowHours: number;
  nowMs?: number;
}): { allowed: boolean; hoursElapsed: number } {
  const normalized = params.createdAtIso.includes('T')
    ? params.createdAtIso
    : `${params.createdAtIso.replace(' ', 'T')}Z`;
  const createdMs = Date.parse(normalized);
  const nowMs = params.nowMs ?? Date.now();
  if (!Number.isFinite(createdMs)) {
    return { allowed: false, hoursElapsed: Number.POSITIVE_INFINITY };
  }
  const hoursElapsed = Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60));
  return {
    allowed: hoursElapsed <= params.allowHours,
    hoursElapsed: Math.round(hoursElapsed * 100) / 100,
  };
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Mitigate CSV formula injection in spreadsheet tools
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}
