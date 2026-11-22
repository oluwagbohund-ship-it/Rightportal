export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface TimetablePeriodSpec {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface ExistingTimetableSlot {
  id: string;
  timetableId: string;
  classId: string;
  className?: string;
  armId: string | null;
  dayOfWeek: DayOfWeek;
  periodId: string;
  teacherId: string | null;
  roomId: string | null;
}

export interface CandidateTimetableSlot {
  timetableId: string;
  classId: string;
  armId: string | null;
  dayOfWeek: DayOfWeek;
  periodId: string;
  teacherId: string | null;
  roomId: string | null;
}

export interface TimetableConflict {
  type: 'break_period_conflict' | 'class_conflict' | 'teacher_conflict' | 'room_conflict';
  message: string;
  conflictingSlotId?: string;
}

export function timeStringToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

export function timeIntervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const s1 = timeStringToMinutes(aStart);
  const e1 = timeStringToMinutes(aEnd);
  const s2 = timeStringToMinutes(bStart);
  const e2 = timeStringToMinutes(bEnd);
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return false;
  return s1 < e2 && s2 < e1;
}

export function detectTimetableSlotConflicts(params: {
  candidate: CandidateTimetableSlot;
  existingSlots: ExistingTimetableSlot[];
  periods: TimetablePeriodSpec[];
  ignoreSlotId?: string;
}): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const periodMap = new Map(params.periods.map((p) => [p.id, p]));
  const targetPeriod = periodMap.get(params.candidate.periodId);

  if (!targetPeriod) {
    conflicts.push({
      type: 'break_period_conflict',
      message: 'Selected timetable period does not exist.',
    });
    return conflicts;
  }

  if (targetPeriod.isBreak) {
    conflicts.push({
      type: 'break_period_conflict',
      message: `Period "${targetPeriod.label}" is configured as a break period and cannot host a teaching subject.`,
    });
  }

  for (const existing of params.existingSlots) {
    if (params.ignoreSlotId && existing.id === params.ignoreSlotId) continue;
    if (existing.dayOfWeek !== params.candidate.dayOfWeek) continue;

    const existingPeriod = periodMap.get(existing.periodId);
    const sameOrOverlappingPeriod =
      existing.periodId === params.candidate.periodId ||
      (existingPeriod
        ? timeIntervalsOverlap(
            targetPeriod.startTime,
            targetPeriod.endTime,
            existingPeriod.startTime,
            existingPeriod.endTime,
          )
        : false);

    if (!sameOrOverlappingPeriod) continue;

    if (
      existing.timetableId === params.candidate.timetableId ||
      (existing.classId === params.candidate.classId &&
        (existing.armId ?? null) === (params.candidate.armId ?? null))
    ) {
      conflicts.push({
        type: 'class_conflict',
        message: `Class already has a scheduled subject on ${params.candidate.dayOfWeek} during ${targetPeriod.label} (${targetPeriod.startTime}–${targetPeriod.endTime}).`,
        conflictingSlotId: existing.id,
      });
    }

    if (params.candidate.teacherId && existing.teacherId === params.candidate.teacherId) {
      conflicts.push({
        type: 'teacher_conflict',
        message: `Assigned teacher is already booked on ${params.candidate.dayOfWeek} (${targetPeriod.startTime}–${targetPeriod.endTime}) for ${existing.className || 'another class'}.`,
        conflictingSlotId: existing.id,
      });
    }

    if (params.candidate.roomId && existing.roomId === params.candidate.roomId) {
      conflicts.push({
        type: 'room_conflict',
        message: `Selected room is already occupied on ${params.candidate.dayOfWeek} (${targetPeriod.startTime}–${targetPeriod.endTime}) by ${existing.className || 'another class'}.`,
        conflictingSlotId: existing.id,
      });
    }
  }

  return conflicts;
}
