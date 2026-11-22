import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import {
  assignClassSubjectSchema,
  assignTeacherSubjectSchema,
  createSubjectSchema,
  updateSubjectSchema,
} from '../../validation.ts';

export const schoolSubjectsRouter = Router();

schoolSubjectsRouter.get(
  '/subjects',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const includeArchived = req.query.includeArchived === 'true';

    const subjects = db
      .prepare(`
        SELECT
          sub.*,
          (SELECT COUNT(*) FROM class_subjects cs WHERE cs.subject_id = sub.id AND cs.school_id = sub.school_id) AS assigned_classes_count,
          (SELECT COUNT(*) FROM teacher_subject_assignments tsa WHERE tsa.subject_id = sub.id AND tsa.school_id = sub.school_id AND tsa.is_active = 1) AS assigned_teachers_count
        FROM subjects sub
        WHERE sub.school_id = ?
        ${includeArchived ? '' : "AND sub.status = 'active'"}
        ORDER BY sub.name ASC
      `)
      .all(schoolId);

    const allAssignments = db
      .prepare(`
        SELECT
          tsa.id AS assignment_id,
          tsa.subject_id,
          tsa.teacher_id,
          tsa.class_id,
          tsa.arm_id,
          tsa.is_active,
          tsa.assigned_at,
          tsa.ended_at,
          sub.name AS subject_name,
          sub.code AS subject_code,
          t.first_name,
          t.last_name,
          t.staff_id_number,
          c.name AS class_name,
          a.name AS arm_name
        FROM teacher_subject_assignments tsa
        INNER JOIN subjects sub ON sub.id = tsa.subject_id
        INNER JOIN teachers t ON t.id = tsa.teacher_id
        LEFT JOIN school_classes c ON c.id = tsa.class_id
        LEFT JOIN class_arms a ON a.id = tsa.arm_id
        WHERE tsa.school_id = ?
        ORDER BY tsa.is_active DESC, tsa.assigned_at DESC
      `)
      .all(schoolId);

    res.json({ subjects, teacherAssignments: allAssignments });
  },
);

