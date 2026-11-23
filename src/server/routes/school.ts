import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import { getDb } from '../../db/client.ts';
import { getAiCoreBlueprint } from '../ai-core.ts';
import { recordAuditLog } from '../audit.ts';
import {
  deleteStoredFileById,
  resolveConfinedStoragePath,
  saveValidatedFile,
  type FileCategory,
  type StoredFileRecord,
} from '../file-storage.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireAuth,
  requireCsrfCheck,
  requireEnvironment,
  requirePermission,
} from '../middleware.ts';
import {
  createNotificationRecord,
  listScopedSchoolNotifications,
  markNotificationReadForUser,
  registerNotificationDeviceToken,
} from '../notifications/service.ts';
import {
  assertTenantScope,
  generateOpaqueToken,
  hashPassword,
  hasPermission,
  sha256Hex,
} from '../security.ts';
import { revokeAllSessionsForUser } from '../session-service.ts';
import { schoolAcademicsRouter } from './school/academics.ts';
import { ensureSchoolAcademicDefaults } from './school/academics/helpers.ts';
import { schoolAdmissionsRouter } from './school/admissions.ts';
import { schoolClassesRouter } from './school/classes.ts';
import { schoolParentsRouter } from './school/parents.ts';
import { schoolProfileRouter } from './school/profile.ts';
import { schoolStudentsRouter } from './school/students.ts';
import { schoolSubjectsRouter } from './school/subjects.ts';
import { schoolTeachersRouter } from './school/teachers.ts';
import { schoolAttendanceRouter } from './school/attendance.ts';
import { schoolFinanceRouter } from './school/finance.ts';
import { schoolCbtRouter } from './school/cbt.ts';
import { schoolCommunicationsRouter } from './school/communications.ts';
import { schoolTimetableRouter } from './school/timetable.ts';
import { schoolWebsiteRouter } from './school/website.ts';
import { schoolAiRouter } from './school/ai.ts';
import { schoolIdCardsRouter } from './school/id-cards.ts';
import {
  createAcademicSessionSchema,
  createSchoolMemberSchema,
  createSchoolNotificationSchema,
  registerDeviceTokenSchema,
  updateSchoolMemberStatusSchema,
  uploadFileSchema,
} from '../validation.ts';

export const schoolRouter = Router();

schoolRouter.use(requireAuth, requireEnvironment('school'));

function canRoleAccessSchoolFile(
  roleCode: string,
  userId: string,
  schoolId: string,
  file: StoredFileRecord,
): boolean {
  if (roleCode === 'school_admin') return true;
  if (file.category === 'school_logo') {
    return true;
  }
  if (file.category === 'school_document') {
    return roleCode === 'teacher';
  }
  if (file.category === 'teacher_profile_picture' || file.category === 'staff_document') {
    return (
      roleCode === 'teacher' &&
      (file.subject_user_id === userId || file.uploaded_by_user_id === userId)
    );
  }
  if (file.category === 'student_profile_picture' || file.category === 'student_document') {
    const db = getDb();
    if (roleCode === 'student') {
      if (file.subject_user_id === userId || file.uploaded_by_user_id === userId) return true;
      const ownStudentDoc = db
        .prepare(`
          SELECT 1
          FROM students s
          LEFT JOIN student_documents sd ON sd.student_id = s.id
          WHERE s.school_id = ? AND s.user_id = ? AND (s.photo_file_id = ? OR sd.file_id = ?)
          LIMIT 1
        `)
        .get(schoolId, userId, file.id, file.id);
      return Boolean(ownStudentDoc);
    }
    if (roleCode === 'parent') {
      const wardDoc = db
        .prepare(`
          SELECT 1
          FROM parents p
          INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
          INNER JOIN students s ON s.id = sg.student_id AND s.school_id = p.school_id
          LEFT JOIN student_documents sd ON sd.student_id = s.id AND sd.school_id = p.school_id
          WHERE p.school_id = ? AND p.user_id = ? AND p.status = 'active'
            AND sg.can_view_academic_records = 1
            AND (s.photo_file_id = ? OR sd.file_id = ?)
          LIMIT 1
        `)
        .get(schoolId, userId, file.id, file.id);
      return Boolean(wardDoc);
    }
    if (roleCode === 'teacher') {
      if (file.uploaded_by_user_id === userId) return true;
      const assignedStudentDoc = db
        .prepare(`
          SELECT 1
          FROM teachers t
          INNER JOIN students s ON s.school_id = t.school_id
          LEFT JOIN student_documents sd ON sd.student_id = s.id AND sd.school_id = t.school_id
          WHERE t.school_id = ? AND t.user_id = ? AND t.employment_status = 'active'
            AND (s.photo_file_id = ? OR sd.file_id = ?)
            AND (
              EXISTS (
                SELECT 1 FROM class_teacher_assignments cta
                WHERE cta.school_id = t.school_id AND cta.teacher_id = t.id AND cta.is_active = 1 AND cta.class_id = s.current_class_id
              )
              OR EXISTS (
                SELECT 1 FROM teacher_subject_assignments tsa
                WHERE tsa.school_id = t.school_id AND tsa.teacher_id = t.id AND tsa.is_active = 1 AND tsa.class_id = s.current_class_id
              )
            )
          LIMIT 1
        `)
        .get(schoolId, userId, file.id, file.id);
      return Boolean(assignedStudentDoc);
    }
  }
  return false;
}

