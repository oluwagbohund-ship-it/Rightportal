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
import { normalizePagination } from '../../school-helpers.ts';
import { hashPassword } from '../../security.ts';
import {
  createParentSchema,
  linkStudentGuardianSchema,
  updateGuardianPermissionsSchema,
  updateParentSchema,
} from '../../validation.ts';

export const schoolParentsRouter = Router();

schoolParentsRouter.get(
  '/parents',
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 50);

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const whereClauses = ['p.school_id = ?'];
    const params: Array<string | number> = [schoolId];

    if (search) {
      const pattern = `%${search.toLowerCase()}%`;
      whereClauses.push(
        '(LOWER(p.full_name) LIKE ? OR LOWER(p.email) LIKE ? OR LOWER(p.phone) LIKE ? OR LOWER(p.occupation) LIKE ?)',
      );
      params.push(pattern, pattern, pattern, pattern);
    }
    if (status && status !== 'all') {
      whereClauses.push('p.status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.join(' AND ');
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM parents p WHERE ${whereSql}`)
      .get(...params) as { total: number };

    const parents = db
      .prepare(`
        SELECT
          p.*,
          (SELECT COUNT(*) FROM student_guardians sg WHERE sg.parent_id = p.id AND sg.school_id = p.school_id) AS wards_count
        FROM parents p
        WHERE ${whereSql}
        ORDER BY p.created_at DESC, p.full_name ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    res.json({
      parents,
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.max(1, Math.ceil(countRow.total / limit)),
      },
    });
  },
);

schoolParentsRouter.post(
  '/parents',
  requireCsrfCheck,
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createParentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid parent payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    const lowerEmail = d.email ? d.email.toLowerCase() : '';

    if (d.initialLink?.studentId) {
      const student = db
        .prepare('SELECT id FROM students WHERE id = ? AND school_id = ?')
        .get(d.initialLink.studentId, schoolId);
      if (!student) {
        res.status(404).json({ error: 'Selected student does not belong to your school.' });
        return;
      }
    }

    if (d.portalAccount?.createLogin) {
      if (!lowerEmail) {
        res.status(400).json({ error: 'Email is required to create a parent portal login account.' });
        return;
      }
      if (!d.portalAccount.password || d.portalAccount.password.length < 8) {
        res.status(400).json({ error: 'Initial parent portal password must be at least 8 characters.' });
        return;
      }
      const existingUser = db
        .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
        .get(lowerEmail);
      if (existingUser) {
        res.status(409).json({ error: 'A user account with this email address already exists.' });
        return;
      }
    }

    const parentId = `par_${crypto.randomUUID()}`;
    let linkedUserId: string | null = null;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.portalAccount?.createLogin && lowerEmail && d.portalAccount.password) {
        linkedUserId = `usr_${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
          VALUES (?, ?, ?, ?, 'school_member', 1)
        `).run(linkedUserId, lowerEmail, d.fullName, hashPassword(d.portalAccount.password));

        db.prepare(`
          INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
          VALUES (?, ?, ?, 'role_parent', ?, 'active')
        `).run(
          `mem_${crypto.randomUUID()}`,
          schoolId,
          linkedUserId,
          d.occupation || 'Parent / Guardian',
        );
      }

      db.prepare(`
        INSERT INTO parents (
          id, school_id, user_id, full_name, email, phone, residential_address, occupation, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        parentId,
        schoolId,
        linkedUserId,
        d.fullName,
        lowerEmail,
        d.phone,
        d.residentialAddress,
        d.occupation,
      );

      if (d.initialLink?.studentId) {
        db.prepare(`
          INSERT INTO student_guardians (
            id, school_id, student_id, parent_id, relationship,
            is_primary_guardian, is_emergency_contact,
            can_pickup, can_view_academic_records, can_receive_notifications
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `grd_${crypto.randomUUID()}`,
          schoolId,
          d.initialLink.studentId,
          parentId,
          d.initialLink.relationship,
          d.initialLink.isPrimaryGuardian ? 1 : 0,
          d.initialLink.isEmergencyContact ? 1 : 0,
          d.initialLink.canPickup ? 1 : 0,
          d.initialLink.canViewAcademicRecords ? 1 : 0,
          d.initialLink.canReceiveNotifications ? 1 : 0,
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create parent failed:', err);
      res.status(500).json({ error: 'Unable to register parent / guardian.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.parent.created',
      resourceType: 'parent',
      resourceId: parentId,
      outcome: 'success',
      metadata: { fullName: d.fullName, phone: d.phone, linkedInitialWard: Boolean(d.initialLink?.studentId) },
      ipAddress: getClientIp(req),
    });

    const parent = db.prepare('SELECT * FROM parents WHERE id = ?').get(parentId);
    res.status(201).json({ parent });
  },
);

schoolParentsRouter.get(
  '/parents/:parentId',
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { parentId } = req.params;

    const parent = db
      .prepare('SELECT * FROM parents WHERE id = ? AND school_id = ?')
      .get(parentId, schoolId);
    if (!parent) {
      res.status(404).json({ error: 'Parent / guardian record not found in your school.' });
      return;
    }

    const wards = db
      .prepare(`
        SELECT
          sg.id AS guardian_id,
          sg.relationship,
          sg.is_primary_guardian,
          sg.is_emergency_contact,
          sg.can_pickup,
          sg.can_view_academic_records,
          sg.can_receive_notifications,
          sg.verified_at,
          s.id AS student_id,
          s.admission_number,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.gender,
          s.status AS student_status,
          c.name AS class_name,
          a.name AS arm_name
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE sg.parent_id = ? AND sg.school_id = ?
        ORDER BY s.last_name ASC, s.first_name ASC
      `)
      .all(parentId, schoolId);

    res.json({ parent, wards });
  },
);

