import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import { deleteStoredFileById, saveValidatedFile } from '../../file-storage.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { normalizePagination } from '../../school-helpers.ts';
import { hashPassword } from '../../security.ts';
import { revokeAllSessionsForUser } from '../../session-service.ts';
import {
  createTeacherSchema,
  entityDocumentUploadSchema,
  updateTeacherSchema,
  updateTeacherStatusSchema,
  uploadFileSchema,
} from '../../validation.ts';

export const schoolTeachersRouter = Router();

schoolTeachersRouter.get(
  '/teachers',
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 50);

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const whereClauses = ['t.school_id = ?'];
    const params: Array<string | number> = [schoolId];

    if (search) {
      const pattern = `%${search.toLowerCase()}%`;
      whereClauses.push(
        '(LOWER(t.first_name) LIKE ? OR LOWER(t.last_name) LIKE ? OR LOWER(t.staff_id_number) LIKE ? OR LOWER(t.email) LIKE ? OR LOWER(t.specialization) LIKE ?)',
      );
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (status && status !== 'all') {
      whereClauses.push('t.employment_status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.join(' AND ');
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM teachers t WHERE ${whereSql}`)
      .get(...params) as { total: number };

    const teachers = db
      .prepare(`
        SELECT
          t.*,
          (SELECT COUNT(*) FROM class_teacher_assignments cta WHERE cta.teacher_id = t.id AND cta.school_id = t.school_id AND cta.is_active = 1) AS active_classes_count,
          (SELECT COUNT(*) FROM teacher_subject_assignments tsa WHERE tsa.teacher_id = t.id AND tsa.school_id = t.school_id AND tsa.is_active = 1) AS active_subjects_count
        FROM teachers t
        WHERE ${whereSql}
        ORDER BY t.created_at DESC, t.last_name ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    res.json({
      teachers,
      pagination: {
        page,
        limit,
        total: totalRow.total,
        totalPages: Math.max(1, Math.ceil(totalRow.total / limit)),
      },
    });
  },
);

schoolTeachersRouter.post(
  '/teachers',
  requireCsrfCheck,
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid teacher payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    const lowerEmail = d.email.toLowerCase();

    const dupStaffId = db
      .prepare('SELECT id FROM teachers WHERE school_id = ? AND UPPER(staff_id_number) = UPPER(?)')
      .get(schoolId, d.staffIdNumber);
    if (dupStaffId) {
      res.status(409).json({
        error: `Staff ID "${d.staffIdNumber}" is already assigned in your school.`,
      });
      return;
    }

    const dupEmail = db
      .prepare('SELECT id FROM teachers WHERE school_id = ? AND LOWER(email) = ?')
      .get(schoolId, lowerEmail);
    if (dupEmail) {
      res.status(409).json({
        error: 'A teacher with this email address already exists in your school.',
      });
      return;
    }

    if (d.portalAccount?.createLogin) {
      if (!d.portalAccount.password || d.portalAccount.password.length < 8) {
        res.status(400).json({ error: 'Initial teacher portal password must be at least 8 characters.' });
        return;
      }
      const existingUser = db
        .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
        .get(lowerEmail);
      if (existingUser) {
        res.status(409).json({ error: 'A portal user account with this email already exists.' });
        return;
      }
    }

    // Validate optional initial subject & class assignments stay inside tenant
    for (const subjectId of d.assignedSubjectIds) {
      const sub = db
        .prepare("SELECT id FROM subjects WHERE id = ? AND school_id = ? AND status = 'active'")
        .get(subjectId, schoolId);
      if (!sub) {
        res.status(400).json({ error: 'One or more selected subjects are invalid or archived.' });
        return;
      }
    }
    for (const classId of d.assignedClassIds) {
      const cls = db
        .prepare("SELECT id FROM school_classes WHERE id = ? AND school_id = ? AND status = 'active'")
        .get(classId, schoolId);
      if (!cls) {
        res.status(400).json({ error: 'One or more selected classes are invalid or archived.' });
        return;
      }
    }

    const teacherId = `tch_${crypto.randomUUID()}`;
    let linkedUserId: string | null = null;
    const fullName = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ');

    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.portalAccount?.createLogin && d.portalAccount.password) {
        linkedUserId = `usr_${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
          VALUES (?, ?, ?, ?, 'school_member', 1)
        `).run(linkedUserId, lowerEmail, fullName, hashPassword(d.portalAccount.password));

        db.prepare(`
          INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
          VALUES (?, ?, ?, 'role_teacher', ?, ?)
        `).run(
          `mem_${crypto.randomUUID()}`,
          schoolId,
          linkedUserId,
          d.specialization || d.staffIdNumber,
          d.employmentStatus === 'active' ? 'active' : 'suspended',
        );
      }

      db.prepare(`
        INSERT INTO teachers (
          id, school_id, user_id, staff_id_number,
          first_name, middle_name, last_name, gender, date_of_birth,
          email, phone, residential_address, employment_date,
          qualifications, specialization, employment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        teacherId,
        schoolId,
        linkedUserId,
        d.staffIdNumber.toUpperCase(),
        d.firstName,
        d.middleName,
        d.lastName,
        d.gender,
        d.dateOfBirth,
        lowerEmail,
        d.phone,
        d.residentialAddress,
        d.employmentDate,
        d.qualifications,
        d.specialization,
        d.employmentStatus,
      );

      const currentSession = db
        .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
        .get(schoolId) as { id: string } | undefined;

      for (const subjectId of d.assignedSubjectIds) {
        db.prepare(`
          INSERT INTO teacher_subject_assignments (
            id, school_id, teacher_id, subject_id, academic_session_id, is_active, assigned_by_user_id
          ) VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(
          `tsa_${crypto.randomUUID()}`,
          schoolId,
          teacherId,
          subjectId,
          currentSession?.id ?? null,
          req.auth!.id,
        );
      }

      for (const classId of d.assignedClassIds) {
        db.prepare(`
          INSERT INTO class_teacher_assignments (
            id, school_id, class_id, teacher_id, academic_session_id, role_label, is_active, assigned_by_user_id
          ) VALUES (?, ?, ?, ?, ?, 'Class Teacher', 1, ?)
        `).run(
          `cta_${crypto.randomUUID()}`,
          schoolId,
          classId,
          teacherId,
          currentSession?.id ?? null,
          req.auth!.id,
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create teacher failed:', err);
      res.status(500).json({ error: 'Unable to register teacher.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher.created',
      resourceType: 'teacher',
      resourceId: teacherId,
      outcome: 'success',
      metadata: {
        staffIdNumber: d.staffIdNumber.toUpperCase(),
        fullName,
        subjectsAssigned: d.assignedSubjectIds.length,
        classesAssigned: d.assignedClassIds.length,
      },
      ipAddress: getClientIp(req),
    });

    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacherId);
    res.status(201).json({ teacher });
  },
);