schoolRouter.get(
  '/overview',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;

    const school = db
      .prepare(`
        SELECT
          s.id, s.name, s.slug, s.code, s.country, s.city, s.contact_email, s.phone, s.status, s.created_at,
          sp.school_type, sp.school_ownership, sp.registration_number, sp.motto, sp.logo_file_id
        FROM schools s
        LEFT JOIN school_profiles sp ON sp.school_id = s.id
        WHERE s.id = ?
      `)
      .get(schoolId);

    const memberBreakdown = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN r.code = 'school_admin' THEN 1 ELSE 0 END) AS admins,
          SUM(CASE WHEN r.code = 'teacher' THEN 1 ELSE 0 END) AS teachers,
          SUM(CASE WHEN r.code = 'student' THEN 1 ELSE 0 END) AS students,
          SUM(CASE WHEN r.code = 'parent' THEN 1 ELSE 0 END) AS parents
        FROM school_memberships sm
        INNER JOIN roles r ON r.id = sm.role_id
        WHERE sm.school_id = ?
      `)
      .get(schoolId) as {
      total: number;
      admins: number | null;
      teachers: number | null;
      students: number | null;
      parents: number | null;
    };

    const studentStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
        FROM students
        WHERE school_id = ?
      `)
      .get(schoolId) as { total: number; active: number | null };

    const teacherStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN employment_status = 'active' THEN 1 ELSE 0 END) AS active
        FROM teachers
        WHERE school_id = ?
      `)
      .get(schoolId) as { total: number; active: number | null };

    const parentCount = db
      .prepare('SELECT COUNT(*) AS count FROM parents WHERE school_id = ?')
      .get(schoolId) as { count: number };

    const classCount = db
      .prepare("SELECT COUNT(*) AS count FROM school_classes WHERE school_id = ? AND status = 'active'")
      .get(schoolId) as { count: number };

    const subjectCount = db
      .prepare("SELECT COUNT(*) AS count FROM subjects WHERE school_id = ? AND status = 'active'")
      .get(schoolId) as { count: number };

    const pendingAdmissions = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM admission_applications
        WHERE school_id = ? AND status IN ('pending_review', 'more_info_requested', 'approved')
      `)
      .get(schoolId) as { count: number };

    const currentSession = db
      .prepare(`
        SELECT id, name, term, start_date, end_date, is_current
        FROM academic_sessions
        WHERE school_id = ? AND is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    const sessionCount = db
      .prepare('SELECT COUNT(*) AS count FROM academic_sessions WHERE school_id = ?')
      .get(schoolId) as { count: number };

    const recentStudents = db
      .prepare(`
        SELECT
          s.id, s.admission_number, s.first_name, s.last_name, s.status, s.admission_date, s.created_at,
          c.name AS class_name, a.name AS arm_name
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.school_id = ?
        ORDER BY s.created_at DESC
        LIMIT 5
      `)
      .all(schoolId);

    const recentTeachers = db
      .prepare(`
        SELECT id, staff_id_number, first_name, last_name, specialization, employment_status, employment_date, created_at
        FROM teachers
        WHERE school_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `)
      .all(schoolId);

    const recentActivity = db
      .prepare(`
        SELECT id, actor_email, actor_role, action, resource_type, resource_id, outcome, created_at
        FROM audit_logs
        WHERE school_id = ?
        ORDER BY created_at DESC
        LIMIT 8
      `)
      .all(schoolId);

    ensureSchoolAcademicDefaults(schoolId);
    const activeTerm = db
      .prepare(`
        SELECT t.id, t.name, t.status, t.start_date, t.end_date, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ? AND t.is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    const pendingScoreBatches = (
      db
        .prepare("SELECT COUNT(*) AS count FROM score_submission_batches WHERE school_id = ? AND status IN ('submitted', 'under_review')")
        .get(schoolId) as { count: number }
    ).count;

    const publishedResultsCount = (
      db
        .prepare("SELECT COUNT(*) AS count FROM result_publications WHERE school_id = ? AND status IN ('published', 'amended')")
        .get(schoolId) as { count: number }
    ).count;

    const pendingPromotionsCount = (
      db
        .prepare("SELECT COUNT(*) AS count FROM promotion_recommendations WHERE school_id = ? AND approval_status = 'pending'")
        .get(schoolId) as { count: number }
    ).count;

    res.json({
      school,
      currentSession: currentSession ?? null,
      activeTerm: activeTerm ?? null,
      counts: {
        totalMembers: memberBreakdown.total ?? 0,
        admins: memberBreakdown.admins ?? 0,
        teachers: teacherStats.total ?? 0,
        activeTeachers: teacherStats.active ?? 0,
        students: studentStats.total ?? 0,
        activeStudents: studentStats.active ?? 0,
        parents: parentCount.count ?? 0,
        classes: classCount.count ?? 0,
        subjects: subjectCount.count ?? 0,
        pendingAdmissions: pendingAdmissions.count ?? 0,
        academicSessions: sessionCount.count ?? 0,
        pendingScoreBatches,
        publishedResultsCount,
        pendingPromotionsCount,
        memberTeachers: memberBreakdown.teachers ?? 0,
        memberStudents: memberBreakdown.students ?? 0,
        memberParents: memberBreakdown.parents ?? 0,
      },
      recentStudents,
      recentTeachers,
      recentActivity,
    });
  },
);