schoolParentsRouter.patch(
  '/parents/:parentId',
  requireCsrfCheck,
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateParentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid parent update.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { parentId } = req.params;
    const d = parsed.data;

    const existing = db
      .prepare('SELECT id, user_id FROM parents WHERE id = ? AND school_id = ?')
      .get(parentId, schoolId) as { id: string; user_id: string | null } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Parent record not found in your school.' });
      return;
    }

    db.prepare(`
      UPDATE parents
      SET
        full_name = ?,
        email = ?,
        phone = ?,
        residential_address = ?,
        occupation = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      d.fullName,
      d.email ? d.email.toLowerCase() : '',
      d.phone,
      d.residentialAddress,
      d.occupation,
      d.status,
      parentId,
      schoolId,
    );

    if (existing.user_id) {
      db.prepare('UPDATE school_memberships SET status = ? WHERE user_id = ? AND school_id = ?').run(
        d.status === 'active' ? 'active' : 'suspended',
        existing.user_id,
        schoolId,
      );
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.parent.updated',
      resourceType: 'parent',
      resourceId: parentId,
      outcome: 'success',
      metadata: { fullName: d.fullName, status: d.status },
      ipAddress: getClientIp(req),
    });

    const parent = db.prepare('SELECT * FROM parents WHERE id = ?').get(parentId);
    res.json({ parent });
  },
);

schoolParentsRouter.post(
  '/parents/:parentId/guardians',
  requireCsrfCheck,
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = linkStudentGuardianSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid guardian linkage.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { parentId } = req.params;
    const d = parsed.data;

    const parent = db
      .prepare('SELECT id, full_name FROM parents WHERE id = ? AND school_id = ?')
      .get(parentId, schoolId) as { id: string; full_name: string } | undefined;
    if (!parent) {
      res.status(404).json({ error: 'Parent / guardian not found in your school.' });
      return;
    }

    const student = db
      .prepare('SELECT id, first_name, last_name, admission_number FROM students WHERE id = ? AND school_id = ?')
      .get(d.studentId, schoolId) as
      | { id: string; first_name: string; last_name: string; admission_number: string }
      | undefined;
    if (!student) {
      res.status(404).json({ error: 'Student not found in your school tenant.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM student_guardians WHERE school_id = ? AND student_id = ? AND parent_id = ?')
      .get(schoolId, d.studentId, parentId);
    if (existing) {
      res.status(409).json({ error: 'This parent / guardian is already linked to this student.' });
      return;
    }

    const guardianId = `grd_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO student_guardians (
        id, school_id, student_id, parent_id, relationship,
        is_primary_guardian, is_emergency_contact,
        can_pickup, can_view_academic_records, can_receive_notifications
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guardianId,
      schoolId,
      d.studentId,
      parentId,
      d.relationship,
      d.isPrimaryGuardian ? 1 : 0,
      d.isEmergencyContact ? 1 : 0,
      d.canPickup ? 1 : 0,
      d.canViewAcademicRecords ? 1 : 0,
      d.canReceiveNotifications ? 1 : 0,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.guardian.linked',
      resourceType: 'student_guardian',
      resourceId: guardianId,
      outcome: 'success',
      metadata: {
        parentId,
        parentName: parent.full_name,
        studentId: student.id,
        admissionNumber: student.admission_number,
        relationship: d.relationship,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ guardianId });
  },
);

schoolParentsRouter.patch(
  '/parents/guardians/:guardianId',
  requireCsrfCheck,
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateGuardianPermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid guardian permissions.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { guardianId } = req.params;
    const d = parsed.data;

    const existing = db
      .prepare('SELECT id, student_id, parent_id FROM student_guardians WHERE id = ? AND school_id = ?')
      .get(guardianId, schoolId) as { id: string; student_id: string; parent_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Guardian link not found in your school.' });
      return;
    }

    db.prepare(`
      UPDATE student_guardians
      SET
        relationship = ?,
        is_primary_guardian = ?,
        is_emergency_contact = ?,
        can_pickup = ?,
        can_view_academic_records = ?,
        can_receive_notifications = ?
      WHERE id = ? AND school_id = ?
    `).run(
      d.relationship,
      d.isPrimaryGuardian ? 1 : 0,
      d.isEmergencyContact ? 1 : 0,
      d.canPickup ? 1 : 0,
      d.canViewAcademicRecords ? 1 : 0,
      d.canReceiveNotifications ? 1 : 0,
      guardianId,
      schoolId,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.guardian.permissions_updated',
      resourceType: 'student_guardian',
      resourceId: guardianId,
      outcome: 'success',
      metadata: {
        studentId: existing.student_id,
        parentId: existing.parent_id,
        canViewAcademicRecords: d.canViewAcademicRecords,
      },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);

schoolParentsRouter.delete(
  '/parents/guardians/:guardianId',
  requireCsrfCheck,
  requirePermission('school.parents.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { guardianId } = req.params;

    const existing = db
      .prepare('SELECT id, student_id, parent_id FROM student_guardians WHERE id = ? AND school_id = ?')
      .get(guardianId, schoolId) as { id: string; student_id: string; parent_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Guardian link not found in your school.' });
      return;
    }

    db.prepare('DELETE FROM student_guardians WHERE id = ? AND school_id = ?').run(guardianId, schoolId);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.guardian.unlinked',
      resourceType: 'student_guardian',
      resourceId: guardianId,
      outcome: 'success',
      metadata: { studentId: existing.student_id, parentId: existing.parent_id },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);
