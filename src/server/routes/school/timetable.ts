import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { buildSimpleTabularPdf } from '../../academics-engine.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { hasPermission } from '../../security.ts';
import {
  detectTimetableSlotConflicts,
  type DayOfWeek,
} from '../../timetable-engine.ts';
import {
  createRoomSchema,
  createTimetablePeriodSchema,
  createTimetableSchema,
  updateTimetableSettingsSchema,
  upsertTimetableSlotSchema,
} from '../../validation-v1.ts';

export const schoolTimetableRouter = Router();

function ensureTimetableDefaults(schoolId: string) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO timetable_settings (school_id) VALUES (?)').run(schoolId);
  const periodCount = (
    db.prepare('SELECT COUNT(*) AS count FROM timetable_periods WHERE school_id = ?').get(schoolId) as { count: number }
  ).count;
  if (periodCount === 0) {
    const insertPeriod = db.prepare(`
      INSERT INTO timetable_periods (id, school_id, label, period_order, start_time, end_time, is_break)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Period 1', 1, '08:00', '08:45', 0);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Period 2', 2, '08:45', '09:30', 0);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Period 3', 3, '09:30', '10:15', 0);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Morning Break', 4, '10:15', '10:45', 1);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Period 4', 5, '10:45', '11:30', 0);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Period 5', 6, '11:30', '12:15', 0);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Lunch Break', 7, '12:15', '13:00', 1);
    insertPeriod.run(`ttp_${crypto.randomUUID()}`, schoolId, 'Period 6', 8, '13:00', '13:45', 0);
  }
  return db.prepare('SELECT * FROM timetable_settings WHERE school_id = ?').get(schoolId) as {
    school_id: string;
    school_days_json: string;
    day_start_time: string;
    day_end_time: string;
    default_period_minutes: number;
  };
}

schoolTimetableRouter.get(
  '/timetable/overview',
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureTimetableDefaults(schoolId);

    const roomsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM school_rooms WHERE school_id = ? AND is_active = 1').get(schoolId) as { c: number }
    ).c;
    const periodsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM timetable_periods WHERE school_id = ?').get(schoolId) as { c: number }
    ).c;
    const timetablesStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft
        FROM timetables WHERE school_id = ?
      `)
      .get(schoolId) as { total: number; published: number | null; draft: number | null };
    const slotsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM timetable_slots WHERE school_id = ?').get(schoolId) as { c: number }
    ).c;

    res.json({
      stats: {
        roomsCount,
        periodsCount,
        totalTimetables: timetablesStats.total ?? 0,
        publishedTimetables: timetablesStats.published ?? 0,
        draftTimetables: timetablesStats.draft ?? 0,
        slotsCount,
      },
      settings: {
        ...settings,
        school_days: JSON.parse(settings.school_days_json),
      },
    });
  },
);

schoolTimetableRouter.get(
  '/timetable/settings',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureTimetableDefaults(schoolId);
    const periods = db
      .prepare('SELECT * FROM timetable_periods WHERE school_id = ? ORDER BY period_order ASC')
      .all(schoolId);
    res.json({
      settings: {
        ...settings,
        school_days: JSON.parse(settings.school_days_json),
      },
      periods,
    });
  },
);

schoolTimetableRouter.put(
  '/timetable/settings',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateTimetableSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid timetable settings.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    db.prepare(`
      INSERT INTO timetable_settings (school_id, school_days_json, day_start_time, day_end_time, default_period_minutes, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(school_id) DO UPDATE SET
        school_days_json = excluded.school_days_json,
        day_start_time = excluded.day_start_time,
        day_end_time = excluded.day_end_time,
        default_period_minutes = excluded.default_period_minutes,
        updated_at = datetime('now')
    `).run(schoolId, JSON.stringify(d.schoolDays), d.dayStartTime, d.dayEndTime, d.defaultPeriodMinutes);

    const updated = db.prepare('SELECT * FROM timetable_settings WHERE school_id = ?').get(schoolId);
    res.json({ settings: updated });
  },
);

