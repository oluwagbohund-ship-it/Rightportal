import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../../db/client.ts';
import { recordAuditLog } from '../../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../../middleware.ts';
import {
  enrollStudentSubjectsSchema,
  updateSubjectEnrollmentStatusSchema,
} from '../../../validation.ts';
import { ensureSchoolAcademicDefaults, isTeacherAuthorizedForStudent } from './helpers.ts';

export const enrollmentsRouter = Router();

enrollmentsRouter.get(
  '/academics/enrollments',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';

    if (req.auth!.roleCode === 'student') {
      const own = db
        .prepare('SELECT id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
        .get(schoolId, req.auth!.id) as { id: string } | undefined;
      if (!own || (studentId && studentId !== own.id)) {
        res.status(403).json({ error: 'Students may only view their own subject enrollments.' });
        return;
      }
    }

    const enrollments = db
      .prepare(`
        SELECT
          sse.id, sse.student_id, sse.class_id, sse.arm_id, sse.subject_id,
          sse.academic_session_id, sse.academic_term_id, sse.is_compulsory,
          sse.status, sse.enrolled_at, sse.dropped_at, sse.notes,
          st.admission_number, st.first_name, st.last_name,
          sub.name AS subject_name, sub.code AS subject_code, sub.category AS subject_category,
          cls.name AS class_name, arm.name AS arm_name,
          ses.name AS session_name, trm.name AS term_name
        FROM student_subject_enrollments sse
        INNER JOIN students st ON st.id = sse.student_id
        INNER JOIN subjects sub ON sub.id = sse.subject_id
        INNER JOIN school_classes cls ON cls.id = sse.class_id
        LEFT JOIN class_arms arm ON arm.id = sse.arm_id
        INNER JOIN academic_sessions ses ON ses.id = sse.academic_session_id
        LEFT JOIN academic_terms trm ON trm.id = sse.academic_term_id
        WHERE sse.school_id = ?
          ${sessionId ? 'AND sse.academic_session_id = ?' : ''}
          ${classId ? 'AND sse.class_id = ?' : ''}
          ${studentId ? 'AND sse.student_id = ?' : ''}
        ORDER BY st.last_name ASC, st.first_name ASC, sub.name ASC
        LIMIT 400
      `)
      .all(
        ...[
          schoolId,
          ...(sessionId ? [sessionId] : []),
          ...(classId ? [classId] : []),
          ...(studentId ? [studentId] : []),
        ],
      );

    res.json({ enrollments });
  },
);