schoolRouter.get(
  '/sessions',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const sessions = db
      .prepare(`
        SELECT id, name, term, start_date, end_date, is_current, created_at
        FROM academic_sessions
        WHERE school_id = ?
        ORDER BY is_current DESC, start_date DESC
      `)
      .all(schoolId);

    res.json({ sessions });
  },
);

schoolRouter.post(
  '/sessions',
  requireCsrfCheck,
  requirePermission('school.sessions.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAcademicSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid academic session data.',
      });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { name, term, startDate, endDate, isCurrent } = parsed.data;
    const sessionId = `acs_${crypto.randomUUID()}`;

    const duplicate = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND name = ? AND term = ?')
      .get(schoolId, name, term);
    if (duplicate) {
      res.status(409).json({
        error: 'This academic session and term already exists for your school.',
      });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      if (isCurrent) {
        db.prepare('UPDATE academic_sessions SET is_current = 0 WHERE school_id = ?').run(schoolId);
      }

      db.prepare(`
        INSERT INTO academic_sessions (id, school_id, name, term, start_date, end_date, is_current)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, schoolId, name, term, startDate, endDate, isCurrent ? 1 : 0);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create academic session failed:', err);
      res.status(500).json({ error: 'Unable to create academic session.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.academic_session.created',
      resourceType: 'academic_session',
      resourceId: sessionId,
      outcome: 'success',
      metadata: { name, term, isCurrent },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      id: sessionId,
      name,
      term,
      start_date: startDate,
      end_date: endDate,
      is_current: isCurrent ? 1 : 0,
    });
  },
);

schoolRouter.patch(
  '/sessions/:sessionId/activate',
  requireCsrfCheck,
  requirePermission('school.sessions.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { sessionId } = req.params;

    const existing = db
      .prepare('SELECT id, school_id FROM academic_sessions WHERE id = ? AND school_id = ?')
      .get(sessionId, schoolId);
    if (!existing) {
      res.status(404).json({ error: 'Academic session not found for your school.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE academic_sessions SET is_current = 0 WHERE school_id = ?').run(schoolId);
      db.prepare('UPDATE academic_sessions SET is_current = 1 WHERE id = ? AND school_id = ?').run(
        sessionId,
        schoolId,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Activate session failed:', err);
      res.status(500).json({ error: 'Unable to activate session.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.academic_session.activated',
      resourceType: 'academic_session',
      resourceId: sessionId,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ id: sessionId, is_current: 1 });
  },
);

schoolRouter.get(
  '/members',
  requirePermission('school.members.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const members = db
      .prepare(`
        SELECT
          sm.id AS membership_id,
          sm.title,
          sm.status AS membership_status,
          sm.created_at,
          u.id AS user_id,
          u.full_name,
          u.email,
          r.code AS role_code,
          r.name AS role_name
        FROM school_memberships sm
        INNER JOIN users u ON u.id = sm.user_id
        INNER JOIN roles r ON r.id = sm.role_id
        WHERE sm.school_id = ?
        ORDER BY sm.created_at DESC
      `)
      .all(schoolId);

    res.json({ members });
  },
);

schoolRouter.post(
  '/members',
  requireCsrfCheck,
  requirePermission('school.members.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createSchoolMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid member payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const email = parsed.data.email.toLowerCase();

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const roleRow = db
      .prepare("SELECT id, name FROM roles WHERE code = ? AND scope = 'school'")
      .get(parsed.data.roleCode) as { id: string; name: string } | undefined;
    if (!roleRow) {
      res.status(400).json({ error: 'Invalid school role.' });
      return;
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const membershipId = `mem_${crypto.randomUUID()}`;
    const passwordHash = hashPassword(parsed.data.password);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
        VALUES (?, ?, ?, ?, 'school_member', 1)
      `).run(userId, email, parsed.data.fullName, passwordHash);

      db.prepare(`
        INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(membershipId, schoolId, userId, roleRow.id, parsed.data.title ?? '');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create school member failed:', err);
      res.status(500).json({ error: 'Unable to create school member account.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.member.created',
      resourceType: 'school_membership',
      resourceId: membershipId,
      outcome: 'success',
      metadata: { roleCode: parsed.data.roleCode, email },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      membership_id: membershipId,
      user_id: userId,
      full_name: parsed.data.fullName,
      email,
      role_code: parsed.data.roleCode,
      role_name: roleRow.name,
      title: parsed.data.title ?? '',
      membership_status: 'active',
    });
  },
);

schoolRouter.patch(
  '/members/:membershipId/status',
  requireCsrfCheck,
  requirePermission('school.members.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSchoolMemberStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid member status.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { membershipId } = req.params;

    const target = db
      .prepare(`
        SELECT sm.id, sm.user_id, sm.school_id, sm.status, u.email
        FROM school_memberships sm
        INNER JOIN users u ON u.id = sm.user_id
        WHERE sm.id = ? AND sm.school_id = ?
      `)
      .get(membershipId, schoolId) as
      | { id: string; user_id: string; school_id: string; status: string; email: string }
      | undefined;

    if (!target || !assertTenantScope(schoolId, target.school_id)) {
      res.status(404).json({ error: 'School member not found in your institution.' });
      return;
    }

    if (target.user_id === req.auth!.id && parsed.data.status === 'suspended') {
      res.status(400).json({ error: 'You cannot suspend your own administrator account.' });
      return;
    }

    let revokedSessions = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE school_memberships SET status = ? WHERE id = ? AND school_id = ?').run(
        parsed.data.status,
        membershipId,
        schoolId,
      );
      if (parsed.data.status === 'suspended') {
        revokedSessions = revokeAllSessionsForUser(target.user_id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update member status failed:', err);
      res.status(500).json({ error: 'Unable to update member status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.member.status_updated',
      resourceType: 'school_membership',
      resourceId: membershipId,
      outcome: 'success',
      metadata: { targetEmail: target.email, status: parsed.data.status, revokedSessions },
      ipAddress: getClientIp(req),
    });

    res.json({
      membership_id: membershipId,
      membership_status: parsed.data.status,
      revokedSessions,
    });
  },
);

schoolRouter.post(
  '/members/:membershipId/recovery-token',
  requireCsrfCheck,
  requirePermission('school.members.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { membershipId } = req.params;

    const target = db
      .prepare(`
        SELECT sm.id, sm.school_id, sm.status, u.id AS user_id, u.email, u.is_active
        FROM school_memberships sm
        INNER JOIN users u ON u.id = sm.user_id
        WHERE sm.id = ? AND sm.school_id = ?
      `)
      .get(membershipId, schoolId) as
      | {
          id: string;
          school_id: string;
          status: string;
          user_id: string;
          email: string;
          is_active: number;
        }
      | undefined;

    if (!target || !assertTenantScope(schoolId, target.school_id)) {
      res.status(404).json({ error: 'School member not found in your institution.' });
      return;
    }

    if (target.status !== 'active' || target.is_active !== 1) {
      res.status(400).json({ error: 'Activate this member account before issuing a recovery link.' });
      return;
    }

    const rawToken = generateOpaqueToken(32);
    const tokenHash = sha256Hex(rawToken);
    const tokenId = `prt_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
      ).run(target.user_id);

      db.prepare(`
        INSERT INTO password_reset_tokens (
          id, user_id, token_hash, auth_environment, requested_by_user_id, requested_ip, expires_at
        ) VALUES (?, ?, ?, 'school', ?, ?, ?)
      `).run(tokenId, target.user_id, tokenHash, req.auth!.id, getClientIp(req), expiresAt);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('School member recovery token error:', err);
      res.status(500).json({ error: 'Unable to issue recovery link.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.member.recovery_issued',
      resourceType: 'password_reset_token',
      resourceId: tokenId,
      outcome: 'success',
      metadata: { targetEmail: target.email },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      email: target.email,
      expiresAt,
      recoveryPath: `/reset-password?token=${encodeURIComponent(rawToken)}`,
      token: rawToken,
    });
  },
);