schoolTimetableRouter.post(
  '/timetable/periods',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createTimetablePeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid period configuration.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    if (d.endTime <= d.startTime) {
      res.status(400).json({ error: 'Period end time must be after start time.' });
      return;
    }

    const dupOrder = db
      .prepare('SELECT id FROM timetable_periods WHERE school_id = ? AND period_order = ?')
      .get(schoolId, d.periodOrder);
    if (dupOrder) {
      res.status(409).json({ error: `Period order #${d.periodOrder} already exists.` });
      return;
    }

    const id = `ttp_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO timetable_periods (id, school_id, label, period_order, start_time, end_time, is_break)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, schoolId, d.label, d.periodOrder, d.startTime, d.endTime, d.isBreak ? 1 : 0);

    const period = db.prepare('SELECT * FROM timetable_periods WHERE id = ?').get(id);
    res.status(201).json({ period });
  },
);

schoolTimetableRouter.delete(
  '/timetable/periods/:periodId',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const inUse = db
      .prepare('SELECT id FROM timetable_slots WHERE school_id = ? AND period_id = ? LIMIT 1')
      .get(schoolId, req.params.periodId);
    if (inUse) {
      res.status(409).json({ error: 'Cannot delete a period that already has scheduled timetable slots.' });
      return;
    }
    const result = db
      .prepare('DELETE FROM timetable_periods WHERE id = ? AND school_id = ?')
      .run(req.params.periodId, schoolId);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Period not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolTimetableRouter.get(
  '/timetable/rooms',
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const rooms = db
      .prepare('SELECT * FROM school_rooms WHERE school_id = ? ORDER BY name ASC')
      .all(schoolId);
    res.json({ rooms });
  },
);

schoolTimetableRouter.post(
  '/timetable/rooms',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid room payload.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    const dup = db
      .prepare('SELECT id FROM school_rooms WHERE school_id = ? AND (LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?))')
      .get(schoolId, d.code, d.name);
    if (dup) {
      res.status(409).json({ error: 'A room with this name or code already exists in your school.' });
      return;
    }
    const id = `rm_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO school_rooms (id, school_id, name, code, building, room_type, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, schoolId, d.name, d.code.toUpperCase(), d.building, d.roomType, d.capacity);

    const room = db.prepare('SELECT * FROM school_rooms WHERE id = ?').get(id);
    res.status(201).json({ room });
  },
);

schoolTimetableRouter.delete(
  '/timetable/rooms/:roomId',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const used = db
      .prepare('SELECT id FROM timetable_slots WHERE school_id = ? AND room_id = ? LIMIT 1')
      .get(schoolId, req.params.roomId);
    if (used) {
      res.status(409).json({ error: 'Room is referenced by scheduled timetable slots and cannot be deleted.' });
      return;
    }
    const result = db
      .prepare('DELETE FROM school_rooms WHERE id = ? AND school_id = ?')
      .run(req.params.roomId, schoolId);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolTimetableRouter.get(
  '/timetable/timetables',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.timetable.manage');
    const timetables = db
      .prepare(`
        SELECT
          tt.*, c.name AS class_name, a.name AS arm_name,
          trm.name AS term_name, ses.name AS session_name,
          (SELECT COUNT(*) FROM timetable_slots sl WHERE sl.timetable_id = tt.id) AS slot_count
        FROM timetables tt
        INNER JOIN school_classes c ON c.id = tt.class_id
        LEFT JOIN class_arms a ON a.id = tt.arm_id
        LEFT JOIN academic_terms trm ON trm.id = tt.academic_term_id
        LEFT JOIN academic_sessions ses ON ses.id = tt.academic_session_id
        WHERE tt.school_id = ? ${isAdmin ? '' : "AND tt.status = 'published'"}
        ORDER BY tt.updated_at DESC
      `)
      .all(schoolId);
    res.json({ timetables });
  },
);

