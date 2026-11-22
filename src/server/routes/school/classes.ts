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
  assignClassTeacherSchema,
  createClassArmSchema,
  createClassSchema,
  updateClassArmSchema,
  updateClassSchema,
} from '../../validation.ts';

export const schoolClassesRouter = Router();

schoolClassesRouter.get(
  '/classes',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const includeArchived = req.query.includeArchived === 'true';

    const classes = db
      .prepare(`
        SELECT
          c.*,
          (SELECT COUNT(*) FROM class_arms a WHERE a.class_id = c.id AND a.school_id = c.school_id AND a.status = 'active') AS active_arms_count,
          (SELECT COUNT(*) FROM students s WHERE s.current_class_id = c.id AND s.school_id = c.school_id AND s.status = 'active') AS active_students_count,
          (SELECT COUNT(*) FROM class_teacher_assignments cta WHERE cta.class_id = c.id AND cta.school_id = c.school_id AND cta.is_active = 1) AS active_teachers_count,
          (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id AND cs.school_id = c.school_id) AS subjects_count
        FROM school_classes c
        WHERE c.school_id = ?
        ${includeArchived ? '' : "AND c.status = 'active'"}
        ORDER BY c.level_order ASC, c.name ASC
      `)
      .all(schoolId);

    const arms = db
      .prepare(`
        SELECT
          a.*,
          (SELECT COUNT(*) FROM students s WHERE s.current_arm_id = a.id AND s.school_id = a.school_id AND s.status = 'active') AS active_students_count
        FROM class_arms a
        WHERE a.school_id = ?
        ${includeArchived ? '' : "AND a.status = 'active'"}
        ORDER BY a.name ASC
      `)
      .all(schoolId) as Array<Record<string, unknown> & { class_id: string }>;

    const armsByClass = new Map<string, Array<Record<string, unknown>>>();
    for (const arm of arms) {
      const list = armsByClass.get(arm.class_id) ?? [];
      list.push(arm);
      armsByClass.set(arm.class_id, list);
    }

    const enriched = (classes as Array<Record<string, unknown> & { id: string }>).map((c) => ({
      ...c,
      arms: armsByClass.get(c.id) ?? [],
    }));

    res.json({ classes: enriched });
  },
);