enrollmentsRouter.post(
  '/academics/enrollments/bulk',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = enrollStudentSubjectsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid enrollment payload.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;
    const termScopeKey = d.academicTermId ? d.academicTermId : '__SESSION__';

    const session = db
      .prepare('SELECT id FROM academic_sessions WHERE id = ? AND school_id = ?')
      .get(d.academicSessionId, schoolId);
    if (!session) {
      res.status(400).json({ error: 'Selected academic session does not belong to your school.' });
      return;
    }

    if (d.academicTermId) {
      const term = db
        .prepare('SELECT id FROM academic_terms WHERE id = ? AND school_id = ? AND academic_session_id = ?')
        .get(d.academicTermId, schoolId, d.academicSessionId);
      if (!term) {
        res.status(400).json({ error: 'Selected academic term does not belong to the chosen session.' });
        return;
      }
    }

    const classRow = db
      .prepare('SELECT id FROM school_classes WHERE id = ? AND school_id = ?')
      .get(d.classId, schoolId);
    if (!classRow) {
      res.status(400).json({ error: 'Selected class does not belong to your school.' });
      return;
    }

    let createdCount = 0;
    let reactivatedCount = 0;
    let skippedCount = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const studentId of d.studentIds) {
        const student = db
          .prepare('SELECT id, current_class_id, current_arm_id, status FROM students WHERE id = ? AND school_id = ?')
          .get(studentId, schoolId) as
          | { id: string; current_class_id: string | null; current_arm_id: string | null; status: string }
          | undefined;

        if (!student || student.status !== 'active') {
          throw new Error(`Student (${studentId}) is not active in your school.`);
        }
        if (student.current_class_id && student.current_class_id !== d.classId) {
          throw new Error('Selected student does not belong to the chosen class.');
        }

        for (const subjectId of d.subjectIds) {
          const subject = db
            .prepare("SELECT id FROM subjects WHERE id = ? AND school_id = ? AND status = 'active'")
            .get(subjectId, schoolId);
          if (!subject) {
            throw new Error(`Subject (${subjectId}) is not active in your school.`);
          }

          const existing = db
            .prepare(`
              SELECT id, status FROM student_subject_enrollments
              WHERE school_id = ? AND student_id = ? AND subject_id = ? AND academic_session_id = ? AND term_scope_key = ?
            `)
            .get(schoolId, studentId, subjectId, d.academicSessionId, termScopeKey) as
            | { id: string; status: string }
            | undefined;

          if (existing) {
            if (existing.status === 'active') {
              skippedCount += 1;
            } else {
              db.prepare(`
                UPDATE student_subject_enrollments
                SET status = 'active', is_compulsory = ?, dropped_at = NULL, notes = ?
                WHERE id = ? AND school_id = ?
              `).run(d.isCompulsory ? 1 : 0, d.notes, existing.id, schoolId);
              reactivatedCount += 1;
            }
          } else {
            db.prepare(`
              INSERT INTO student_subject_enrollments (
                id, school_id, student_id, class_id, arm_id, subject_id,
                academic_session_id, academic_term_id, term_scope_key,
                is_compulsory, status, enrolled_by_user_id, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            `).run(
              `sse_${crypto.randomUUID()}`,
              schoolId,
              studentId,
              d.classId,
              d.armId || student.current_arm_id || null,
              subjectId,
              d.academicSessionId,
              d.academicTermId || null,
              termScopeKey,
              d.isCompulsory ? 1 : 0,
              req.auth!.id,
              d.notes,
            );
            createdCount += 1;
          }
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to enroll subjects.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.subject_enrollments.bulk_saved',
      resourceType: 'student_subject_enrollment',
      resourceId: d.classId,
      outcome: 'success',
      metadata: { createdCount, reactivatedCount, skippedCount },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ createdCount, reactivatedCount, skippedCount });
  },
);

enrollmentsRouter.patch(
  '/academics/enrollments/:enrollmentId',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSubjectEnrollmentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid enrollment status.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM student_subject_enrollments WHERE id = ? AND school_id = ?')
      .get(req.params.enrollmentId, schoolId);
    if (!existing) {
      res.status(404).json({ error: 'Subject enrollment record not found.' });
      return;
    }

    db.prepare(`
      UPDATE student_subject_enrollments
      SET status = ?,
          dropped_at = CASE WHEN ? = 'dropped' THEN datetime('now') ELSE NULL END,
          notes = COALESCE(?, notes)
      WHERE id = ? AND school_id = ?
    `).run(
      parsed.data.status,
      parsed.data.status,
      parsed.data.notes ?? null,
      req.params.enrollmentId,
      schoolId,
    );

    res.json({ ok: true, status: parsed.data.status });
  },
);