schoolSubjectsRouter.post(
  '/subjects',
  requireCsrfCheck,
  requirePermission('school.subjects.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid subject data.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    const upperCode = d.code.toUpperCase();

    const dup = db
      .prepare(
        'SELECT id FROM subjects WHERE school_id = ? AND (LOWER(name) = LOWER(?) OR UPPER(code) = UPPER(?))',
      )
      .get(schoolId, d.name, upperCode);
    if (dup) {
      res.status(409).json({ error: 'A subject with this name or code already exists in your school.' });
      return;
    }

    const subjectId = `sub_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO subjects (id, school_id, name, code, category, description, is_compulsory_default, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      subjectId,
      schoolId,
      d.name,
      upperCode,
      d.category,
      d.description,
      d.isCompulsoryDefault ? 1 : 0,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.subject.created',
      resourceType: 'subject',
      resourceId: subjectId,
      outcome: 'success',
      metadata: { name: d.name, code: upperCode, category: d.category },
      ipAddress: getClientIp(req),
    });

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
    res.status(201).json({ subject });
  },
);

schoolSubjectsRouter.get(
  '/subjects/:subjectId',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { subjectId } = req.params;

    const subject = db
      .prepare('SELECT * FROM subjects WHERE id = ? AND school_id = ?')
      .get(subjectId, schoolId);
    if (!subject) {
      res.status(404).json({ error: 'Subject not found in your school.' });
      return;
    }

    const classLinks = db
      .prepare(`
        SELECT
          cs.id AS class_subject_id,
          cs.is_compulsory,
          cs.weekly_periods,
          cs.created_at,
          c.id AS class_id,
          c.name AS class_name,
          c.section,
          c.status AS class_status
        FROM class_subjects cs
        INNER JOIN school_classes c ON c.id = cs.class_id
        WHERE cs.school_id = ? AND cs.subject_id = ?
        ORDER BY c.level_order ASC, c.name ASC
      `)
      .all(schoolId, subjectId);

    const teacherAssignments = db
      .prepare(`
        SELECT
          tsa.id AS assignment_id,
          tsa.teacher_id,
          tsa.class_id,
          tsa.arm_id,
          tsa.is_active,
          tsa.assigned_at,
          tsa.ended_at,
          t.staff_id_number,
          t.first_name,
          t.last_name,
          t.email,
          t.employment_status,
          c.name AS class_name,
          a.name AS arm_name
        FROM teacher_subject_assignments tsa
        INNER JOIN teachers t ON t.id = tsa.teacher_id
        LEFT JOIN school_classes c ON c.id = tsa.class_id
        LEFT JOIN class_arms a ON a.id = tsa.arm_id
        WHERE tsa.school_id = ? AND tsa.subject_id = ?
        ORDER BY tsa.is_active DESC, tsa.assigned_at DESC
      `)
      .all(schoolId, subjectId);

    res.json({ subject, classLinks, teacherAssignments });
  },
);

schoolSubjectsRouter.patch(
  '/subjects/:subjectId',
  requireCsrfCheck,
  requirePermission('school.subjects.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid subject update.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { subjectId } = req.params;
    const d = parsed.data;
    const upperCode = d.code.toUpperCase();

    const existing = db
      .prepare('SELECT id, status FROM subjects WHERE id = ? AND school_id = ?')
      .get(subjectId, schoolId) as { id: string; status: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Subject not found in your school.' });
      return;
    }

    const dup = db
      .prepare(
        'SELECT id FROM subjects WHERE school_id = ? AND (LOWER(name) = LOWER(?) OR UPPER(code) = UPPER(?)) AND id != ?',
      )
      .get(schoolId, d.name, upperCode, subjectId);
    if (dup) {
      res.status(409).json({ error: 'Another subject already uses this name or code.' });
      return;
    }

    const nextStatus = d.status ?? existing.status;
    db.prepare(`
      UPDATE subjects
      SET name = ?, code = ?, category = ?, description = ?, is_compulsory_default = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      d.name,
      upperCode,
      d.category,
      d.description,
      d.isCompulsoryDefault ? 1 : 0,
      nextStatus,
      subjectId,
      schoolId,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: nextStatus === 'archived' && existing.status !== 'archived' ? 'school.subject.archived' : 'school.subject.updated',
      resourceType: 'subject',
      resourceId: subjectId,
      outcome: 'success',
      metadata: { name: d.name, code: upperCode, status: nextStatus },
      ipAddress: getClientIp(req),
    });

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
    res.json({ subject });
  },
);