schoolRouter.get(
  '/audit-logs',
  requirePermission('school.audit.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const logs = db
      .prepare(`
        SELECT id, actor_email, actor_role, action, resource_type, resource_id, outcome, ip_address, created_at
        FROM audit_logs
        WHERE school_id = ?
        ORDER BY created_at DESC
        LIMIT 80
      `)
      .all(schoolId);

    res.json({ logs });
  },
);

// Tenant-isolated File Management
schoolRouter.get(
  '/files',
  requirePermission('school.files.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const rows = db
      .prepare(`
        SELECT
          f.*,
          u.full_name AS uploaded_by_name,
          su.full_name AS subject_user_name
        FROM stored_files f
        LEFT JOIN users u ON u.id = f.uploaded_by_user_id
        LEFT JOIN users su ON su.id = f.subject_user_id
        WHERE f.school_id = ?
        ORDER BY f.created_at DESC
        LIMIT 100
      `)
      .all(schoolId) as unknown as Array<
      StoredFileRecord & { uploaded_by_name: string | null; subject_user_name: string | null }
    >;

    const visibleFiles = rows.filter((file) =>
      canRoleAccessSchoolFile(req.auth!.roleCode, req.auth!.id, schoolId, file),
    );

    res.json({
      files: visibleFiles.map((f) => ({
        id: f.id,
        category: f.category,
        original_name: f.original_name,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
        subject_user_id: f.subject_user_id,
        subject_user_name: f.subject_user_name,
        uploaded_by_name: f.uploaded_by_name,
        created_at: f.created_at,
      })),
    });
  },
);