schoolTeachersRouter.get(
  '/teachers/:teacherId',
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId } = req.params;

    const teacher = db
      .prepare('SELECT * FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId);
    if (!teacher) {
      res.status(404).json({ error: 'Teacher record not found in your school.' });
      return;
    }

    const classAssignments = db
      .prepare(`
        SELECT
          cta.*,
          c.name AS class_name,
          c.section AS class_section,
          a.name AS arm_name
        FROM class_teacher_assignments cta
        INNER JOIN school_classes c ON c.id = cta.class_id
        LEFT JOIN class_arms a ON a.id = cta.arm_id
        WHERE cta.teacher_id = ? AND cta.school_id = ?
        ORDER BY cta.is_active DESC, cta.assigned_at DESC
      `)
      .all(teacherId, schoolId);

    const subjectAssignments = db
      .prepare(`
        SELECT
          tsa.*,
          sub.name AS subject_name,
          sub.code AS subject_code,
          sub.category AS subject_category,
          c.name AS class_name,
          a.name AS arm_name
        FROM teacher_subject_assignments tsa
        INNER JOIN subjects sub ON sub.id = tsa.subject_id
        LEFT JOIN school_classes c ON c.id = tsa.class_id
        LEFT JOIN class_arms a ON a.id = tsa.arm_id
        WHERE tsa.teacher_id = ? AND tsa.school_id = ?
        ORDER BY tsa.is_active DESC, tsa.assigned_at DESC
      `)
      .all(teacherId, schoolId);

    const documents = db
      .prepare(`
        SELECT
          td.id, td.document_type, td.title, td.file_id, td.created_at,
          f.original_name, f.mime_type, f.size_bytes
        FROM teacher_documents td
        INNER JOIN stored_files f ON f.id = td.file_id
        WHERE td.teacher_id = ? AND td.school_id = ?
        ORDER BY td.created_at DESC
      `)
      .all(teacherId, schoolId);

    res.json({ teacher, classAssignments, subjectAssignments, documents });
  },
);

