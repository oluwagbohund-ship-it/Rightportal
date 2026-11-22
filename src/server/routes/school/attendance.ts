import crypto from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import { getDb } from '../../../db/client.ts';
import { buildSimpleTabularPdf } from '../../academics-engine.ts';
import {
  canTeacherEditAttendanceWindow,
  computeAttendanceStats,
  escapeCsvCell,
  isQrSessionValid,
  type AttendanceStatus,
} from '../../attendance-engine.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { generateOpaqueToken, hasPermission, sha256Hex } from '../../security.ts';
import {
  createAttendanceCorrectionSchema,
  generateQrAttendanceSchema,
  markAttendanceRegisterSchema,
  reviewAttendanceCorrectionSchema,
  scanQrAttendanceSchema,
  updateAttendanceSettingsSchema,
} from '../../validation-v1.ts';
import { getTeacherRecordForUser } from './academics/helpers.ts';

export const schoolAttendanceRouter = Router();

function ensureAttendanceSettings(schoolId: string) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO attendance_settings (school_id) VALUES (?)').run(schoolId);
  return db
    .prepare('SELECT * FROM attendance_settings WHERE school_id = ?')
    .get(schoolId) as {
    school_id: string;
    mark_late_after_time: string;
    allow_teacher_edit_hours: number;
    qr_default_ttl_minutes: number;
    qr_require_enrolled_class: number;
    auto_sync_term_summary: number;
  };
}

function isTeacherAssignedToClass(schoolId: string, userId: string, classId: string): boolean {
  const teacher = getTeacherRecordForUser(schoolId, userId);
  if (!teacher) return false;
  const db = getDb();
  const hit = db
    .prepare(`
      SELECT 1 FROM class_teacher_assignments
      WHERE school_id = ? AND teacher_id = ? AND class_id = ? AND is_active = 1
      LIMIT 1
    `)
    .get(schoolId, teacher.id, classId);
  if (hit) return true;
  const subHit = db
    .prepare(`
      SELECT 1 FROM teacher_subject_assignments
      WHERE school_id = ? AND teacher_id = ? AND is_active = 1 AND (class_id IS NULL OR class_id = ?)
      LIMIT 1
    `)
    .get(schoolId, teacher.id, classId);
  return Boolean(subHit);
}