schoolRouter.post(
  '/files',
  requireCsrfCheck,
  requirePermission('school.files.read'),
  (req: AuthenticatedRequest, res) => {
    const parsed = uploadFileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid file upload.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const roleCode = req.auth!.roleCode;
    const category = parsed.data.category as FileCategory;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.files.manage');

    if (!isAdmin) {
      const allowedPersonalCategories: Record<string, FileCategory[]> = {
        teacher: ['teacher_profile_picture', 'staff_document'],
        student: ['student_profile_picture'],
        parent: [],
      };
      const allowed = allowedPersonalCategories[roleCode] ?? [];
      if (!allowed.includes(category)) {
        res.status(403).json({
          error: `Your role (${req.auth!.roleName}) cannot upload ${category} files.`,
        });
        return;
      }
    }

    const db = getDb();
    let subjectUserId: string | null = isAdmin ? (parsed.data.subjectUserId || null) : req.auth!.id;

    if (isAdmin && subjectUserId) {
      const memberInSchool = db
        .prepare('SELECT id FROM school_memberships WHERE user_id = ? AND school_id = ?')
        .get(subjectUserId, schoolId);
      if (!memberInSchool) {
        res.status(403).json({ error: 'Selected member does not belong to your school tenant.' });
        return;
      }
    }

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId,
        category,
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId,
        authEnvironment: 'school',
        action: 'school.file.uploaded',
        resourceType: 'stored_file',
        resourceId: file.id,
        outcome: 'success',
        metadata: { category: file.category, sizeBytes: file.size_bytes, mimeType: file.mime_type },
        ipAddress: getClientIp(req),
      });

      res.status(201).json({
        file: {
          id: file.id,
          category: file.category,
          original_name: file.original_name,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
          subject_user_id: file.subject_user_id,
          created_at: file.created_at,
        },
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to upload file.',
      });
    }
  },
);