schoolTeachersRouter.patch(
  '/teachers/:teacherId',
  requireCsrfCheck,
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid teacher update.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId } = req.params;
    const d = parsed.data;
    const lowerEmail = d.email.toLowerCase();

    const existing = db
      .prepare('SELECT id, user_id FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId) as { id: string; user_id: string | null } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }

    const dupStaff = db
      .prepare('SELECT id FROM teachers WHERE school_id = ? AND UPPER(staff_id_number) = UPPER(?) AND id != ?')
      .get(schoolId, d.staffIdNumber, teacherId);
    if (dupStaff) {
      res.status(409).json({ error: `Staff ID "${d.staffIdNumber}" is already assigned.` });
      return;
    }

    const dupEmail = db
      .prepare('SELECT id FROM teachers WHERE school_id = ? AND LOWER(email) = ? AND id != ?')
      .get(schoolId, lowerEmail, teacherId);
    if (dupEmail) {
      res.status(409).json({ error: 'Another teacher already uses this email in your school.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE teachers
        SET
          staff_id_number = ?,
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          gender = ?,
          date_of_birth = ?,
          email = ?,
          phone = ?,
          residential_address = ?,
          employment_date = ?,
          qualifications = ?,
          specialization = ?,
          employment_status = ?,
          updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(
        d.staffIdNumber.toUpperCase(),
        d.firstName,
        d.middleName,
        d.lastName,
        d.gender,
        d.dateOfBirth,
        lowerEmail,
        d.phone,
        d.residentialAddress,
        d.employmentDate,
        d.qualifications,
        d.specialization,
        d.employmentStatus,
        teacherId,
        schoolId,
      );

      if (existing.user_id && (d.employmentStatus === 'suspended' || d.employmentStatus === 'terminated')) {
        db.prepare("UPDATE school_memberships SET status = 'suspended' WHERE user_id = ? AND school_id = ?").run(
          existing.user_id,
          schoolId,
        );
        revokeAllSessionsForUser(existing.user_id);
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update teacher failed:', err);
      res.status(500).json({ error: 'Unable to update teacher profile.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher.updated',
      resourceType: 'teacher',
      resourceId: teacherId,
      outcome: 'success',
      metadata: {
        staffIdNumber: d.staffIdNumber.toUpperCase(),
        employmentStatus: d.employmentStatus,
      },
      ipAddress: getClientIp(req),
    });

    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacherId);
    res.json({ teacher });
  },
);

schoolTeachersRouter.patch(
  '/teachers/:teacherId/status',
  requireCsrfCheck,
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateTeacherStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid employment status.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId } = req.params;

    const existing = db
      .prepare('SELECT id, user_id, staff_id_number, employment_status FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId) as
      | { id: string; user_id: string | null; staff_id_number: string; employment_status: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE teachers SET employment_status = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
        parsed.data.employmentStatus,
        teacherId,
        schoolId,
      );
      if (existing.user_id) {
        const memStatus = parsed.data.employmentStatus === 'active' ? 'active' : 'suspended';
        db.prepare('UPDATE school_memberships SET status = ? WHERE user_id = ? AND school_id = ?').run(
          memStatus,
          existing.user_id,
          schoolId,
        );
        if (memStatus === 'suspended') {
          revokeAllSessionsForUser(existing.user_id);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update teacher status failed:', err);
      res.status(500).json({ error: 'Unable to update employment status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher.status_updated',
      resourceType: 'teacher',
      resourceId: teacherId,
      outcome: 'success',
      metadata: {
        staffIdNumber: existing.staff_id_number,
        previousStatus: existing.employment_status,
        newStatus: parsed.data.employmentStatus,
      },
      ipAddress: getClientIp(req),
    });

    res.json({ id: teacherId, employment_status: parsed.data.employmentStatus });
  },
);

schoolTeachersRouter.post(
  '/teachers/:teacherId/photo',
  requireCsrfCheck,
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = uploadFileSchema.safeParse({
      ...req.body,
      category: 'teacher_profile_picture',
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid photo payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId } = req.params;

    const teacher = db
      .prepare('SELECT id, user_id, photo_file_id FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId) as
      | { id: string; user_id: string | null; photo_file_id: string | null }
      | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId: teacher.user_id,
        category: 'teacher_profile_picture',
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      db.prepare("UPDATE teachers SET photo_file_id = ?, updated_at = datetime('now') WHERE id = ?").run(
        file.id,
        teacherId,
      );
      if (teacher.photo_file_id && teacher.photo_file_id !== file.id) {
        deleteStoredFileById(teacher.photo_file_id);
      }

      res.status(201).json({ photoFileId: file.id });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload photo.' });
    }
  },
);

schoolTeachersRouter.get(
  '/teachers/:teacherId/documents',
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId } = req.params;

    const teacher = db
      .prepare('SELECT id, first_name, last_name, staff_id_number FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId);
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }

    const documents = db
      .prepare(`
        SELECT
          td.id, td.document_type, td.title, td.file_id, td.created_at,
          f.original_name, f.mime_type, f.size_bytes,
          u.full_name AS uploaded_by_name
        FROM teacher_documents td
        INNER JOIN stored_files f ON f.id = td.file_id
        LEFT JOIN users u ON u.id = td.uploaded_by_user_id
        WHERE td.teacher_id = ? AND td.school_id = ?
        ORDER BY td.created_at DESC
      `)
      .all(teacherId, schoolId);

    res.json({ teacher, documents });
  },
);

schoolTeachersRouter.post(
  '/teachers/:teacherId/documents',
  requireCsrfCheck,
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = entityDocumentUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid document payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId } = req.params;

    const teacher = db
      .prepare('SELECT id, user_id FROM teachers WHERE id = ? AND school_id = ?')
      .get(teacherId, schoolId) as { id: string; user_id: string | null } | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found in your school.' });
      return;
    }

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId: teacher.user_id,
        category: 'staff_document',
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      const docId = `tdoc_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO teacher_documents (id, school_id, teacher_id, file_id, document_type, title, uploaded_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        schoolId,
        teacherId,
        file.id,
        parsed.data.documentType,
        parsed.data.title,
        req.auth!.id,
      );

      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId,
        authEnvironment: 'school',
        action: 'school.teacher.document_uploaded',
        resourceType: 'teacher_document',
        resourceId: docId,
        outcome: 'success',
        metadata: { teacherId, documentType: parsed.data.documentType, title: parsed.data.title },
        ipAddress: getClientIp(req),
      });

      res.status(201).json({
        document: {
          id: docId,
          document_type: parsed.data.documentType,
          title: parsed.data.title,
          file_id: file.id,
          original_name: file.original_name,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload staff document.' });
    }
  },
);

schoolTeachersRouter.delete(
  '/teachers/:teacherId/documents/:docId',
  requireCsrfCheck,
  requirePermission('school.teachers.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { teacherId, docId } = req.params;

    const doc = db
      .prepare('SELECT id, file_id, title FROM teacher_documents WHERE id = ? AND teacher_id = ? AND school_id = ?')
      .get(docId, teacherId, schoolId) as { id: string; file_id: string; title: string } | undefined;

    if (!doc) {
      res.status(404).json({ error: 'Staff document not found.' });
      return;
    }

    db.prepare('DELETE FROM teacher_documents WHERE id = ? AND school_id = ?').run(docId, schoolId);
    deleteStoredFileById(doc.file_id);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher.document_deleted',
      resourceType: 'teacher_document',
      resourceId: docId,
      outcome: 'success',
      metadata: { teacherId, title: doc.title },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);