schoolSubjectsRouter.post(
  '/subjects/:subjectId/classes',
  requireCsrfCheck,
  requirePermission('school.subjects.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = assignClassSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid class-subject mapping.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { subjectId } = req.params;
    const d = parsed.data;

    const subject = db
      .prepare('SELECT id, name, status FROM subjects WHERE id = ? AND school_id = ?')
      .get(subjectId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!subject || subject.status === 'archived') {
      res.status(400).json({ error: 'Select an active subject in your school.' });
      return;
    }

    const cls = db
      .prepare('SELECT id, name, status FROM school_classes WHERE id = ? AND school_id = ?')
      .get(d.classId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!cls || cls.status === 'archived') {
      res.status(400).json({ error: 'Select an active class in your school.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM class_subjects WHERE school_id = ? AND class_id = ? AND subject_id = ?')
      .get(schoolId, d.classId, subjectId) as { id: string } | undefined;

    if (existing) {
      db.prepare('UPDATE class_subjects SET is_compulsory = ?, weekly_periods = ? WHERE id = ?').run(
        d.isCompulsory ? 1 : 0,
        d.weeklyPeriods,
        existing.id,
      );
      res.json({ id: existing.id, updated: true });
      return;
    }

    const id = `cs_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO class_subjects (id, school_id, class_id, subject_id, is_compulsory, weekly_periods)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, schoolId, d.classId, subjectId, d.isCompulsory ? 1 : 0, d.weeklyPeriods);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.class_subject.assigned',
      resourceType: 'class_subject',
      resourceId: id,
      outcome: 'success',
      metadata: {
        subjectName: subject.name,
        className: cls.name,
        isCompulsory: d.isCompulsory,
        weeklyPeriods: d.weeklyPeriods,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ id });
  },
);

schoolSubjectsRouter.delete(
  '/subjects/:subjectId/classes/:classSubjectId',
  requireCsrfCheck,
  requirePermission('school.subjects.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { subjectId, classSubjectId } = req.params;

    const result = db
      .prepare('DELETE FROM class_subjects WHERE id = ? AND subject_id = ? AND school_id = ?')
      .run(classSubjectId, subjectId, schoolId);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Class subject link not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolSubjectsRouter.post(
  '/subjects/:subjectId/teachers',
  requireCsrfCheck,
  requirePermission('school.subjects.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = assignTeacherSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid teacher assignment.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { subjectId } = req.params;
    const d = parsed.data;

    const subject = db
      .prepare('SELECT id, name, status FROM subjects WHERE id = ? AND school_id = ?')
      .get(subjectId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!subject || subject.status === 'archived') {
      res.status(400).json({ error: 'Select an active subject in your school.' });
      return;
    }

    const teacher = db
      .prepare('SELECT id, first_name, last_name, employment_status FROM teachers WHERE id = ? AND school_id = ?')
      .get(d.teacherId, schoolId) as
      | { id: string; first_name: string; last_name: string; employment_status: string }
      | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }
    if (teacher.employment_status !== 'active') {
      res.status(400).json({ error: 'Only active teachers can be assigned subjects.' });
      return;
    }

    let classId: string | null = d.classId || null;
    let armId: string | null = d.armId || null;
    if (classId) {
      const cls = db
        .prepare('SELECT id, status FROM school_classes WHERE id = ? AND school_id = ?')
        .get(classId, schoolId) as { id: string; status: string } | undefined;
      if (!cls || cls.status === 'archived') {
        res.status(400).json({ error: 'Selected class is not active in your school.' });
        return;
      }
      if (armId) {
        const arm = db
          .prepare('SELECT id, class_id, status FROM class_arms WHERE id = ? AND school_id = ?')
          .get(armId, schoolId) as { id: string; class_id: string; status: string } | undefined;
        if (!arm || arm.class_id !== classId || arm.status === 'archived') {
          res.status(400).json({ error: 'Selected arm is not active for this class.' });
          return;
        }
      }
    } else {
      armId = null;
    }

    const dup = db
      .prepare(`
        SELECT id FROM teacher_subject_assignments
        WHERE school_id = ? AND teacher_id = ? AND subject_id = ? AND IFNULL(class_id, '') = IFNULL(?, '') AND IFNULL(arm_id, '') = IFNULL(?, '') AND is_active = 1
      `)
      .get(schoolId, teacher.id, subjectId, classId, armId);
    if (dup) {
      res.status(409).json({ error: 'This teacher is already assigned to this subject and scope.' });
      return;
    }

    const currentSession = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(schoolId) as { id: string } | undefined;

    const assignmentId = `tsa_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO teacher_subject_assignments (
        id, school_id, teacher_id, subject_id, class_id, arm_id, academic_session_id, is_active, assigned_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      assignmentId,
      schoolId,
      teacher.id,
      subjectId,
      classId,
      armId,
      currentSession?.id ?? null,
      req.auth!.id,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher_subject.assigned',
      resourceType: 'teacher_subject_assignment',
      resourceId: assignmentId,
      outcome: 'success',
      metadata: {
        subjectId,
        subjectName: subject.name,
        teacherId: teacher.id,
        teacherName: `${teacher.first_name} ${teacher.last_name}`,
        classId,
        armId,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ assignmentId });
  },
);

schoolSubjectsRouter.delete(
  '/subjects/:subjectId/teachers/:assignmentId',
  requireCsrfCheck,
  requirePermission('school.subjects.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { subjectId, assignmentId } = req.params;

    const existing = db
      .prepare('SELECT id, teacher_id FROM teacher_subject_assignments WHERE id = ? AND subject_id = ? AND school_id = ? AND is_active = 1')
      .get(assignmentId, subjectId, schoolId) as { id: string; teacher_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Active subject assignment not found.' });
      return;
    }

    db.prepare(
      "UPDATE teacher_subject_assignments SET is_active = 0, ended_at = datetime('now') WHERE id = ? AND school_id = ?",
    ).run(assignmentId, schoolId);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher_subject.ended',
      resourceType: 'teacher_subject_assignment',
      resourceId: assignmentId,
      outcome: 'success',
      metadata: { subjectId, teacherId: existing.teacher_id },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);