schoolRouter.get(
  '/files/:fileId/download',
  requirePermission('school.files.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const row = db
      .prepare('SELECT * FROM stored_files WHERE id = ?')
      .get(req.params.fileId) as StoredFileRecord | undefined;

    if (!row || !assertTenantScope(schoolId, row.school_id)) {
      res.status(404).json({ error: 'File not found inside your school tenant.' });
      return;
    }

    if (!canRoleAccessSchoolFile(req.auth!.roleCode, req.auth!.id, schoolId, row)) {
      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId,
        authEnvironment: 'school',
        action: 'school.file.access_denied',
        resourceType: 'stored_file',
        resourceId: row.id,
        outcome: 'denied',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({ error: 'You do not have permission to access this private file.' });
      return;
    }

    try {
      const absPath = resolveConfinedStoragePath(row.storage_rel_path);
      if (!fs.existsSync(absPath)) {
        res.status(404).json({ error: 'Stored file missing on disk.' });
        return;
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', row.mime_type);
      const isSafeImage = ['image/png', 'image/jpeg', 'image/webp'].includes(row.mime_type);
      res.setHeader(
        'Content-Disposition',
        `${isSafeImage ? 'inline' : 'attachment'}; filename="${row.original_name.replace(/"/g, '')}"`,
      );
      res.sendFile(absPath);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to serve file.' });
    }
  },
);

schoolRouter.delete(
  '/files/:fileId',
  requireCsrfCheck,
  requirePermission('school.files.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const row = db
      .prepare('SELECT * FROM stored_files WHERE id = ?')
      .get(req.params.fileId) as StoredFileRecord | undefined;

    if (!row || !assertTenantScope(schoolId, row.school_id)) {
      res.status(404).json({ error: 'File not found in your school tenant.' });
      return;
    }

    const isAdmin = hasPermission(req.auth!.permissions, 'school.files.manage');
    if (!isAdmin && row.uploaded_by_user_id !== req.auth!.id) {
      res.status(403).json({ error: 'Only School Administrators or the file uploader can delete this file.' });
      return;
    }

    deleteStoredFileById(row.id);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.file.deleted',
      resourceType: 'stored_file',
      resourceId: row.id,
      outcome: 'success',
      metadata: { category: row.category, originalName: row.original_name },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);

// Scoped Notification Infrastructure
schoolRouter.get(
  '/notifications',
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const result = listScopedSchoolNotifications({
      schoolId: req.auth!.activeSchoolId!,
      userId: req.auth!.id,
      roleCode: req.auth!.roleCode,
    });
    res.json(result);
  },
);

schoolRouter.post(
  '/notifications',
  requireCsrfCheck,
  requirePermission('school.notifications.manage'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = createSchoolNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid notification payload.',
      });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();

    let targetUserId: string | null = null;
    if (parsed.data.scope === 'direct') {
      if (!parsed.data.targetUserId) {
        res.status(400).json({ error: 'Select a target school member for direct notifications.' });
        return;
      }
      const member = db
        .prepare('SELECT user_id FROM school_memberships WHERE user_id = ? AND school_id = ?')
        .get(parsed.data.targetUserId, schoolId) as { user_id: string } | undefined;
      if (!member) {
        res.status(403).json({ error: 'Target recipient does not belong to your school tenant.' });
        return;
      }
      targetUserId = member.user_id;
    }

    const notification = await createNotificationRecord({
      schoolId,
      scope: parsed.data.scope,
      targetRoleCode:
        parsed.data.scope === 'teacher' ||
        parsed.data.scope === 'student' ||
        parsed.data.scope === 'parent'
          ? parsed.data.scope
          : null,
      targetUserId,
      createdByUserId: req.auth!.id,
      createdByName: req.auth!.fullName,
      title: parsed.data.title,
      body: parsed.data.body,
      severity: parsed.data.severity,
    });

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.notification.published',
      resourceType: 'notification',
      resourceId: notification.id,
      outcome: 'success',
      metadata: { scope: parsed.data.scope, severity: parsed.data.severity },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ notification });
  },
);