schoolClassesRouter.post(
  '/classes',
  requireCsrfCheck,
  requirePermission('school.classes.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createClassSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid class payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;

    const dup = db
      .prepare('SELECT id FROM school_classes WHERE school_id = ? AND LOWER(name) = LOWER(?)')
      .get(schoolId, d.name);
    if (dup) {
      res.status(409).json({ error: `Class "${d.name}" already exists in your school.` });
      return;
    }

    // Check unique arm names in initialArms
    const seenArms = new Set<string>();
    for (const arm of d.initialArms) {
      const key = arm.name.trim().toLowerCase();
      if (seenArms.has(key)) {
        res.status(400).json({ error: `Duplicate initial arm name "${arm.name}".` });
        return;
      }
      seenArms.add(key);
    }

    const classId = `cls_${crypto.randomUUID()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO school_classes (id, school_id, name, code, level_order, section, description, capacity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(classId, schoolId, d.name, d.code, d.levelOrder, d.section, d.description, d.capacity);

      const insertArm = db.prepare(`
        INSERT INTO class_arms (id, school_id, class_id, name, capacity, room, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `);
      for (const arm of d.initialArms) {
        insertArm.run(
          `arm_${crypto.randomUUID()}`,
          schoolId,
          classId,
          arm.name.trim(),
          arm.capacity,
          arm.room,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create class failed:', err);
      res.status(500).json({ error: 'Unable to create class.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.class.created',
      resourceType: 'school_class',
      resourceId: classId,
      outcome: 'success',
      metadata: { name: d.name, section: d.section, armsCreated: d.initialArms.length },
      ipAddress: getClientIp(req),
    });

    const created = db
      .prepare('SELECT * FROM school_classes WHERE id = ?')
      .get(classId);
    const createdArms = db
      .prepare('SELECT * FROM class_arms WHERE class_id = ? ORDER BY name ASC')
      .all(classId);

    res.status(201).json({ class: { ...(created as Record<string, unknown>), arms: createdArms } });
  },
);

schoolClassesRouter.get(
  '/classes/:classId',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId } = req.params;

    const classRow = db
      .prepare('SELECT * FROM school_classes WHERE id = ? AND school_id = ?')
      .get(classId, schoolId);
    if (!classRow) {
      res.status(404).json({ error: 'Class not found in your school.' });
      return;
    }

    const arms = db
      .prepare(`
        SELECT
          a.*,
          (SELECT COUNT(*) FROM students s WHERE s.current_arm_id = a.id AND s.school_id = a.school_id AND s.status = 'active') AS active_students_count
        FROM class_arms a
        WHERE a.class_id = ? AND a.school_id = ?
        ORDER BY a.name ASC
      `)
      .all(classId, schoolId);

    const students = db
      .prepare(`
        SELECT
          s.id, s.admission_number, s.first_name, s.middle_name, s.last_name,
          s.gender, s.status, s.admission_date, s.current_arm_id,
          a.name AS arm_name
        FROM students s
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.school_id = ? AND s.current_class_id = ?
        ORDER BY s.last_name ASC, s.first_name ASC
      `)
      .all(schoolId, classId);

    const teachers = db
      .prepare(`
        SELECT
          cta.id AS assignment_id,
          cta.role_label,
          cta.arm_id,
          cta.assigned_at,
          cta.is_active,
          cta.ended_at,
          a.name AS arm_name,
          t.id AS teacher_id,
          t.staff_id_number,
          t.first_name,
          t.last_name,
          t.email,
          t.specialization,
          t.employment_status
        FROM class_teacher_assignments cta
        INNER JOIN teachers t ON t.id = cta.teacher_id
        LEFT JOIN class_arms a ON a.id = cta.arm_id
        WHERE cta.school_id = ? AND cta.class_id = ?
        ORDER BY cta.is_active DESC, cta.assigned_at DESC
      `)
      .all(schoolId, classId);

    const subjects = db
      .prepare(`
        SELECT
          cs.id AS class_subject_id,
          cs.is_compulsory,
          cs.weekly_periods,
          sub.id AS subject_id,
          sub.name AS subject_name,
          sub.code AS subject_code,
          sub.category,
          sub.status AS subject_status
        FROM class_subjects cs
        INNER JOIN subjects sub ON sub.id = cs.subject_id
        WHERE cs.school_id = ? AND cs.class_id = ?
        ORDER BY sub.name ASC
      `)
      .all(schoolId, classId);

    res.json({
      class: classRow,
      arms,
      students,
      teachers,
      subjects,
    });
  },
);

schoolClassesRouter.patch(
  '/classes/:classId',
  requireCsrfCheck,
  requirePermission('school.classes.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateClassSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid class update.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId } = req.params;

    const existing = db
      .prepare('SELECT id, name, status FROM school_classes WHERE id = ? AND school_id = ?')
      .get(classId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Class not found in your school.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM school_classes WHERE school_id = ? AND LOWER(name) = LOWER(?) AND id != ?')
      .get(schoolId, parsed.data.name, classId);
    if (dup) {
      res.status(409).json({ error: `Another class named "${parsed.data.name}" already exists.` });
      return;
    }

    const d = parsed.data;
    const nextStatus = d.status ?? existing.status;

    if (nextStatus === 'archived') {
      const activeStudentCount = db
        .prepare("SELECT COUNT(*) AS count FROM students WHERE school_id = ? AND current_class_id = ? AND status = 'active'")
        .get(schoolId, classId) as { count: number };
      if (activeStudentCount.count > 0) {
        res.status(400).json({
          error: `Transfer or graduate all ${activeStudentCount.count} active student(s) before archiving ${existing.name}.`,
        });
        return;
      }
    }

    db.prepare(`
      UPDATE school_classes
      SET name = ?, code = ?, level_order = ?, section = ?, description = ?, capacity = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(d.name, d.code, d.levelOrder, d.section, d.description, d.capacity, nextStatus, classId, schoolId);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: nextStatus === 'archived' && existing.status !== 'archived' ? 'school.class.archived' : 'school.class.updated',
      resourceType: 'school_class',
      resourceId: classId,
      outcome: 'success',
      metadata: { name: d.name, status: nextStatus, capacity: d.capacity },
      ipAddress: getClientIp(req),
    });

    const updated = db.prepare('SELECT * FROM school_classes WHERE id = ?').get(classId);
    res.json({ class: updated });
  },
);