function syncStudentTermAttendanceSummaries(
  schoolId: string,
  academicTermId: string | null | undefined,
  studentIds: string[],
  actorUserId: string,
) {
  if (!academicTermId || studentIds.length === 0) return;
  const settings = ensureAttendanceSettings(schoolId);
  if (settings.auto_sync_term_summary !== 1) return;

  const db = getDb();
  const termRow = db
    .prepare('SELECT id, academic_session_id FROM academic_terms WHERE id = ? AND school_id = ?')
    .get(academicTermId, schoolId) as { id: string; academic_session_id: string } | undefined;
  if (!termRow) return;

  for (const studentId of new Set(studentIds)) {
    const counts = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_cnt,
          SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_cnt,
          SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_cnt
        FROM attendance_records
        WHERE school_id = ? AND academic_term_id = ? AND student_id = ?
      `)
      .get(schoolId, academicTermId, studentId) as {
      total: number;
      present_cnt: number | null;
      absent_cnt: number | null;
      late_cnt: number | null;
    };

    const daysPresent = Number(counts.present_cnt ?? 0) + Number(counts.late_cnt ?? 0);
    db.prepare(`
      INSERT INTO student_attendance_summaries (
        id, school_id, academic_session_id, academic_term_id, student_id,
        days_opened, days_present, days_absent, late_count, updated_by_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(school_id, academic_term_id, student_id) DO UPDATE SET
        days_opened = excluded.days_opened,
        days_present = excluded.days_present,
        days_absent = excluded.days_absent,
        late_count = excluded.late_count,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = datetime('now')
    `).run(
      `sas_${crypto.randomUUID()}`,
      schoolId,
      termRow.academic_session_id,
      academicTermId,
      studentId,
      Number(counts.total ?? 0),
      daysPresent,
      Number(counts.absent_cnt ?? 0),
      Number(counts.late_cnt ?? 0),
      actorUserId,
    );
  }
}

schoolAttendanceRouter.get(
  '/attendance/settings',
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const settings = ensureAttendanceSettings(req.auth!.activeSchoolId!);
    res.json({ settings });
  },
);

schoolAttendanceRouter.put(
  '/attendance/settings',
  requireCsrfCheck,
  requirePermission('school.attendance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateAttendanceSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureAttendanceSettings(schoolId);

    db.prepare(`
      UPDATE attendance_settings SET
        mark_late_after_time = ?,
        allow_teacher_edit_hours = ?,
        qr_default_ttl_minutes = ?,
        qr_require_enrolled_class = ?,
        auto_sync_term_summary = ?,
        updated_at = datetime('now')
      WHERE school_id = ?
    `).run(
      parsed.data.markLateAfterTime,
      parsed.data.allowTeacherEditHours,
      parsed.data.qrDefaultTtlMinutes,
      parsed.data.qrRequireEnrolledClass ? 1 : 0,
      parsed.data.autoSyncTermSummary ? 1 : 0,
      schoolId,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.attendance.settings_updated',
      resourceType: 'attendance_settings',
      resourceId: schoolId,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ settings: ensureAttendanceSettings(schoolId) });
  },
);

schoolAttendanceRouter.get(
  '/attendance/overview',
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const targetDate =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    const isAdmin = hasPermission(req.auth!.permissions, 'school.attendance.manage');
    const teacher = !isAdmin ? getTeacherRecordForUser(schoolId, req.auth!.id) : undefined;

    const todayRows = db
      .prepare(`
        SELECT ar.status
        FROM attendance_records ar
        WHERE ar.school_id = ? AND ar.attendance_date = ?
      `)
      .all(schoolId, targetDate) as Array<{ status: AttendanceStatus }>;

    const todaySummary = computeAttendanceStats(todayRows.map((r) => r.status));

    const totalActiveStudents = (
      db
        .prepare("SELECT COUNT(*) AS count FROM students WHERE school_id = ? AND status = 'active'")
        .get(schoolId) as { count: number }
    ).count;

    const classes = db
      .prepare("SELECT id, name FROM school_classes WHERE school_id = ? AND status = 'active' ORDER BY level_order ASC")
      .all(schoolId) as Array<{ id: string; name: string }>;

    const permittedClasses = isAdmin
      ? classes
      : classes.filter((c) => isTeacherAssignedToClass(schoolId, req.auth!.id, c.id));

    const perClassStats = permittedClasses.map((cls) => {
      const stuCount = (
        db
          .prepare("SELECT COUNT(*) AS c FROM students WHERE school_id = ? AND current_class_id = ? AND status = 'active'")
          .get(schoolId, cls.id) as { c: number }
      ).c;
      const recStatuses = db
        .prepare('SELECT status FROM attendance_records WHERE school_id = ? AND class_id = ? AND attendance_date = ?')
        .all(schoolId, cls.id, targetDate) as Array<{ status: AttendanceStatus }>;
      const stats = computeAttendanceStats(recStatuses.map((r) => r.status));
      return {
        class_id: cls.id,
        class_name: cls.name,
        total_students: stuCount,
        ...stats,
      };
    });

    const pendingCorrections = (
      db
        .prepare("SELECT COUNT(*) AS count FROM attendance_correction_requests WHERE school_id = ? AND status = 'pending'")
        .get(schoolId) as { count: number }
    ).count;

    const activeQrSessions = (
      db
        .prepare("SELECT COUNT(*) AS count FROM qr_attendance_sessions WHERE school_id = ? AND status = 'active' AND datetime(expires_at) > datetime('now')")
        .get(schoolId) as { count: number }
    ).count;

    const recentSessions = db
      .prepare(`
        SELECT ats.id, ats.attendance_date, ats.session_label, ats.status, ats.updated_at,
               c.name AS class_name, a.name AS arm_name, u.full_name AS marked_by_name,
               (SELECT COUNT(*) FROM attendance_records ar WHERE ar.attendance_session_id = ats.id) AS marked_count
        FROM attendance_sessions ats
        INNER JOIN school_classes c ON c.id = ats.class_id
        LEFT JOIN class_arms a ON a.id = ats.arm_id
        LEFT JOIN users u ON u.id = ats.marked_by_user_id
        WHERE ats.school_id = ?
        ORDER BY ats.attendance_date DESC, ats.updated_at DESC
        LIMIT 12
      `)
      .all(schoolId);

    res.json({
      date: targetDate,
      totalActiveStudents,
      todaySummary,
      classBreakdown: perClassStats,
      pendingCorrections,
      activeQrSessions,
      recentSessions,
      isTeacherScoped: !isAdmin && Boolean(teacher),
    });
  },
);

schoolAttendanceRouter.get(
  '/attendance/register',
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const armId = typeof req.query.armId === 'string' && req.query.armId ? req.query.armId : null;
    const attendanceDate =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);
    const sessionLabel =
      typeof req.query.sessionLabel === 'string' && req.query.sessionLabel.trim()
        ? req.query.sessionLabel.trim()
        : 'Morning Roll Call';

    if (!classId) {
      res.status(400).json({ error: 'Select a class to load the attendance register.' });
      return;
    }

    const isAdmin = hasPermission(req.auth!.permissions, 'school.attendance.manage');
    if (!isAdmin && !isTeacherAssignedToClass(schoolId, req.auth!.id, classId)) {
      res.status(403).json({ error: 'You are not assigned to mark attendance for this class.' });
      return;
    }

    const students = db
      .prepare(`
        SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.current_arm_id, a.name AS arm_name
        FROM students s
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.school_id = ? AND s.current_class_id = ? AND s.status = 'active'
          ${armId ? 'AND s.current_arm_id = ?' : ''}
        ORDER BY s.last_name ASC, s.first_name ASC
      `)
      .all(...(armId ? [schoolId, classId, armId] : [schoolId, classId])) as Array<{
      id: string;
      admission_number: string;
      first_name: string;
      last_name: string;
      gender: string;
      current_arm_id: string | null;
      arm_name: string | null;
    }>;

    const armScopeKey = armId || '__ALL__';
    const session = db
      .prepare(`
        SELECT * FROM attendance_sessions
        WHERE school_id = ? AND class_id = ? AND arm_scope_key = ? AND attendance_date = ? AND session_label = ?
      `)
      .get(schoolId, classId, armScopeKey, attendanceDate, sessionLabel) as
      | { id: string; status: string; notes: string; academic_term_id: string | null; created_at: string }
      | undefined;

    const existingRecords = session
      ? (db
          .prepare('SELECT id, student_id, status, remarks, source, marked_at FROM attendance_records WHERE attendance_session_id = ? AND school_id = ?')
          .all(session.id, schoolId) as Array<{
          id: string;
          student_id: string;
          status: AttendanceStatus;
          remarks: string;
          source: string;
          marked_at: string;
        }>)
      : [];

    const recordByStudent = new Map(existingRecords.map((r) => [r.student_id, r]));
    const settings = ensureAttendanceSettings(schoolId);
    const editWindow = session
      ? canTeacherEditAttendanceWindow({
          createdAtIso: session.created_at,
          allowHours: settings.allow_teacher_edit_hours,
        })
      : { allowed: true, hoursElapsed: 0 };

    res.json({
      session: session ?? null,
      canEditDirectly: isAdmin || editWindow.allowed,
      editWindowHoursElapsed: editWindow.hoursElapsed,
      roster: students.map((stu) => {
        const rec = recordByStudent.get(stu.id);
        return {
          ...stu,
          recordId: rec?.id ?? null,
          attendanceStatus: rec?.status ?? 'present',
          remarks: rec?.remarks ?? '',
          source: rec?.source ?? null,
          markedAt: rec?.marked_at ?? null,
        };
      }),
    });
  },
);

schoolAttendanceRouter.post(
  '/attendance/register',
  requireCsrfCheck,
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const parsed = markAttendanceRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid attendance payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId, armId, attendanceDate, sessionLabel, notes, finalize, reason, entries } = parsed.data;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.attendance.manage');

    if (!isAdmin && !isTeacherAssignedToClass(schoolId, req.auth!.id, classId)) {
      res.status(403).json({ error: 'You are not authorized to mark attendance for this class.' });
      return;
    }

    const cls = db
      .prepare('SELECT id FROM school_classes WHERE id = ? AND school_id = ?')
      .get(classId, schoolId);
    if (!cls) {
      res.status(404).json({ error: 'Selected class not found.' });
      return;
    }

    // Resolve active term/session automatically if not supplied
    let academicTermId = parsed.data.academicTermId || null;
    let academicSessionId: string | null = null;
    if (academicTermId) {
      const trm = db
        .prepare('SELECT id, academic_session_id FROM academic_terms WHERE id = ? AND school_id = ?')
        .get(academicTermId, schoolId) as { id: string; academic_session_id: string } | undefined;
      if (!trm) {
        res.status(404).json({ error: 'Academic term not found.' });
        return;
      }
      academicSessionId = trm.academic_session_id;
    } else {
      const curTerm = db
        .prepare('SELECT id, academic_session_id FROM academic_terms WHERE school_id = ? AND is_current = 1 LIMIT 1')
        .get(schoolId) as { id: string; academic_session_id: string } | undefined;
      if (curTerm) {
        academicTermId = curTerm.id;
        academicSessionId = curTerm.academic_session_id;
      }
    }

    const armScopeKey = armId || '__ALL__';
    const settings = ensureAttendanceSettings(schoolId);
    const existingSession = db
      .prepare(`
        SELECT id, status, created_at FROM attendance_sessions
        WHERE school_id = ? AND class_id = ? AND arm_scope_key = ? AND attendance_date = ? AND session_label = ?
      `)
      .get(schoolId, classId, armScopeKey, attendanceDate, sessionLabel) as
      | { id: string; status: string; created_at: string }
      | undefined;

    if (existingSession && !isAdmin) {
      const windowCheck = canTeacherEditAttendanceWindow({
        createdAtIso: existingSession.created_at,
        allowHours: settings.allow_teacher_edit_hours,
      });
      if (!windowCheck.allowed || existingSession.status === 'finalized') {
        res.status(403).json({
          error:
            'This register edit window has closed or is finalized. Submit an Attendance Correction Request for administrator review.',
        });
        return;
      }
    }

    const sessionId = existingSession?.id ?? `ats_${crypto.randomUUID()}`;
    const nextSessionStatus = existingSession
      ? isAdmin && existingSession.status === 'finalized'
        ? 'amended'
        : finalize
          ? 'finalized'
          : 'open'
      : finalize
        ? 'finalized'
        : 'open';

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!existingSession) {
        db.prepare(`
          INSERT INTO attendance_sessions (
            id, school_id, academic_session_id, academic_term_id, class_id, arm_id, arm_scope_key,
            attendance_date, session_label, marked_by_user_id, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          schoolId,
          academicSessionId,
          academicTermId,
          classId,
          armId ?? null,
          armScopeKey,
          attendanceDate,
          sessionLabel,
          req.auth!.id,
          nextSessionStatus,
          notes,
        );
      } else {
        db.prepare(`
          UPDATE attendance_sessions
          SET status = ?, notes = ?, academic_term_id = COALESCE(?, academic_term_id), updated_at = datetime('now')
          WHERE id = ? AND school_id = ?
        `).run(nextSessionStatus, notes, academicTermId, sessionId, schoolId);
      }

      for (const entry of entries) {
        const studentRow = db
          .prepare('SELECT id, current_arm_id FROM students WHERE id = ? AND school_id = ?')
          .get(entry.studentId, schoolId) as { id: string; current_arm_id: string | null } | undefined;
        if (!studentRow) {
          throw new Error(`Student ${entry.studentId} does not belong to your school.`);
        }

        const existingRec = db
          .prepare('SELECT id, status FROM attendance_records WHERE attendance_session_id = ? AND student_id = ? AND school_id = ?')
          .get(sessionId, entry.studentId, schoolId) as { id: string; status: string } | undefined;

        const recordId = existingRec?.id ?? `atr_${crypto.randomUUID()}`;
        if (!existingRec) {
          db.prepare(`
            INSERT INTO attendance_records (
              id, school_id, attendance_session_id, student_id, class_id, arm_id,
              academic_term_id, attendance_date, status, remarks, source, marked_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
          `).run(
            recordId,
            schoolId,
            sessionId,
            entry.studentId,
            classId,
            armId ?? studentRow.current_arm_id,
            academicTermId,
            attendanceDate,
            entry.status,
            entry.remarks,
            req.auth!.id,
          );
        } else {
          db.prepare(`
            UPDATE attendance_records
            SET status = ?, remarks = ?, marked_by_user_id = ?, updated_at = datetime('now')
            WHERE id = ? AND school_id = ?
          `).run(entry.status, entry.remarks, req.auth!.id, recordId, schoolId);

          if (existingRec.status !== entry.status) {
            db.prepare(`
              INSERT INTO attendance_audit_logs (
                id, school_id, attendance_record_id, student_id, old_status, new_status, reason, actor_user_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              `aal_${crypto.randomUUID()}`,
              schoolId,
              recordId,
              entry.studentId,
              existingRec.status,
              entry.status,
              reason || 'Register update',
              req.auth!.id,
            );
          }
        }
      }

      syncStudentTermAttendanceSummaries(
        schoolId,
        academicTermId,
        entries.map((e) => e.studentId),
        req.auth!.id,
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save attendance register.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.attendance.register_marked',
      resourceType: 'attendance_session',
      resourceId: sessionId,
      outcome: 'success',
      metadata: { classId, attendanceDate, count: entries.length },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      sessionId,
      status: nextSessionStatus,
      savedCount: entries.length,
    });
  },
);

schoolAttendanceRouter.get(
  '/attendance/history',
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : '';
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const conditions = ['ar.school_id = ?'];
    const params: Array<string> = [schoolId];

    if (classId) {
      conditions.push('ar.class_id = ?');
      params.push(classId);
    }
    if (fromDate) {
      conditions.push('ar.attendance_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('ar.attendance_date <= ?');
      params.push(toDate);
    }
    if (statusFilter && ['present', 'absent', 'late', 'excused'].includes(statusFilter)) {
      conditions.push('ar.status = ?');
      params.push(statusFilter);
    }
    if (search) {
      conditions.push("(LOWER(s.first_name || ' ' || s.last_name) LIKE ? OR LOWER(s.admission_number) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const records = db
      .prepare(`
        SELECT
          ar.id, ar.attendance_date, ar.status, ar.remarks, ar.source, ar.marked_at,
          s.id AS student_id, s.admission_number, s.first_name, s.last_name,
          c.name AS class_name, a.name AS arm_name,
          ats.session_label, u.full_name AS marked_by_name
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        INNER JOIN school_classes c ON c.id = ar.class_id
        LEFT JOIN class_arms a ON a.id = ar.arm_id
        INNER JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id
        LEFT JOIN users u ON u.id = ar.marked_by_user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ar.attendance_date DESC, ar.marked_at DESC
        LIMIT 250
      `)
      .all(...params);

    res.json({ records });
  },
);

schoolAttendanceRouter.get(
  '/attendance/reports',
  requirePermission('school.attendance.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : '';
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : '';
    const format = typeof req.query.format === 'string' ? req.query.format : 'json';

    const conditions = ['ar.school_id = ?'];
    const params: string[] = [schoolId];
    if (classId) {
      conditions.push('ar.class_id = ?');
      params.push(classId);
    }
    if (fromDate) {
      conditions.push('ar.attendance_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('ar.attendance_date <= ?');
      params.push(toDate);
    }

    const studentSummaries = db
      .prepare(`
        SELECT
          s.id AS student_id, s.admission_number, s.first_name, s.last_name,
          c.name AS class_name, a.name AS arm_name,
          COUNT(ar.id) AS total_sessions,
          SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count,
          SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
          SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) AS late_count,
          SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) AS excused_count
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        INNER JOIN school_classes c ON c.id = ar.class_id
        LEFT JOIN class_arms a ON a.id = ar.arm_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY s.id, s.admission_number, s.first_name, s.last_name, c.name, a.name
        ORDER BY absent_count DESC, s.last_name ASC
      `)
      .all(...params) as Array<{
      student_id: string;
      admission_number: string;
      first_name: string;
      last_name: string;
      class_name: string;
      arm_name: string | null;
      total_sessions: number;
      present_count: number;
      absent_count: number;
      late_count: number;
      excused_count: number;
    }>;

    const enriched = studentSummaries.map((row) => {
      const attended = row.present_count + row.late_count;
      const rate = row.total_sessions > 0 ? Math.round((attended / row.total_sessions) * 10000) / 100 : 0;
      return { ...row, attendance_rate: rate };
    });

    const absentees = enriched.filter((r) => r.absent_count > 0);

    if (format === 'csv') {
      const header = ['Admission No', 'Student Name', 'Class', 'Total Marked', 'Present', 'Late', 'Absent', 'Excused', 'Attendance Rate %']
        .map(escapeCsvCell)
        .join(',');
      const lines = enriched.map((r) =>
        [
          r.admission_number,
          `${r.first_name} ${r.last_name}`,
          `${r.class_name}${r.arm_name ? ` ${r.arm_name}` : ''}`,
          r.total_sessions,
          r.present_count,
          r.late_count,
          r.absent_count,
          r.excused_count,
          r.attendance_rate,
        ]
          .map(escapeCsvCell)
          .join(','),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
      res.send([header, ...lines].join('\n'));
      return;
    }

    if (format === 'pdf') {
      const schoolRow = db.prepare('SELECT name, code FROM schools WHERE id = ?').get(schoolId) as { name: string; code: string };
      const pdfBuf = buildSimpleTabularPdf({
        title: `${schoolRow.name} — Attendance Register Report`,
        subtitle: `School Code: ${schoolRow.code} | Range: ${fromDate || 'All'} to ${toDate || 'Present'}`,
        metaLines: [
          `Students Tracked: ${enriched.length} | Absentees Flagged: ${absentees.length}`,
          `Generated: ${new Date().toISOString().slice(0, 10)}`,
        ],
        columns: [
          { label: 'Adm No', x: 42 },
          { label: 'Student', x: 120 },
          { label: 'Class', x: 255 },
          { label: 'Pres', x: 340 },
          { label: 'Late', x: 385 },
          { label: 'Abs', x: 430 },
          { label: 'Rate', x: 485 },
        ],
        rows: enriched.map((r) => [
          r.admission_number,
          `${r.first_name} ${r.last_name}`,
          r.class_name,
          String(r.present_count),
          String(r.late_count),
          String(r.absent_count),
          `${r.attendance_rate}%`,
        ]),
        footerLines: ['Dave Timi EdTech Systems — Official Institutional Attendance Summary'],
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.pdf"');
      res.send(pdfBuf);
      return;
    }

    res.json({
      studentSummaries: enriched,
      absentees,
    });
  },
);

schoolAttendanceRouter.get(
  '/attendance/corrections',
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const corrections = db
      .prepare(`
        SELECT
          acr.*, s.admission_number, s.first_name, s.last_name,
          ar.attendance_date, c.name AS class_name,
          req_u.full_name AS requested_by_name, rev_u.full_name AS reviewed_by_name
        FROM attendance_correction_requests acr
        INNER JOIN attendance_records ar ON ar.id = acr.attendance_record_id
        INNER JOIN students s ON s.id = acr.student_id
        INNER JOIN school_classes c ON c.id = ar.class_id
        LEFT JOIN users req_u ON req_u.id = acr.requested_by_user_id
        LEFT JOIN users rev_u ON rev_u.id = acr.reviewed_by_user_id
        WHERE acr.school_id = ?
        ORDER BY acr.created_at DESC
        LIMIT 100
      `)
      .all(schoolId);

    const auditLogs = db
      .prepare(`
        SELECT aal.*, s.admission_number, s.first_name, s.last_name, u.full_name AS actor_name
        FROM attendance_audit_logs aal
        INNER JOIN students s ON s.id = aal.student_id
        LEFT JOIN users u ON u.id = aal.actor_user_id
        WHERE aal.school_id = ?
        ORDER BY aal.created_at DESC
        LIMIT 50
      `)
      .all(schoolId);

    res.json({ corrections, auditLogs });
  },
);

schoolAttendanceRouter.post(
  '/attendance/corrections',
  requireCsrfCheck,
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAttendanceCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid correction request.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const rec = db
      .prepare('SELECT id, student_id, status, class_id FROM attendance_records WHERE id = ? AND school_id = ?')
      .get(parsed.data.attendanceRecordId, schoolId) as
      | { id: string; student_id: string; status: string; class_id: string }
      | undefined;

    if (!rec) {
      res.status(404).json({ error: 'Attendance record not found in your school.' });
      return;
    }

    const id = `acr_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO attendance_correction_requests (
        id, school_id, attendance_record_id, student_id, requested_by_user_id,
        current_status, requested_status, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      schoolId,
      rec.id,
      rec.student_id,
      req.auth!.id,
      rec.status,
      parsed.data.requestedStatus,
      parsed.data.reason,
    );

    res.status(201).json({ id, status: 'pending' });
  },
);

schoolAttendanceRouter.patch(
  '/attendance/corrections/:correctionId',
  requireCsrfCheck,
  requirePermission('school.attendance.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = reviewAttendanceCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid review payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const reqRow = db
      .prepare('SELECT * FROM attendance_correction_requests WHERE id = ? AND school_id = ?')
      .get(req.params.correctionId, schoolId) as
      | {
          id: string;
          attendance_record_id: string;
          student_id: string;
          current_status: string;
          requested_status: AttendanceStatus;
          reason: string;
          status: string;
        }
      | undefined;

    if (!reqRow) {
      res.status(404).json({ error: 'Correction request not found.' });
      return;
    }
    if (reqRow.status !== 'pending') {
      res.status(400).json({ error: 'Correction request has already been reviewed.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE attendance_correction_requests
        SET status = ?, reviewed_by_user_id = ?, review_notes = ?, reviewed_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(parsed.data.decision, req.auth!.id, parsed.data.reviewNotes, reqRow.id, schoolId);

      if (parsed.data.decision === 'approved') {
        const rec = db
          .prepare('SELECT id, academic_term_id, attendance_session_id, status FROM attendance_records WHERE id = ? AND school_id = ?')
          .get(reqRow.attendance_record_id, schoolId) as {
          id: string;
          academic_term_id: string | null;
          attendance_session_id: string;
          status: string;
        };

        db.prepare("UPDATE attendance_records SET status = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
          reqRow.requested_status,
          rec.id,
          schoolId,
        );
        db.prepare("UPDATE attendance_sessions SET status = 'amended', updated_at = datetime('now') WHERE id = ?").run(
          rec.attendance_session_id,
        );
        db.prepare(`
          INSERT INTO attendance_audit_logs (
            id, school_id, attendance_record_id, student_id, old_status, new_status, reason, actor_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `aal_${crypto.randomUUID()}`,
          schoolId,
          rec.id,
          reqRow.student_id,
          rec.status,
          reqRow.requested_status,
          `Correction approved: ${reqRow.reason}`,
          req.auth!.id,
        );

        syncStudentTermAttendanceSummaries(schoolId, rec.academic_term_id, [reqRow.student_id], req.auth!.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to review correction request.' });
      return;
    }

    res.json({ id: reqRow.id, status: parsed.data.decision });
  },
);

// QR Attendance Generation & Management
schoolAttendanceRouter.get(
  '/attendance/qr',
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const sessions = db
      .prepare(`
        SELECT q.*, c.name AS class_name, a.name AS arm_name, u.full_name AS created_by_name,
               (SELECT COUNT(*) FROM qr_attendance_scans qrs WHERE qrs.qr_session_id = q.id) AS scan_count
        FROM qr_attendance_sessions q
        INNER JOIN school_classes c ON c.id = q.class_id
        LEFT JOIN class_arms a ON a.id = q.arm_id
        LEFT JOIN users u ON u.id = q.created_by_user_id
        WHERE q.school_id = ?
        ORDER BY q.created_at DESC
        LIMIT 30
      `)
      .all(schoolId);

    res.json({ sessions });
  },
);

schoolAttendanceRouter.post(
  '/attendance/qr',
  requireCsrfCheck,
  requirePermission('school.attendance.mark'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = generateQrAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid QR session payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureAttendanceSettings(schoolId);
    const isAdmin = hasPermission(req.auth!.permissions, 'school.attendance.manage');

    if (!isAdmin && !isTeacherAssignedToClass(schoolId, req.auth!.id, parsed.data.classId)) {
      res.status(403).json({ error: 'You are not assigned to generate QR attendance for this class.' });
      return;
    }

    const cls = db
      .prepare('SELECT id, name FROM school_classes WHERE id = ? AND school_id = ?')
      .get(parsed.data.classId, schoolId) as { id: string; name: string } | undefined;
    if (!cls) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    const curTerm = db
      .prepare('SELECT id, academic_session_id FROM academic_terms WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(schoolId) as { id: string; academic_session_id: string } | undefined;

    const ttlMinutes = parsed.data.ttlMinutes ?? settings.qr_default_ttl_minutes;
    const rawToken = `DTQR-${generateOpaqueToken(18)}`;
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    const attendanceDate = parsed.data.attendanceDate ?? new Date().toISOString().slice(0, 10);
    const id = `qrs_${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO qr_attendance_sessions (
        id, school_id, academic_session_id, academic_term_id, class_id, arm_id,
        title, token_hash, token_code, attendance_date, expires_at, status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      id,
      schoolId,
      curTerm?.academic_session_id ?? null,
      parsed.data.academicTermId ?? curTerm?.id ?? null,
      parsed.data.classId,
      parsed.data.armId ?? null,
      parsed.data.title,
      tokenHash,
      rawToken.slice(-8).toUpperCase(),
      attendanceDate,
      expiresAt,
      req.auth!.id,
    );

    const qrDataUrl = await QRCode.toDataURL(rawToken, {
      width: 280,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.attendance.qr_generated',
      resourceType: 'qr_attendance_session',
      resourceId: id,
      outcome: 'success',
      metadata: { classId: parsed.data.classId, ttlMinutes },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      id,
      token: rawToken,
      tokenCode: rawToken.slice(-8).toUpperCase(),
      qrDataUrl,
      className: cls.name,
      attendanceDate,
      expiresAt,
      ttlMinutes,
    });
  },
);

schoolAttendanceRouter.patch(
  '/attendance/qr/:qrSessionId/close',
  requireCsrfCheck,
  requirePermission('school.attendance.mark'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const result = db
      .prepare("UPDATE qr_attendance_sessions SET status = 'closed' WHERE id = ? AND school_id = ?")
      .run(req.params.qrSessionId, schoolId);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'QR session not found.' });
      return;
    }
    res.json({ ok: true, status: 'closed' });
  },
);

// Student QR Check-In & Personal Attendance View
schoolAttendanceRouter.post(
  '/attendance/qr/scan',
  requireCsrfCheck,
  requirePermission('student.attendance.read'),
  (req: AuthenticatedRequest, res) => {
    const parsed = scanQrAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid QR code.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare("SELECT id, current_class_id, current_arm_id, first_name, last_name FROM students WHERE school_id = ? AND user_id = ? AND status = 'active' LIMIT 1")
      .get(schoolId, req.auth!.id) as
      | { id: string; current_class_id: string | null; current_arm_id: string | null; first_name: string; last_name: string }
      | undefined;

    if (!student) {
      res.status(403).json({ error: 'Active student profile not linked to your account.' });
      return;
    }

    const tokenHash = sha256Hex(parsed.data.token.trim());
    const qrSession = db
      .prepare('SELECT * FROM qr_attendance_sessions WHERE token_hash = ? AND school_id = ?')
      .get(tokenHash, schoolId) as
      | {
          id: string;
          academic_session_id: string | null;
          academic_term_id: string | null;
          class_id: string;
          arm_id: string | null;
          title: string;
          attendance_date: string;
          expires_at: string;
          status: string;
        }
      | undefined;

    if (!qrSession) {
      res.status(404).json({ error: 'QR attendance session not found for your school.' });
      return;
    }

    const validity = isQrSessionValid({ status: qrSession.status, expiresAtIso: qrSession.expires_at });
    if (!validity.valid) {
      db.prepare("UPDATE qr_attendance_sessions SET status = 'expired' WHERE id = ? AND status = 'active'").run(qrSession.id);
      res.status(400).json({ error: validity.reason });
      return;
    }

    const settings = ensureAttendanceSettings(schoolId);
    if (settings.qr_require_enrolled_class === 1 && student.current_class_id !== qrSession.class_id) {
      res.status(403).json({ error: 'This QR attendance session belongs to a different class.' });
      return;
    }
    if (qrSession.arm_id && student.current_arm_id !== qrSession.arm_id) {
      res.status(403).json({ error: 'This QR attendance session belongs to a different class arm.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM qr_attendance_scans WHERE qr_session_id = ? AND student_id = ?')
      .get(qrSession.id, student.id);
    if (duplicate) {
      res.status(409).json({ error: 'Duplicate scan blocked: you have already checked in for this QR session.' });
      return;
    }

    const armScopeKey = qrSession.arm_id || '__ALL__';
    const sessionLabel = `QR: ${qrSession.title.slice(0, 48)}`;
    let attSessionId = (
      db
        .prepare(`
          SELECT id FROM attendance_sessions
          WHERE school_id = ? AND class_id = ? AND arm_scope_key = ? AND attendance_date = ? AND session_label = ?
        `)
        .get(schoolId, qrSession.class_id, armScopeKey, qrSession.attendance_date, sessionLabel) as
        | { id: string }
        | undefined
    )?.id;

    let recordId = '';
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!attSessionId) {
        attSessionId = `ats_${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO attendance_sessions (
            id, school_id, academic_session_id, academic_term_id, class_id, arm_id, arm_scope_key,
            attendance_date, session_label, marked_by_user_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `).run(
          attSessionId,
          schoolId,
          qrSession.academic_session_id,
          qrSession.academic_term_id,
          qrSession.class_id,
          qrSession.arm_id,
          armScopeKey,
          qrSession.attendance_date,
          sessionLabel,
          req.auth!.id,
        );
      }

      const existingRec = db
        .prepare('SELECT id FROM attendance_records WHERE attendance_session_id = ? AND student_id = ?')
        .get(attSessionId, student.id) as { id: string } | undefined;

      recordId = existingRec?.id ?? `atr_${crypto.randomUUID()}`;
      if (!existingRec) {
        db.prepare(`
          INSERT INTO attendance_records (
            id, school_id, attendance_session_id, student_id, class_id, arm_id,
            academic_term_id, attendance_date, status, remarks, source, marked_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'present', 'QR Check-In', 'qr', ?)
        `).run(
          recordId,
          schoolId,
          attSessionId,
          student.id,
          qrSession.class_id,
          qrSession.arm_id ?? student.current_arm_id,
          qrSession.academic_term_id,
          qrSession.attendance_date,
          req.auth!.id,
        );
      }

      db.prepare(`
        INSERT INTO qr_attendance_scans (id, school_id, qr_session_id, student_id, user_id, attendance_record_id, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(`qrsn_${crypto.randomUUID()}`, schoolId, qrSession.id, student.id, req.auth!.id, recordId, getClientIp(req));

      syncStudentTermAttendanceSummaries(schoolId, qrSession.academic_term_id, [student.id], req.auth!.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to record QR check-in.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'student.attendance.qr_scanned',
      resourceType: 'qr_attendance_session',
      resourceId: qrSession.id,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      ok: true,
      message: `Attendance checked in for ${qrSession.title} (${qrSession.attendance_date}).`,
      attendanceDate: qrSession.attendance_date,
      recordId,
    });
  },
);

schoolAttendanceRouter.get(
  '/student/attendance',
  requirePermission('student.attendance.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare('SELECT id, first_name, last_name, admission_number, current_class_id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string; current_class_id: string | null } | undefined;

    if (!student) {
      res.json({ student: null, stats: computeAttendanceStats([]), records: [] });
      return;
    }

    const records = db
      .prepare(`
        SELECT ar.id, ar.attendance_date, ar.status, ar.remarks, ar.source, ar.marked_at,
               c.name AS class_name, ats.session_label
        FROM attendance_records ar
        INNER JOIN school_classes c ON c.id = ar.class_id
        INNER JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id
        WHERE ar.school_id = ? AND ar.student_id = ?
        ORDER BY ar.attendance_date DESC, ar.marked_at DESC
        LIMIT 120
      `)
      .all(schoolId, student.id) as Array<{ status: AttendanceStatus }>;

    res.json({
      student,
      stats: computeAttendanceStats(records.map((r) => r.status)),
      records,
    });
  },
);

schoolAttendanceRouter.get(
  '/parent/attendance',
  requirePermission('parent.attendance.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const parent = db
      .prepare("SELECT id FROM parents WHERE school_id = ? AND user_id = ? AND status = 'active' LIMIT 1")
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    if (!parent) {
      res.json({ wards: [] });
      return;
    }

    const wards = db
      .prepare(`
        SELECT s.id, s.admission_number, s.first_name, s.last_name, c.name AS class_name, a.name AS arm_name
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id AND s.school_id = sg.school_id
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE sg.school_id = ? AND sg.parent_id = ?
      `)
      .all(schoolId, parent.id) as Array<{
      id: string;
      admission_number: string;
      first_name: string;
      last_name: string;
      class_name: string | null;
      arm_name: string | null;
    }>;

    const result = wards.map((ward) => {
      const records = db
        .prepare(`
          SELECT ar.id, ar.attendance_date, ar.status, ar.remarks, ar.source, ats.session_label
          FROM attendance_records ar
          INNER JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id
          WHERE ar.school_id = ? AND ar.student_id = ?
          ORDER BY ar.attendance_date DESC
          LIMIT 60
        `)
        .all(schoolId, ward.id) as Array<{ status: AttendanceStatus }>;
      return {
        ward,
        stats: computeAttendanceStats(records.map((r) => r.status)),
        records,
      };
    });

    res.json({ wards: result });
  },
);