schoolRouter.patch(
  '/notifications/:notificationId/read',
  requireCsrfCheck,
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const ok = markNotificationReadForUser({
      notificationId: req.params.notificationId,
      userId: req.auth!.id,
      schoolId: req.auth!.activeSchoolId!,
      roleCode: req.auth!.roleCode,
    });
    if (!ok) {
      res.status(404).json({ error: 'Notification not found in your accessible scope.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolRouter.post(
  '/notifications/device-token',
  requireCsrfCheck,
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const parsed = registerDeviceTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid device token.' });
      return;
    }

    const record = registerNotificationDeviceToken({
      userId: req.auth!.id,
      schoolId: req.auth!.activeSchoolId!,
      platform: parsed.data.platform,
      deviceToken: parsed.data.deviceToken,
    });
    res.status(201).json(record);
  },
);

schoolRouter.get(
  '/teacher-workspace',
  requirePermission('teacher.workspace.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const profile = db
      .prepare(`
        SELECT sm.title, sm.status, sch.name AS school_name, sch.code AS school_code
        FROM school_memberships sm
        INNER JOIN schools sch ON sch.id = sm.school_id
        WHERE sm.user_id = ? AND sm.school_id = ?
      `)
      .get(req.auth!.id, schoolId);

    const sessions = db
      .prepare(`
        SELECT id, name, term, start_date, end_date, is_current
        FROM academic_sessions
        WHERE school_id = ?
        ORDER BY is_current DESC, start_date DESC
      `)
      .all(schoolId);

    const teacherRecord = db
      .prepare('SELECT * FROM teachers WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    const assignedClasses = teacherRecord
      ? db
          .prepare(`
            SELECT cta.id AS assignment_id, cta.role_label, c.id AS class_id, c.name AS class_name, a.id AS arm_id, a.name AS arm_name
            FROM class_teacher_assignments cta
            INNER JOIN school_classes c ON c.id = cta.class_id
            LEFT JOIN class_arms a ON a.id = cta.arm_id
            WHERE cta.school_id = ? AND cta.teacher_id = ? AND cta.is_active = 1
          `)
          .all(schoolId, teacherRecord.id)
      : [];

    const assignedSubjects = teacherRecord
      ? db
          .prepare(`
            SELECT tsa.id AS assignment_id, sub.id AS subject_id, sub.name AS subject_name, sub.code AS subject_code, c.id AS class_id, c.name AS class_name, a.name AS arm_name
            FROM teacher_subject_assignments tsa
            INNER JOIN subjects sub ON sub.id = tsa.subject_id
            LEFT JOIN school_classes c ON c.id = tsa.class_id
            LEFT JOIN class_arms a ON a.id = tsa.arm_id
            WHERE tsa.school_id = ? AND tsa.teacher_id = ? AND tsa.is_active = 1
          `)
          .all(schoolId, teacherRecord.id)
      : [];

    const permittedStudents = teacherRecord
      ? db
          .prepare(`
            SELECT DISTINCT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.status, c.name AS class_name, a.name AS arm_name
            FROM students s
            LEFT JOIN school_classes c ON c.id = s.current_class_id
            LEFT JOIN class_arms a ON a.id = s.current_arm_id
            WHERE s.school_id = ? AND s.status = 'active'
              AND (
                EXISTS (
                  SELECT 1 FROM class_teacher_assignments cta
                  WHERE cta.school_id = s.school_id AND cta.teacher_id = ? AND cta.is_active = 1 AND cta.class_id = s.current_class_id
                )
                OR EXISTS (
                  SELECT 1 FROM teacher_subject_assignments tsa
                  WHERE tsa.school_id = s.school_id AND tsa.teacher_id = ? AND tsa.is_active = 1 AND tsa.class_id = s.current_class_id
                )
              )
            ORDER BY c.name ASC, s.last_name ASC
            LIMIT 100
          `)
          .all(schoolId, teacherRecord.id, teacherRecord.id)
      : [];

    const activeTerm = db
      .prepare(`
        SELECT t.id, t.name, t.status, t.start_date, t.end_date, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ? AND t.is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    const scoreBatches = db
      .prepare(`
        SELECT sb.id, sb.status, sb.updated_at, cls.name AS class_name, sub.name AS subject_name, trm.name AS term_name
        FROM score_submission_batches sb
        INNER JOIN school_classes cls ON cls.id = sb.class_id
        INNER JOIN subjects sub ON sub.id = sb.subject_id
        INNER JOIN academic_terms trm ON trm.id = sb.academic_term_id
        WHERE sb.school_id = ? AND sb.submitted_by_user_id = ?
        ORDER BY sb.updated_at DESC LIMIT 6
      `)
      .all(schoolId, req.auth!.id);

    res.json({
      profile,
      sessions,
      activeTerm: activeTerm ?? null,
      teacherRecord: teacherRecord ?? null,
      assignedClasses,
      assignedSubjects,
      permittedStudents,
      scoreBatches,
      aiCore: getAiCoreBlueprint(),
    });
  },
);

schoolRouter.get(
  '/student-workspace',
  requirePermission('student.workspace.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const profile = db
      .prepare(`
        SELECT sm.title, sm.status, sch.name AS school_name, sch.code AS school_code
        FROM school_memberships sm
        INNER JOIN schools sch ON sch.id = sm.school_id
        WHERE sm.user_id = ? AND sm.school_id = ?
      `)
      .get(req.auth!.id, schoolId);

    const activeSession = db
      .prepare(`
        SELECT id, name, term, start_date, end_date
        FROM academic_sessions
        WHERE school_id = ? AND is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    const studentRecord = db
      .prepare(`
        SELECT s.*, c.name AS class_name, c.section AS class_section, a.name AS arm_name
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.school_id = ? AND s.user_id = ?
        LIMIT 1
      `)
      .get(schoolId, req.auth!.id) as { id: string; current_class_id: string | null } | undefined;

    const classSubjects = studentRecord?.current_class_id
      ? db
          .prepare(`
            SELECT sub.name, sub.code, sub.category, cs.is_compulsory, cs.weekly_periods
            FROM class_subjects cs
            INNER JOIN subjects sub ON sub.id = cs.subject_id
            WHERE cs.school_id = ? AND cs.class_id = ? AND sub.status = 'active'
            ORDER BY cs.is_compulsory DESC, sub.name ASC
          `)
          .all(schoolId, studentRecord.current_class_id)
      : [];

    const promotionHistory = studentRecord
      ? db
          .prepare(`
            SELECT h.id, h.action_type, h.effective_date, h.notes, fc.name AS from_class_name, tc.name AS to_class_name, ta.name AS to_arm_name
            FROM student_class_history h
            LEFT JOIN school_classes fc ON fc.id = h.from_class_id
            INNER JOIN school_classes tc ON tc.id = h.to_class_id
            LEFT JOIN class_arms ta ON ta.id = h.to_arm_id
            WHERE h.school_id = ? AND h.student_id = ?
            ORDER BY h.created_at DESC, h.rowid DESC
          `)
          .all(schoolId, studentRecord.id)
      : [];

    const publishedTermResults = studentRecord
      ? db
          .prepare(`
            SELECT rp.id, rp.academic_term_id, trm.name AS term_name, ses.name AS session_name,
                   rp.average_score, rp.overall_grade, rp.class_position, rp.class_size, rp.status, rp.published_at
            FROM result_publications rp
            INNER JOIN academic_terms trm ON trm.id = rp.academic_term_id
            INNER JOIN academic_sessions ses ON ses.id = rp.academic_session_id
            WHERE rp.school_id = ? AND rp.student_id = ? AND rp.status IN ('published', 'amended')
            ORDER BY ses.start_date DESC, trm.term_order DESC LIMIT 4
          `)
          .all(schoolId, studentRecord.id)
      : [];

    const activeTerm = db
      .prepare(`
        SELECT t.id, t.name, t.status, t.start_date, t.end_date, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ? AND t.is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    res.json({
      profile,
      activeSession: activeSession ?? null,
      activeTerm: activeTerm ?? null,
      studentRecord: studentRecord ?? null,
      classSubjects,
      promotionHistory,
      publishedTermResults,
    });
  },
);

schoolRouter.get(
  '/parent-workspace',
  requirePermission('parent.workspace.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const profile = db
      .prepare(`
        SELECT sm.title, sm.status, sch.name AS school_name, sch.code AS school_code, sch.contact_email
        FROM school_memberships sm
        INNER JOIN schools sch ON sch.id = sm.school_id
        WHERE sm.user_id = ? AND sm.school_id = ?
      `)
      .get(req.auth!.id, schoolId);

    const activeSession = db
      .prepare(`
        SELECT id, name, term, start_date, end_date
        FROM academic_sessions
        WHERE school_id = ? AND is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    const activeTerm = db
      .prepare(`
        SELECT t.id, t.name, t.status, t.start_date, t.end_date, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ? AND t.is_current = 1
        LIMIT 1
      `)
      .get(schoolId);

    const parentRecord = db
      .prepare('SELECT * FROM parents WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    const wards = parentRecord
      ? db
          .prepare(`
            SELECT
              sg.id AS guardian_id,
              sg.relationship,
              sg.is_primary_guardian,
              sg.can_pickup,
              sg.can_view_academic_records,
              s.id AS student_id,
              s.admission_number,
              s.first_name,
              s.middle_name,
              s.last_name,
              s.gender,
              s.status,
              s.photo_file_id,
              c.name AS class_name,
              a.name AS arm_name
            FROM student_guardians sg
            INNER JOIN students s ON s.id = sg.student_id
            LEFT JOIN school_classes c ON c.id = s.current_class_id
            LEFT JOIN class_arms a ON a.id = s.current_arm_id
            WHERE sg.school_id = ? AND sg.parent_id = ?
            ORDER BY s.last_name ASC, s.first_name ASC
          `)
          .all(schoolId, parentRecord.id)
      : [];

    const wardPublications = parentRecord
      ? db
          .prepare(`
            SELECT rp.student_id, rp.academic_term_id, trm.name AS term_name, rp.average_score, rp.overall_grade, rp.class_position, rp.class_size, rp.status
            FROM result_publications rp
            INNER JOIN academic_terms trm ON trm.id = rp.academic_term_id
            INNER JOIN student_guardians sg ON sg.student_id = rp.student_id AND sg.school_id = rp.school_id
            WHERE rp.school_id = ? AND sg.parent_id = ? AND sg.can_view_academic_records = 1 AND rp.status IN ('published', 'amended')
            ORDER BY rp.published_at DESC LIMIT 8
          `)
          .all(schoolId, parentRecord.id)
      : [];

    res.json({
      profile,
      activeSession: activeSession ?? null,
      activeTerm: activeTerm ?? null,
      parentRecord: parentRecord ?? null,
      wards,
      wardPublications,
    });
  },
);

// Phase 2 — School Administration Core Modular Routers
schoolRouter.use(schoolProfileRouter);
schoolRouter.use(schoolClassesRouter);
schoolRouter.use(schoolSubjectsRouter);
schoolRouter.use(schoolStudentsRouter);
schoolRouter.use(schoolTeachersRouter);
schoolRouter.use(schoolParentsRouter);
schoolRouter.use(schoolAdmissionsRouter);

// Phase 3 — Academic Management & Results Engine Router
schoolRouter.use(schoolAcademicsRouter);

// Phase 4–10 — Complete Version 1 Production Routers
schoolRouter.use(schoolAttendanceRouter);
schoolRouter.use(schoolFinanceRouter);
schoolRouter.use(schoolCbtRouter);
schoolRouter.use(schoolCommunicationsRouter);
schoolRouter.use(schoolTimetableRouter);
schoolRouter.use(schoolWebsiteRouter);
schoolRouter.use(schoolAiRouter);
schoolRouter.use(schoolIdCardsRouter);

schoolRouter.get('/ai-core', requirePermission('ai.core.view'), (_req, res) => {
  res.json(getAiCoreBlueprint());
});