schoolClassesRouter.post(
  '/classes/:classId/arms',
  requireCsrfCheck,
  requirePermission('school.classes.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createClassArmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid class arm.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId } = req.params;

    const cls = db
      .prepare('SELECT id, name, status FROM school_classes WHERE id = ? AND school_id = ?')
      .get(classId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!cls) {
      res.status(404).json({ error: 'Class not found in your school.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM class_arms WHERE school_id = ? AND class_id = ? AND LOWER(name) = LOWER(?)')
      .get(schoolId, classId, parsed.data.name);
    if (dup) {
      res.status(409).json({
        error: `Class arm "${parsed.data.name}" already exists for ${cls.name}.`,
      });
      return;
    }

    const armId = `arm_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO class_arms (id, school_id, class_id, name, capacity, room, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(armId, schoolId, classId, parsed.data.name, parsed.data.capacity, parsed.data.room);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.class_arm.created',
      resourceType: 'class_arm',
      resourceId: armId,
      outcome: 'success',
      metadata: { classId, className: cls.name, armName: parsed.data.name },
      ipAddress: getClientIp(req),
    });

    const arm = db.prepare('SELECT * FROM class_arms WHERE id = ?').get(armId);
    res.status(201).json({ arm });
  },
);

schoolClassesRouter.patch(
  '/classes/:classId/arms/:armId',
  requireCsrfCheck,
  requirePermission('school.classes.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateClassArmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid class arm update.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId, armId } = req.params;

    const existing = db
      .prepare('SELECT id, name, status FROM class_arms WHERE id = ? AND class_id = ? AND school_id = ?')
      .get(armId, classId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Class arm not found for this class.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM class_arms WHERE school_id = ? AND class_id = ? AND LOWER(name) = LOWER(?) AND id != ?')
      .get(schoolId, classId, parsed.data.name, armId);
    if (dup) {
      res.status(409).json({ error: `Another arm named "${parsed.data.name}" already exists in this class.` });
      return;
    }

    const nextStatus = parsed.data.status ?? existing.status;
    db.prepare(`
      UPDATE class_arms
      SET name = ?, capacity = ?, room = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(parsed.data.name, parsed.data.capacity, parsed.data.room, nextStatus, armId, schoolId);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.class_arm.updated',
      resourceType: 'class_arm',
      resourceId: armId,
      outcome: 'success',
      metadata: { classId, armName: parsed.data.name, status: nextStatus },
      ipAddress: getClientIp(req),
    });

    const arm = db.prepare('SELECT * FROM class_arms WHERE id = ?').get(armId);
    res.json({ arm });
  },
);

schoolClassesRouter.post(
  '/classes/:classId/teachers',
  requireCsrfCheck,
  requirePermission('school.classes.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = assignClassTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid teacher assignment.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId } = req.params;
    const d = parsed.data;

    const cls = db
      .prepare('SELECT id, name, status FROM school_classes WHERE id = ? AND school_id = ?')
      .get(classId, schoolId) as { id: string; name: string; status: string } | undefined;
    if (!cls || cls.status === 'archived') {
      res.status(400).json({ error: 'Select an active class in your school.' });
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
      res.status(400).json({ error: 'Only active teachers can be assigned to a class.' });
      return;
    }

    let armId: string | null = d.armId || null;
    if (armId) {
      const arm = db
        .prepare('SELECT id, class_id, status FROM class_arms WHERE id = ? AND school_id = ?')
        .get(armId, schoolId) as { id: string; class_id: string; status: string } | undefined;
      if (!arm || arm.class_id !== classId || arm.status === 'archived') {
        res.status(400).json({ error: 'Selected class arm is not active for this class.' });
        return;
      }
    }

    const duplicate = db
      .prepare(`
        SELECT id FROM class_teacher_assignments
        WHERE school_id = ? AND class_id = ? AND teacher_id = ? AND IFNULL(arm_id, '') = IFNULL(?, '') AND is_active = 1
      `)
      .get(schoolId, classId, d.teacherId, armId);
    if (duplicate) {
      res.status(409).json({ error: 'This teacher is already actively assigned to this class/arm.' });
      return;
    }

    const currentSession = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(schoolId) as { id: string } | undefined;

    const assignmentId = `cta_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO class_teacher_assignments (
        id, school_id, class_id, arm_id, teacher_id, academic_session_id, role_label, is_active, assigned_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      assignmentId,
      schoolId,
      classId,
      armId,
      d.teacherId,
      currentSession?.id ?? null,
      d.roleLabel,
      req.auth!.id,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.class_teacher.assigned',
      resourceType: 'class_teacher_assignment',
      resourceId: assignmentId,
      outcome: 'success',
      metadata: {
        classId,
        className: cls.name,
        armId,
        teacherId: teacher.id,
        teacherName: `${teacher.first_name} ${teacher.last_name}`,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ assignmentId });
  },
);

schoolClassesRouter.delete(
  '/classes/:classId/teachers/:assignmentId',
  requireCsrfCheck,
  requirePermission('school.classes.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { classId, assignmentId } = req.params;

    const existing = db
      .prepare('SELECT id, teacher_id FROM class_teacher_assignments WHERE id = ? AND class_id = ? AND school_id = ? AND is_active = 1')
      .get(assignmentId, classId, schoolId) as { id: string; teacher_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Active class teacher assignment not found.' });
      return;
    }

    db.prepare(
      "UPDATE class_teacher_assignments SET is_active = 0, ended_at = datetime('now') WHERE id = ? AND school_id = ?",
    ).run(assignmentId, schoolId);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.class_teacher.ended',
      resourceType: 'class_teacher_assignment',
      resourceId: assignmentId,
      outcome: 'success',
      metadata: { classId, teacherId: existing.teacher_id },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);