enrollmentsRouter.get(
  '/academics/students/:studentId/academic-history',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;
    const roleCode = req.auth!.roleCode;
    const db = getDb();
    ensureSchoolAcademicDefaults(schoolId);

    const student = db
      .prepare(`
        SELECT s.*, c.name AS class_name, a.name AS arm_name
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.id = ? AND s.school_id = ?
      `)
      .get(studentId, schoolId) as { id: string; user_id: string | null } | undefined;

    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    let onlyPublished = false;
    if (roleCode === 'student') {
      if (student.user_id !== req.auth!.id) {
        res.status(403).json({ error: 'Students may only view their own academic history.' });
        return;
      }
      onlyPublished = true;
    } else if (roleCode === 'parent') {
      const ward = db
        .prepare(`
          SELECT sg.can_view_academic_records
          FROM parents p
          INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
          WHERE p.school_id = ? AND p.user_id = ? AND p.status = 'active' AND sg.student_id = ?
          LIMIT 1
        `)
        .get(schoolId, req.auth!.id, studentId) as { can_view_academic_records: number } | undefined;
      if (!ward || ward.can_view_academic_records !== 1) {
        res.status(403).json({ error: 'Guardian permission required to access this student academic history.' });
        return;
      }
      onlyPublished = true;
    } else if (roleCode === 'teacher') {
      if (!isTeacherAuthorizedForStudent({ schoolId, userId: req.auth!.id, studentId })) {
        res.status(403).json({ error: 'You are not assigned to this student class.' });
        return;
      }
    }

    const classHistory = db
      .prepare(`
        SELECT h.*, fc.name AS from_class_name, tc.name AS to_class_name, ta.name AS to_arm_name
        FROM student_class_history h
        LEFT JOIN school_classes fc ON fc.id = h.from_class_id
        INNER JOIN school_classes tc ON tc.id = h.to_class_id
        LEFT JOIN class_arms ta ON ta.id = h.to_arm_id
        WHERE h.school_id = ? AND h.student_id = ?
        ORDER BY h.effective_date DESC, h.created_at DESC
      `)
      .all(schoolId, studentId);

    const subjectEnrollments = db
      .prepare(`
        SELECT sse.*, sub.name AS subject_name, sub.code AS subject_code, ses.name AS session_name, trm.name AS term_name, cls.name AS class_name
        FROM student_subject_enrollments sse
        INNER JOIN subjects sub ON sub.id = sse.subject_id
        INNER JOIN academic_sessions ses ON ses.id = sse.academic_session_id
        LEFT JOIN academic_terms trm ON trm.id = sse.academic_term_id
        INNER JOIN school_classes cls ON cls.id = sse.class_id
        WHERE sse.school_id = ? AND sse.student_id = ?
        ORDER BY ses.start_date DESC, sub.name ASC
      `)
      .all(schoolId, studentId);

    const termSummaries = db
      .prepare(`
        SELECT
          rp.*, ses.name AS session_name, trm.name AS term_name,
          cls.name AS class_name, arm.name AS arm_name,
          tc.comment AS teacher_comment, pc.comment AS principal_comment
        FROM result_publications rp
        INNER JOIN academic_sessions ses ON ses.id = rp.academic_session_id
        INNER JOIN academic_terms trm ON trm.id = rp.academic_term_id
        INNER JOIN school_classes cls ON cls.id = rp.class_id
        LEFT JOIN class_arms arm ON arm.id = rp.arm_id
        LEFT JOIN teacher_comments tc ON tc.school_id = rp.school_id AND tc.academic_term_id = rp.academic_term_id AND tc.student_id = rp.student_id
        LEFT JOIN principal_comments pc ON pc.school_id = rp.school_id AND pc.academic_term_id = rp.academic_term_id AND pc.student_id = rp.student_id
        WHERE rp.school_id = ? AND rp.student_id = ?
          ${onlyPublished ? "AND rp.status IN ('published', 'amended')" : ''}
        ORDER BY ses.start_date DESC, trm.term_order DESC
      `)
      .all(schoolId, studentId);

    const promotions = db
      .prepare(`
        SELECT pr.*, ses.name AS session_name, fc.name AS from_class_name, tc.name AS to_class_name
        FROM promotion_recommendations pr
        INNER JOIN academic_sessions ses ON ses.id = pr.academic_session_id
        INNER JOIN school_classes fc ON fc.id = pr.from_class_id
        LEFT JOIN school_classes tc ON tc.id = pr.recommended_to_class_id
        WHERE pr.school_id = ? AND pr.student_id = ?
        ORDER BY pr.created_at DESC
      `)
      .all(schoolId, studentId);

    res.json({
      student,
      classHistory,
      subjectEnrollments,
      termSummaries,
      promotions,
    });
  },
);