schoolTimetableRouter.post(
  '/timetable/timetables',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createTimetableSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid timetable payload.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    ensureTimetableDefaults(schoolId);

    const cls = db
      .prepare('SELECT id FROM school_classes WHERE id = ? AND school_id = ?')
      .get(d.classId, schoolId);
    if (!cls) {
      res.status(404).json({ error: 'Selected class not found in your school.' });
      return;
    }

    const id = `ttb_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO timetables (id, school_id, academic_session_id, academic_term_id, class_id, arm_id, title, status, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(id, schoolId, d.academicSessionId ?? null, d.academicTermId ?? null, d.classId, d.armId ?? null, d.title, req.auth!.id);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.timetable.created',
      resourceType: 'timetable',
      resourceId: id,
      outcome: 'success',
      metadata: { title: d.title, classId: d.classId },
      ipAddress: getClientIp(req),
    });

    const timetable = db.prepare('SELECT * FROM timetables WHERE id = ?').get(id);
    res.status(201).json({ timetable });
  },
);

schoolTimetableRouter.get(
  '/timetable/timetables/:timetableId',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureTimetableDefaults(schoolId);
    const timetable = db
      .prepare(`
        SELECT tt.*, c.name AS class_name, a.name AS arm_name, trm.name AS term_name, ses.name AS session_name
        FROM timetables tt
        INNER JOIN school_classes c ON c.id = tt.class_id
        LEFT JOIN class_arms a ON a.id = tt.arm_id
        LEFT JOIN academic_terms trm ON trm.id = tt.academic_term_id
        LEFT JOIN academic_sessions ses ON ses.id = tt.academic_session_id
        WHERE tt.id = ? AND tt.school_id = ?
      `)
      .get(req.params.timetableId, schoolId) as { id: string; status: string } | undefined;

    if (!timetable) {
      res.status(404).json({ error: 'Timetable not found in your school.' });
      return;
    }
    const isAdmin = hasPermission(req.auth!.permissions, 'school.timetable.manage');
    if (!isAdmin && timetable.status !== 'published') {
      res.status(403).json({ error: 'Only published timetables are visible to non-administrators.' });
      return;
    }

    const periods = db
      .prepare('SELECT * FROM timetable_periods WHERE school_id = ? ORDER BY period_order ASC')
      .all(schoolId);
    const slots = db
      .prepare(`
        SELECT
          sl.*,
          p.label AS period_label, p.start_time, p.end_time, p.period_order, p.is_break,
          sub.name AS subject_name, sub.code AS subject_code,
          (t.first_name || ' ' || t.last_name) AS teacher_name,
          rm.name AS room_name, rm.code AS room_code
        FROM timetable_slots sl
        INNER JOIN timetable_periods p ON p.id = sl.period_id
        INNER JOIN subjects sub ON sub.id = sl.subject_id
        LEFT JOIN teachers t ON t.id = sl.teacher_id
        LEFT JOIN school_rooms rm ON rm.id = sl.room_id
        WHERE sl.timetable_id = ? AND sl.school_id = ?
        ORDER BY sl.day_of_week ASC, p.period_order ASC
      `)
      .all(req.params.timetableId, schoolId);

    res.json({
      timetable,
      schoolDays: JSON.parse(settings.school_days_json),
      periods,
      slots,
    });
  },
);

schoolTimetableRouter.post(
  '/timetable/timetables/:timetableId/slots',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = upsertTimetableSlotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid timetable slot.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;

    const timetable = db
      .prepare('SELECT id, class_id, arm_id, academic_term_id FROM timetables WHERE id = ? AND school_id = ?')
      .get(req.params.timetableId, schoolId) as
      | { id: string; class_id: string; arm_id: string | null; academic_term_id: string | null }
      | undefined;
    if (!timetable) {
      res.status(404).json({ error: 'Timetable not found.' });
      return;
    }

    const period = db
      .prepare('SELECT id, start_time, end_time, is_break, label FROM timetable_periods WHERE id = ? AND school_id = ?')
      .get(d.periodId, schoolId) as
      | { id: string; start_time: string; end_time: string; is_break: number; label: string }
      | undefined;
    if (!period) {
      res.status(404).json({ error: 'Selected period not found in your school.' });
      return;
    }

    if (period.is_break === 1) {
      res.status(409).json({
        error: `Period "${period.label}" is configured as a school break period and cannot hold instructional lessons.`,
      });
      return;
    }

    const subject = db
      .prepare('SELECT id FROM subjects WHERE id = ? AND school_id = ?')
      .get(d.subjectId, schoolId);
    if (!subject) {
      res.status(404).json({ error: 'Subject not found in your school.' });
      return;
    }

    if (d.teacherId) {
      const teacher = db
        .prepare("SELECT id FROM teachers WHERE id = ? AND school_id = ? AND employment_status = 'active'")
        .get(d.teacherId, schoolId);
      if (!teacher) {
        res.status(404).json({ error: 'Active teacher not found in your school.' });
        return;
      }
    }

    if (d.roomId) {
      const room = db
        .prepare('SELECT id FROM school_rooms WHERE id = ? AND school_id = ? AND is_active = 1')
        .get(d.roomId, schoolId);
      if (!room) {
        res.status(404).json({ error: 'Active room not found in your school.' });
        return;
      }
    }

    const existingSameCell = db
      .prepare('SELECT id FROM timetable_slots WHERE timetable_id = ? AND day_of_week = ? AND period_id = ?')
      .get(timetable.id, d.dayOfWeek, d.periodId) as { id: string } | undefined;

    // Fetch all active slots across school (excluding archived timetables & current slot cell being replaced)
    const schoolSlots = db
      .prepare(`
        SELECT
          sl.id, sl.timetable_id, sl.class_id, sl.arm_id, sl.day_of_week, sl.period_id,
          sl.teacher_id, sl.room_id,
          p.start_time, p.end_time, p.is_break,
          c.name AS class_name,
          (t.first_name || ' ' || t.last_name) AS teacher_name,
          rm.name AS room_name
        FROM timetable_slots sl
        INNER JOIN timetables tt ON tt.id = sl.timetable_id
        INNER JOIN timetable_periods p ON p.id = sl.period_id
        INNER JOIN school_classes c ON c.id = sl.class_id
        LEFT JOIN teachers t ON t.id = sl.teacher_id
        LEFT JOIN school_rooms rm ON rm.id = sl.room_id
        WHERE sl.school_id = ? AND tt.status != 'archived'
          ${timetable.academic_term_id ? 'AND (tt.academic_term_id IS NULL OR tt.academic_term_id = ?)' : ''}
      `)
      .all(...(timetable.academic_term_id ? [schoolId, timetable.academic_term_id] : [schoolId])) as Array<{
      id: string;
      timetable_id: string;
      class_id: string;
      arm_id: string | null;
      day_of_week: string;
      period_id: string;
      teacher_id: string | null;
      room_id: string | null;
      start_time: string;
      end_time: string;
      is_break: number;
      class_name: string;
      teacher_name: string | null;
      room_name: string | null;
    }>;

    const allPeriods = db
      .prepare('SELECT id, label, start_time, end_time, is_break FROM timetable_periods WHERE school_id = ?')
      .all(schoolId) as Array<{
      id: string;
      label: string;
      start_time: string;
      end_time: string;
      is_break: number;
    }>;

    const conflicts = detectTimetableSlotConflicts({
      candidate: {
        timetableId: timetable.id,
        classId: timetable.class_id,
        armId: timetable.arm_id,
        dayOfWeek: d.dayOfWeek as DayOfWeek,
        periodId: d.periodId,
        teacherId: d.teacherId ?? null,
        roomId: d.roomId ?? null,
      },
      existingSlots: schoolSlots.map((s) => ({
        id: s.id,
        timetableId: s.timetable_id,
        classId: s.class_id,
        className: s.class_name,
        armId: s.arm_id,
        dayOfWeek: s.day_of_week as DayOfWeek,
        periodId: s.period_id,
        teacherId: s.teacher_id,
        roomId: s.room_id,
      })),
      periods: allPeriods.map((p) => ({
        id: p.id,
        label: p.label,
        startTime: p.start_time,
        endTime: p.end_time,
        isBreak: p.is_break === 1,
      })),
      ignoreSlotId: existingSameCell?.id,
    });

    if (conflicts.length > 0) {
      res.status(409).json({
        error: conflicts.map((c) => c.message).join(' '),
        conflicts,
      });
      return;
    }

    const slotId = existingSameCell?.id ?? `tts_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO timetable_slots (
        id, school_id, timetable_id, class_id, arm_id, day_of_week, period_id, subject_id, teacher_id, room_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(timetable_id, day_of_week, period_id) DO UPDATE SET
        subject_id = excluded.subject_id,
        teacher_id = excluded.teacher_id,
        room_id = excluded.room_id,
        notes = excluded.notes
    `).run(
      slotId,
      schoolId,
      timetable.id,
      timetable.class_id,
      timetable.arm_id,
      d.dayOfWeek,
      d.periodId,
      d.subjectId,
      d.teacherId ?? null,
      d.roomId ?? null,
      d.notes ?? '',
    );

    db.prepare("UPDATE timetables SET revision_number = revision_number + 1, updated_at = datetime('now') WHERE id = ?").run(
      timetable.id,
    );

    const slot = db
      .prepare(`
        SELECT sl.*, p.label AS period_label, p.start_time, p.end_time, sub.name AS subject_name,
               (t.first_name || ' ' || t.last_name) AS teacher_name, rm.name AS room_name
        FROM timetable_slots sl
        INNER JOIN timetable_periods p ON p.id = sl.period_id
        INNER JOIN subjects sub ON sub.id = sl.subject_id
        LEFT JOIN teachers t ON t.id = sl.teacher_id
        LEFT JOIN school_rooms rm ON rm.id = sl.room_id
        WHERE sl.id = ?
      `)
      .get(slotId);
    res.status(201).json({ slot });
  },
);

schoolTimetableRouter.delete(
  '/timetable/timetables/:timetableId/slots/:slotId',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const result = db
      .prepare('DELETE FROM timetable_slots WHERE id = ? AND timetable_id = ? AND school_id = ?')
      .run(req.params.slotId, req.params.timetableId, schoolId);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Timetable slot not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolTimetableRouter.patch(
  '/timetable/timetables/:timetableId/publish',
  requireCsrfCheck,
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const status = req.body?.status === 'archived' ? 'archived' : 'published';
    const result = db
      .prepare(`
        UPDATE timetables
        SET status = ?, published_at = CASE WHEN ? = 'published' THEN datetime('now') ELSE published_at END, updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `)
      .run(status, status, req.params.timetableId, schoolId);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Timetable not found.' });
      return;
    }
    res.json({ id: req.params.timetableId, status });
  },
);

schoolTimetableRouter.get(
  '/timetable/teacher/:teacherId',
  requirePermission('school.timetable.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureTimetableDefaults(schoolId);
    const teacher = db
      .prepare('SELECT id, first_name, last_name, staff_id_number FROM teachers WHERE id = ? AND school_id = ?')
      .get(req.params.teacherId, schoolId);
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }
    const periods = db
      .prepare('SELECT * FROM timetable_periods WHERE school_id = ? ORDER BY period_order ASC')
      .all(schoolId);
    const slots = db
      .prepare(`
        SELECT sl.*, p.label AS period_label, p.start_time, p.end_time, p.period_order,
               c.name AS class_name, a.name AS arm_name, sub.name AS subject_name, rm.name AS room_name
        FROM timetable_slots sl
        INNER JOIN timetables tt ON tt.id = sl.timetable_id
        INNER JOIN timetable_periods p ON p.id = sl.period_id
        INNER JOIN school_classes c ON c.id = sl.class_id
        LEFT JOIN class_arms a ON a.id = sl.arm_id
        INNER JOIN subjects sub ON sub.id = sl.subject_id
        LEFT JOIN school_rooms rm ON rm.id = sl.room_id
        WHERE sl.school_id = ? AND sl.teacher_id = ? AND tt.status != 'archived'
        ORDER BY p.period_order ASC
      `)
      .all(schoolId, req.params.teacherId);
    res.json({
      teacher,
      schoolDays: JSON.parse(settings.school_days_json),
      periods,
      slots,
    });
  },
);

schoolTimetableRouter.get(
  '/timetable/my-schedule',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const roleCode = req.auth!.roleCode;
    const settings = ensureTimetableDefaults(schoolId);
    const periods = db
      .prepare('SELECT * FROM timetable_periods WHERE school_id = ? ORDER BY period_order ASC')
      .all(schoolId);

    if (roleCode === 'teacher') {
      const teacher = db
        .prepare("SELECT id, first_name, last_name FROM teachers WHERE school_id = ? AND user_id = ? AND employment_status = 'active' LIMIT 1")
        .get(schoolId, req.auth!.id) as { id: string } | undefined;
      const slots = teacher
        ? db
            .prepare(`
              SELECT sl.*, p.label AS period_label, p.start_time, p.end_time, p.period_order,
                     c.name AS class_name, a.name AS arm_name, sub.name AS subject_name, rm.name AS room_name
              FROM timetable_slots sl
              INNER JOIN timetables tt ON tt.id = sl.timetable_id
              INNER JOIN timetable_periods p ON p.id = sl.period_id
              INNER JOIN school_classes c ON c.id = sl.class_id
              LEFT JOIN class_arms a ON a.id = sl.arm_id
              INNER JOIN subjects sub ON sub.id = sl.subject_id
              LEFT JOIN school_rooms rm ON rm.id = sl.room_id
              WHERE sl.school_id = ? AND sl.teacher_id = ? AND tt.status = 'published'
              ORDER BY p.period_order ASC
            `)
            .all(schoolId, teacher.id)
        : [];
      res.json({ schoolDays: JSON.parse(settings.school_days_json), periods, slots, wards: [] });
      return;
    }

    if (roleCode === 'student') {
      const stu = db
        .prepare('SELECT id, current_class_id, current_arm_id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
        .get(schoolId, req.auth!.id) as { id: string; current_class_id: string | null; current_arm_id: string | null } | undefined;
      const slots = stu?.current_class_id
        ? db
            .prepare(`
              SELECT sl.*, p.label AS period_label, p.start_time, p.end_time, p.period_order,
                     c.name AS class_name, sub.name AS subject_name,
                     (t.first_name || ' ' || t.last_name) AS teacher_name, rm.name AS room_name
              FROM timetable_slots sl
              INNER JOIN timetables tt ON tt.id = sl.timetable_id
              INNER JOIN timetable_periods p ON p.id = sl.period_id
              INNER JOIN school_classes c ON c.id = sl.class_id
              INNER JOIN subjects sub ON sub.id = sl.subject_id
              LEFT JOIN teachers t ON t.id = sl.teacher_id
              LEFT JOIN school_rooms rm ON rm.id = sl.room_id
              WHERE sl.school_id = ? AND sl.class_id = ? AND tt.status = 'published'
                AND (tt.arm_id IS NULL OR tt.arm_id = ?)
              ORDER BY p.period_order ASC
            `)
            .all(schoolId, stu.current_class_id, stu.current_arm_id ?? '')
        : [];
      res.json({ schoolDays: JSON.parse(settings.school_days_json), periods, slots, wards: [] });
      return;
    }

    if (roleCode === 'parent') {
      const wards = db
        .prepare(`
          SELECT s.id, s.first_name, s.last_name, s.current_class_id, s.current_arm_id, c.name AS class_name
          FROM parents p
          INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
          INNER JOIN students s ON s.id = sg.student_id AND s.school_id = p.school_id
          LEFT JOIN school_classes c ON c.id = s.current_class_id
          WHERE p.school_id = ? AND p.user_id = ? AND p.status = 'active'
        `)
        .all(schoolId, req.auth!.id) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        current_class_id: string | null;
        current_arm_id: string | null;
        class_name: string | null;
      }>;

      const wardsWithSlots = wards.map((w) => {
        const slots = w.current_class_id
          ? db
              .prepare(`
                SELECT sl.*, p.label AS period_label, p.start_time, p.end_time, p.period_order,
                       sub.name AS subject_name, (t.first_name || ' ' || t.last_name) AS teacher_name, rm.name AS room_name
                FROM timetable_slots sl
                INNER JOIN timetables tt ON tt.id = sl.timetable_id
                INNER JOIN timetable_periods p ON p.id = sl.period_id
                INNER JOIN subjects sub ON sub.id = sl.subject_id
                LEFT JOIN teachers t ON t.id = sl.teacher_id
                LEFT JOIN school_rooms rm ON rm.id = sl.room_id
                WHERE sl.school_id = ? AND sl.class_id = ? AND tt.status = 'published'
                  AND (tt.arm_id IS NULL OR tt.arm_id = ?)
                ORDER BY p.period_order ASC
              `)
              .all(schoolId, w.current_class_id, w.current_arm_id ?? '')
          : [];
        return { ...w, slots };
      });
      res.json({ schoolDays: JSON.parse(settings.school_days_json), periods, slots: [], wards: wardsWithSlots });
      return;
    }

    res.json({ schoolDays: JSON.parse(settings.school_days_json), periods, slots: [], wards: [] });
  },
);

schoolTimetableRouter.get(
  '/timetable/timetables/:timetableId/pdf',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const tt = db
      .prepare(`
        SELECT tt.*, c.name AS class_name, sch.name AS school_name
        FROM timetables tt
        INNER JOIN school_classes c ON c.id = tt.class_id
        INNER JOIN schools sch ON sch.id = tt.school_id
        WHERE tt.id = ? AND tt.school_id = ?
      `)
      .get(req.params.timetableId, schoolId) as
      | { id: string; title: string; class_name: string; school_name: string; status: string }
      | undefined;
    if (!tt) {
      res.status(404).json({ error: 'Timetable not found.' });
      return;
    }

    const slots = db
      .prepare(`
        SELECT sl.day_of_week, p.label AS period_label, p.start_time, p.end_time,
               sub.name AS subject_name, (t.first_name || ' ' || t.last_name) AS teacher_name, rm.name AS room_name
        FROM timetable_slots sl
        INNER JOIN timetable_periods p ON p.id = sl.period_id
        INNER JOIN subjects sub ON sub.id = sl.subject_id
        LEFT JOIN teachers t ON t.id = sl.teacher_id
        LEFT JOIN school_rooms rm ON rm.id = sl.room_id
        WHERE sl.timetable_id = ? AND sl.school_id = ?
        ORDER BY sl.day_of_week ASC, p.period_order ASC
      `)
      .all(tt.id, schoolId) as Array<{
      day_of_week: string;
      period_label: string;
      start_time: string;
      end_time: string;
      subject_name: string;
      teacher_name: string | null;
      room_name: string | null;
    }>;

    const metaLines = [
      `Class: ${tt.class_name}`,
      `Status: ${tt.status.toUpperCase()}`,
    ];
    const columns = [
      { label: 'Day / Time', x: 40 },
      { label: 'Period & Subject', x: 140 },
      { label: 'Teacher & Venue', x: 380 },
    ];
    const rows = slots.map((s) => [
      `${s.day_of_week.slice(0, 3)} ${s.start_time}-${s.end_time}`,
      `${s.period_label}: ${s.subject_name}`,
      `${s.teacher_name || 'TBA'} (${s.room_name || 'Default Room'})`,
    ]);

    const pdfBuf = buildSimpleTabularPdf({
      title: `${tt.school_name} - ${tt.title}`,
      subtitle: 'Official Class Weekly Timetable',
      metaLines,
      columns,
      rows,
      footerLines: [`Generated by Dave Timi EdTech Systems · ${new Date().toISOString().slice(0, 10)}`],
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="timetable_${tt.id}.pdf"`);
    res.send(pdfBuf);
  },
);
