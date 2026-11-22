import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../../db/client.ts';
import {
  validateAssessmentWeights,
  validateComponentScoreInput,
} from '../../../academics-engine.ts';
import { recordAuditLog } from '../../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../../middleware.ts';
import {
  createAssessmentCategorySchema,
  createAssessmentComponentSchema,
  createExaminationScheduleSchema,
  createExaminationSchema,
  reviewScoreBatchSchema,
  saveAssessmentScoresBatchSchema,
  updateAssessmentComponentSchema,
  upsertExaminationScoresSchema,
} from '../../../validation.ts';
import {
  ensureSchoolAcademicDefaults,
  isTeacherAuthorizedForSubjectClass,
  resolveEffectiveComponents,
} from './helpers.ts';

export const assessmentsExamsRouter = Router();

assessmentsExamsRouter.get(
  '/academics/assessment-categories',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const categories = db
      .prepare('SELECT * FROM assessment_categories WHERE school_id = ? ORDER BY display_order ASC, name ASC')
      .all(schoolId);
    res.json({ categories });
  },
);

assessmentsExamsRouter.post(
  '/academics/assessment-categories',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAssessmentCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid assessment category.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;
    const catId = `acat_${crypto.randomUUID()}`;

    try {
      db.prepare(`
        INSERT INTO assessment_categories (id, school_id, name, code, description, is_exam, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(catId, schoolId, d.name, d.code.toUpperCase(), d.description, d.isExam ? 1 : 0, d.displayOrder);
    } catch {
      res.status(409).json({ error: 'Assessment category code already exists for your school.' });
      return;
    }

    const created = db.prepare('SELECT * FROM assessment_categories WHERE id = ?').get(catId);
    res.status(201).json({ category: created });
  },
);

assessmentsExamsRouter.get(
  '/academics/assessment-components',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();

    const classId = typeof req.query.classId === 'string' && req.query.classId ? req.query.classId : null;
    const subjectId = typeof req.query.subjectId === 'string' && req.query.subjectId ? req.query.subjectId : null;
    const termId = typeof req.query.termId === 'string' && req.query.termId ? req.query.termId : null;

    const components = db
      .prepare(`
        SELECT
          ac.*, cat.name AS category_name, cat.code AS category_code, cat.is_exam,
          cls.name AS class_name, sub.name AS subject_name, trm.name AS term_name
        FROM assessment_components ac
        INNER JOIN assessment_categories cat ON cat.id = ac.category_id
        LEFT JOIN school_classes cls ON cls.id = ac.class_id
        LEFT JOIN subjects sub ON sub.id = ac.subject_id
        LEFT JOIN academic_terms trm ON trm.id = ac.academic_term_id
        WHERE ac.school_id = ?
        ORDER BY ac.class_id IS NOT NULL ASC, ac.subject_id IS NOT NULL ASC, cat.is_exam ASC, ac.display_order ASC
      `)
      .all(schoolId);

    const effective = resolveEffectiveComponents({
      schoolId,
      academicTermId: termId,
      classId,
      subjectId,
    });

    const effectiveCheck = validateAssessmentWeights(
      effective.map((c) => ({ id: c.id, name: c.name, weightPercentage: c.weight_percentage, isActive: true })),
      true,
    );

    res.json({
      components,
      effectiveComponents: effective,
      effectiveWeightValidation: effectiveCheck,
    });
  },
);

assessmentsExamsRouter.post(
  '/academics/assessment-components',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAssessmentComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid assessment component.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    const cat = db
      .prepare('SELECT id FROM assessment_categories WHERE id = ? AND school_id = ?')
      .get(d.categoryId, schoolId);
    if (!cat) {
      res.status(400).json({ error: 'Selected assessment category does not belong to your school.' });
      return;
    }

    const scopeSiblings = db
      .prepare(`
        SELECT id, name, weight_percentage, is_active
        FROM assessment_components
        WHERE school_id = ?
          AND COALESCE(academic_term_id, '') = COALESCE(?, '')
          AND COALESCE(class_id, '') = COALESCE(?, '')
          AND COALESCE(subject_id, '') = COALESCE(?, '')
          AND is_active = 1
      `)
      .all(
        schoolId,
        d.academicTermId || null,
        d.classId || null,
        d.subjectId || null,
      ) as Array<{ id: string; name: string; weight_percentage: number; is_active: number }>;

    const weightCheck = validateAssessmentWeights(
      [
        ...scopeSiblings.map((s) => ({
          id: s.id,
          name: s.name,
          weightPercentage: s.weight_percentage,
          isActive: s.is_active === 1,
        })),
        { name: d.name, weightPercentage: d.weightPercentage, isActive: true },
      ],
      false,
    );

    if (!weightCheck.ok) {
      res.status(400).json({ error: weightCheck.error });
      return;
    }

    const compId = `acmp_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO assessment_components (
        id, school_id, academic_session_id, academic_term_id, class_id, subject_id,
        category_id, name, max_score, weight_percentage, display_order, is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      compId,
      schoolId,
      d.academicSessionId || null,
      d.academicTermId || null,
      d.classId || null,
      d.subjectId || null,
      d.categoryId,
      d.name,
      d.maxScore,
      d.weightPercentage,
      d.displayOrder,
      req.auth!.id,
    );

    const created = db
      .prepare(`
        SELECT ac.*, cat.name AS category_name, cat.is_exam
        FROM assessment_components ac
        INNER JOIN assessment_categories cat ON cat.id = ac.category_id
        WHERE ac.id = ?
      `)
      .get(compId);

    res.status(201).json({ component: created, scopeTotalWeight: weightCheck.totalWeight });
  },
);

assessmentsExamsRouter.patch(
  '/academics/assessment-components/:componentId',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateAssessmentComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid component update.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM assessment_components WHERE id = ? AND school_id = ?')
      .get(req.params.componentId, schoolId) as
      | {
          id: string;
          academic_term_id: string | null;
          class_id: string | null;
          subject_id: string | null;
          name: string;
          max_score: number;
          weight_percentage: number;
          display_order: number;
          is_active: number;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Assessment component not found.' });
      return;
    }

    const nextActive = parsed.data.isActive !== undefined ? parsed.data.isActive : existing.is_active === 1;
    const nextWeight = parsed.data.weightPercentage ?? existing.weight_percentage;
    const nextName = parsed.data.name ?? existing.name;

    if (nextActive) {
      const siblings = db
        .prepare(`
          SELECT id, name, weight_percentage, is_active
          FROM assessment_components
          WHERE school_id = ? AND id != ?
            AND COALESCE(academic_term_id, '') = COALESCE(?, '')
            AND COALESCE(class_id, '') = COALESCE(?, '')
            AND COALESCE(subject_id, '') = COALESCE(?, '')
            AND is_active = 1
        `)
        .all(
          schoolId,
          existing.id,
          existing.academic_term_id,
          existing.class_id,
          existing.subject_id,
        ) as Array<{ id: string; name: string; weight_percentage: number; is_active: number }>;

      const check = validateAssessmentWeights(
        [
          ...siblings.map((s) => ({ id: s.id, name: s.name, weightPercentage: s.weight_percentage, isActive: true })),
          { id: existing.id, name: nextName, weightPercentage: nextWeight, isActive: true },
        ],
        false,
      );
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
    }

    db.prepare(`
      UPDATE assessment_components
      SET name = ?, max_score = ?, weight_percentage = ?, display_order = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      nextName,
      parsed.data.maxScore ?? existing.max_score,
      nextWeight,
      parsed.data.displayOrder ?? existing.display_order,
      nextActive ? 1 : 0,
      existing.id,
      schoolId,
    );

    const updated = db.prepare('SELECT * FROM assessment_components WHERE id = ?').get(existing.id);
    res.json({ component: updated });
  },
);

assessmentsExamsRouter.delete(
  '/academics/assessment-components/:componentId',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const used = db
      .prepare('SELECT 1 FROM assessment_scores WHERE school_id = ? AND component_id = ? LIMIT 1')
      .get(schoolId, req.params.componentId);
    if (used) {
      db.prepare("UPDATE assessment_components SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
        req.params.componentId,
        schoolId,
      );
      res.json({ ok: true, deactivated: true });
      return;
    }
    const del = db
      .prepare('DELETE FROM assessment_components WHERE id = ? AND school_id = ?')
      .run(req.params.componentId, schoolId);
    if (del.changes === 0) {
      res.status(404).json({ error: 'Assessment component not found.' });
      return;
    }
    res.json({ ok: true, deleted: true });
  },
);

// Teacher & School Admin Score Sheet & Submission Workflow
assessmentsExamsRouter.get(
  '/academics/scores/sheet',
  requirePermission('teacher.scores.enter'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const armId = typeof req.query.armId === 'string' && req.query.armId ? req.query.armId : null;
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : '';

    if (!academicTermId || !classId || !subjectId) {
      res.status(400).json({ error: 'academicTermId, classId, and subjectId are required.' });
      return;
    }

    if (
      req.auth!.roleCode === 'teacher' &&
      !isTeacherAuthorizedForSubjectClass({ schoolId, userId: req.auth!.id, classId, subjectId })
    ) {
      res.status(403).json({
        error: 'You are not assigned to enter scores for this class and subject.',
      });
      return;
    }

    const db = getDb();
    const term = db
      .prepare('SELECT id, academic_session_id, name, status FROM academic_terms WHERE id = ? AND school_id = ?')
      .get(academicTermId, schoolId) as
      | { id: string; academic_session_id: string; name: string; status: string }
      | undefined;

    if (!term) {
      res.status(404).json({ error: 'Academic term not found.' });
      return;
    }

    const components = resolveEffectiveComponents({ schoolId, academicTermId, classId, subjectId });

    const students = db
      .prepare(`
        SELECT s.id, s.admission_number, s.first_name, s.last_name, s.current_arm_id, arm.name AS arm_name
        FROM students s
        LEFT JOIN class_arms arm ON arm.id = s.current_arm_id
        WHERE s.school_id = ? AND s.status = 'active' AND s.current_class_id = ?
          ${armId ? 'AND s.current_arm_id = ?' : ''}
        ORDER BY s.last_name ASC, s.first_name ASC
      `)
      .all(...(armId ? [schoolId, classId, armId] : [schoolId, classId])) as Array<{
      id: string;
      admission_number: string;
      first_name: string;
      last_name: string;
      current_arm_id: string | null;
      arm_name: string | null;
    }>;

    const scores = db
      .prepare(`
        SELECT student_id, component_id, score, status, comment, updated_at
        FROM assessment_scores
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ? AND subject_id = ?
      `)
      .all(schoolId, academicTermId, classId, subjectId);

    const batch = db
      .prepare(`
        SELECT * FROM score_submission_batches
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ? AND subject_id = ?
          ${armId ? 'AND arm_id = ?' : 'AND arm_id IS NULL'}
        ORDER BY updated_at DESC LIMIT 1
      `)
      .get(...(armId ? [schoolId, academicTermId, classId, subjectId, armId] : [schoolId, academicTermId, classId, subjectId]));

    const publishedLock = db
      .prepare(`
        SELECT 1 FROM result_publications
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
          ${armId ? 'AND arm_id = ?' : ''}
          AND status IN ('published', 'amended')
        LIMIT 1
      `)
      .get(...(armId ? [schoolId, academicTermId, classId, armId] : [schoolId, academicTermId, classId]));

    res.json({
      term,
      components,
      students,
      scores,
      batch: batch ?? null,
      isPublishedLocked: Boolean(publishedLock),
    });
  },
);

assessmentsExamsRouter.post(
  '/academics/scores/batch',
  requireCsrfCheck,
  requirePermission('teacher.scores.enter'),
  (req: AuthenticatedRequest, res) => {
    const parsed = saveAssessmentScoresBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid score entry batch.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    if (
      req.auth!.roleCode === 'teacher' &&
      !isTeacherAuthorizedForSubjectClass({
        schoolId,
        userId: req.auth!.id,
        classId: d.classId,
        subjectId: d.subjectId,
      })
    ) {
      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId,
        authEnvironment: 'school',
        action: 'school.scores.unauthorized_entry_blocked',
        resourceType: 'assessment_scores',
        resourceId: `${d.classId}:${d.subjectId}`,
        outcome: 'denied',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({ error: 'You are not authorized to enter scores for this class or subject.' });
      return;
    }

    const term = db
      .prepare('SELECT id, academic_session_id, status FROM academic_terms WHERE id = ? AND school_id = ?')
      .get(d.academicTermId, schoolId) as
      | { id: string; academic_session_id: string; status: string }
      | undefined;

    if (!term) {
      res.status(404).json({ error: 'Academic term not found.' });
      return;
    }
    if (term.status === 'closed' || term.status === 'archived') {
      res.status(400).json({ error: 'Cannot edit scores inside a closed or archived term.' });
      return;
    }

    const publishedLock = db
      .prepare(`
        SELECT 1 FROM result_publications
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
          ${d.armId ? 'AND arm_id = ?' : ''}
          AND status IN ('published', 'amended')
        LIMIT 1
      `)
      .get(...(d.armId ? [schoolId, d.academicTermId, d.classId, d.armId] : [schoolId, d.academicTermId, d.classId]));

    if (publishedLock) {
      res.status(409).json({
        error: 'Results for this class and term are already published. Authorized post-publication corrections must use the Result Amendment workflow.',
      });
      return;
    }

    const components = resolveEffectiveComponents({
      schoolId,
      academicTermId: d.academicTermId,
      classId: d.classId,
      subjectId: d.subjectId,
    });
    const compMap = new Map(components.map((c) => [c.id, c]));

    db.exec('BEGIN IMMEDIATE');
    try {
      const existingBatch = db
        .prepare(`
          SELECT id FROM score_submission_batches
          WHERE school_id = ? AND academic_term_id = ? AND class_id = ? AND subject_id = ?
            ${d.armId ? 'AND arm_id = ?' : 'AND arm_id IS NULL'}
          LIMIT 1
        `)
        .get(...(d.armId ? [schoolId, d.academicTermId, d.classId, d.subjectId, d.armId] : [schoolId, d.academicTermId, d.classId, d.subjectId])) as
        | { id: string }
        | undefined;

      const batchId = existingBatch?.id ?? `sbt_${crypto.randomUUID()}`;
      const batchStatus = d.submitForReview ? 'submitted' : 'draft';

      if (existingBatch) {
        db.prepare(`
          UPDATE score_submission_batches
          SET status = ?, submitted_by_user_id = ?, submitted_at = CASE WHEN ? = 'submitted' THEN datetime('now') ELSE submitted_at END, updated_at = datetime('now')
          WHERE id = ? AND school_id = ?
        `).run(batchStatus, req.auth!.id, batchStatus, batchId, schoolId);
      } else {
        db.prepare(`
          INSERT INTO score_submission_batches (
            id, school_id, academic_session_id, academic_term_id, class_id, arm_id, subject_id,
            submitted_by_user_id, status, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'submitted' THEN datetime('now') ELSE NULL END)
        `).run(
          batchId,
          schoolId,
          term.academic_session_id,
          d.academicTermId,
          d.classId,
          d.armId || null,
          d.subjectId,
          req.auth!.id,
          batchStatus,
          batchStatus,
        );
      }

      for (const entry of d.entries) {
        const stu = db
          .prepare('SELECT id FROM students WHERE id = ? AND school_id = ? AND current_class_id = ?')
          .get(entry.studentId, schoolId, d.classId);
        if (!stu) {
          throw new Error('Selected student does not belong to this school or class.');
        }
        const comp = compMap.get(entry.componentId);
        if (!comp) {
          throw new Error('Invalid or inactive assessment component for this subject/class.');
        }

        const validation = validateComponentScoreInput({
          score: entry.score,
          status: entry.status,
          maxScore: comp.max_score,
        });
        if (!validation.ok) {
          throw new Error(validation.error);
        }

        const prev = db
          .prepare(`
            SELECT id, score, status FROM assessment_scores
            WHERE school_id = ? AND academic_term_id = ? AND student_id = ? AND subject_id = ? AND component_id = ?
          `)
          .get(schoolId, d.academicTermId, entry.studentId, d.subjectId, entry.componentId) as
          | { id: string; score: number | null; status: string }
          | undefined;

        const scoreId = prev?.id ?? `asc_${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO assessment_scores (
            id, school_id, academic_session_id, academic_term_id, class_id, subject_id,
            student_id, component_id, batch_id, score, status, comment, entered_by_user_id, updated_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(school_id, academic_term_id, student_id, subject_id, component_id) DO UPDATE SET
            batch_id = excluded.batch_id,
            score = excluded.score,
            status = excluded.status,
            comment = excluded.comment,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = datetime('now')
        `).run(
          scoreId,
          schoolId,
          term.academic_session_id,
          d.academicTermId,
          d.classId,
          d.subjectId,
          entry.studentId,
          entry.componentId,
          batchId,
          validation.normalizedScore,
          entry.status,
          entry.comment,
          req.auth!.id,
          req.auth!.id,
        );

        if (!prev || prev.score !== validation.normalizedScore || prev.status !== entry.status) {
          db.prepare(`
            INSERT INTO assessment_score_history (
              id, school_id, assessment_score_id, student_id, subject_id, component_id, academic_term_id,
              old_score, new_score, old_status, new_status, reason, actor_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `ash_${crypto.randomUUID()}`,
            schoolId,
            scoreId,
            entry.studentId,
            d.subjectId,
            entry.componentId,
            d.academicTermId,
            prev?.score ?? null,
            validation.normalizedScore,
            prev?.status ?? '',
            entry.status,
            d.reason || (d.submitForReview ? 'Score submission' : 'Draft save'),
            req.auth!.id,
          );
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save assessment scores.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: d.submitForReview ? 'school.scores.submitted' : 'school.scores.draft_saved',
      resourceType: 'assessment_scores',
      resourceId: `${d.classId}:${d.subjectId}`,
      outcome: 'success',
      metadata: { count: d.entries.length, academicTermId: d.academicTermId },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, savedCount: d.entries.length, status: d.submitForReview ? 'submitted' : 'draft' });
  },
);

assessmentsExamsRouter.get(
  '/academics/score-batches',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const termId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const isTeacher = req.auth!.roleCode === 'teacher';

    const batches = db
      .prepare(`
        SELECT
          sb.*,
          cls.name AS class_name, arm.name AS arm_name,
          sub.name AS subject_name, sub.code AS subject_code,
          trm.name AS term_name, ses.name AS session_name,
          u.full_name AS submitted_by_name
        FROM score_submission_batches sb
        INNER JOIN school_classes cls ON cls.id = sb.class_id
        LEFT JOIN class_arms arm ON arm.id = sb.arm_id
        INNER JOIN subjects sub ON sub.id = sb.subject_id
        INNER JOIN academic_terms trm ON trm.id = sb.academic_term_id
        INNER JOIN academic_sessions ses ON ses.id = sb.academic_session_id
        LEFT JOIN users u ON u.id = sb.submitted_by_user_id
        WHERE sb.school_id = ?
          ${termId ? 'AND sb.academic_term_id = ?' : ''}
          ${isTeacher ? 'AND sb.submitted_by_user_id = ?' : ''}
        ORDER BY sb.updated_at DESC
        LIMIT 120
      `)
      .all(
        ...[schoolId, ...(termId ? [termId] : []), ...(isTeacher ? [req.auth!.id] : [])],
      );

    res.json({ batches });
  },
);

assessmentsExamsRouter.patch(
  '/academics/score-batches/:batchId/review',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = reviewScoreBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid review decision.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM score_submission_batches WHERE id = ? AND school_id = ?')
      .get(req.params.batchId, schoolId);
    if (!existing) {
      res.status(404).json({ error: 'Score submission batch not found.' });
      return;
    }

    db.prepare(`
      UPDATE score_submission_batches
      SET status = ?, review_notes = ?, reviewed_by_user_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(parsed.data.decision, parsed.data.reviewNotes, req.auth!.id, req.params.batchId, schoolId);

    res.json({ ok: true, status: parsed.data.decision });
  },
);

assessmentsExamsRouter.get(
  '/academics/scores/history',
  requirePermission('teacher.scores.enter'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const isTeacher = req.auth!.roleCode === 'teacher';

    const history = db
      .prepare(`
        SELECT
          h.*,
          st.admission_number, st.first_name, st.last_name,
          sub.name AS subject_name, sub.code AS subject_code,
          ac.name AS component_name, trm.name AS term_name,
          u.full_name AS actor_name
        FROM assessment_score_history h
        INNER JOIN students st ON st.id = h.student_id
        INNER JOIN subjects sub ON sub.id = h.subject_id
        INNER JOIN assessment_components ac ON ac.id = h.component_id
        INNER JOIN academic_terms trm ON trm.id = h.academic_term_id
        LEFT JOIN users u ON u.id = h.actor_user_id
        WHERE h.school_id = ?
          ${isTeacher ? 'AND h.actor_user_id = ?' : ''}
        ORDER BY h.created_at DESC
        LIMIT 120
      `)
      .all(...(isTeacher ? [schoolId, req.auth!.id] : [schoolId]));

    res.json({ history });
  },
);

// Examinations & Schedules & Exam Score Sync
assessmentsExamsRouter.get(
  '/academics/examinations',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const termId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';

    const examinations = db
      .prepare(`
        SELECT
          e.*, trm.name AS term_name, ses.name AS session_name,
          (SELECT COUNT(*) FROM examination_schedules es WHERE es.examination_id = e.id AND es.school_id = e.school_id) AS schedules_count
        FROM examinations e
        INNER JOIN academic_terms trm ON trm.id = e.academic_term_id
        INNER JOIN academic_sessions ses ON ses.id = e.academic_session_id
        WHERE e.school_id = ?
          ${termId ? 'AND e.academic_term_id = ?' : ''}
        ORDER BY e.start_date DESC, e.created_at DESC
      `)
      .all(...(termId ? [schoolId, termId] : [schoolId]));

    res.json({ examinations });
  },
);

assessmentsExamsRouter.post(
  '/academics/examinations',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createExaminationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid examination payload.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    const term = db
      .prepare('SELECT id, academic_session_id FROM academic_terms WHERE id = ? AND school_id = ?')
      .get(d.academicTermId, schoolId) as { id: string; academic_session_id: string } | undefined;
    if (!term) {
      res.status(404).json({ error: 'Academic term not found.' });
      return;
    }

    const examId = `exm_${crypto.randomUUID()}`;
    try {
      db.prepare(`
        INSERT INTO examinations (
          id, school_id, academic_session_id, academic_term_id, title, exam_type,
          description, start_date, end_date, max_score, status, is_cbt_ready, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        examId,
        schoolId,
        term.academic_session_id,
        d.academicTermId,
        d.title,
        d.examType,
        d.description,
        d.startDate,
        d.endDate,
        d.maxScore,
        d.status,
        req.auth!.id,
      );
    } catch {
      res.status(409).json({ error: 'An examination with this title already exists for this term.' });
      return;
    }

    const created = db.prepare('SELECT * FROM examinations WHERE id = ?').get(examId);
    res.status(201).json({ examination: created });
  },
);

assessmentsExamsRouter.patch(
  '/academics/examinations/:examId/status',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!['draft', 'scheduled', 'in_progress', 'completed', 'under_review', 'published'].includes(status)) {
      res.status(400).json({ error: 'Invalid examination status.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const upd = db
      .prepare("UPDATE examinations SET status = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?")
      .run(status, req.params.examId, schoolId);
    if (upd.changes === 0) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }
    res.json({ ok: true, status });
  },
);

assessmentsExamsRouter.get(
  '/academics/examinations/:examId/schedules',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();

    const exam = db
      .prepare('SELECT * FROM examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId);
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const schedules = db
      .prepare(`
        SELECT
          es.*,
          cls.name AS class_name, arm.name AS arm_name,
          sub.name AS subject_name, sub.code AS subject_code,
          t.first_name || ' ' || t.last_name AS invigilator_name
        FROM examination_schedules es
        INNER JOIN school_classes cls ON cls.id = es.class_id
        LEFT JOIN class_arms arm ON arm.id = es.arm_id
        INNER JOIN subjects sub ON sub.id = es.subject_id
        LEFT JOIN teachers t ON t.id = es.invigilator_teacher_id
        WHERE es.school_id = ? AND es.examination_id = ?
        ORDER BY es.exam_date ASC, es.start_time ASC
      `)
      .all(schoolId, req.params.examId);

    const scores = db
      .prepare(`
        SELECT exs.*, st.admission_number, st.first_name, st.last_name, sub.name AS subject_name
        FROM examination_scores exs
        INNER JOIN students st ON st.id = exs.student_id
        INNER JOIN subjects sub ON sub.id = exs.subject_id
        WHERE exs.school_id = ? AND exs.examination_id = ?
        ORDER BY sub.name ASC, st.last_name ASC
      `)
      .all(schoolId, req.params.examId);

    res.json({ examination: exam, schedules, scores });
  },
);

assessmentsExamsRouter.post(
  '/academics/examinations/:examId/schedules',
  requireCsrfCheck,
  requirePermission('school.assessments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createExaminationScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid examination schedule.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const exam = db
      .prepare('SELECT id FROM examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId);
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const d = parsed.data;
    const schedId = `exs_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO examination_schedules (
        id, school_id, examination_id, class_id, arm_id, subject_id,
        exam_date, start_time, duration_minutes, venue, max_score, invigilator_teacher_id, instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schedId,
      schoolId,
      req.params.examId,
      d.classId,
      d.armId || null,
      d.subjectId,
      d.examDate,
      d.startTime,
      d.durationMinutes,
      d.venue,
      d.maxScore,
      d.invigilatorTeacherId || null,
      d.instructions,
    );

    const created = db.prepare('SELECT * FROM examination_schedules WHERE id = ?').get(schedId);
    res.status(201).json({ schedule: created });
  },
);

assessmentsExamsRouter.post(
  '/academics/examinations/:examId/scores',
  requireCsrfCheck,
  requirePermission('teacher.scores.enter'),
  (req: AuthenticatedRequest, res) => {
    const parsed = upsertExaminationScoresSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid examination scores.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const exam = db
      .prepare('SELECT id, academic_session_id, academic_term_id, max_score FROM examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId) as
      | { id: string; academic_session_id: string; academic_term_id: string; max_score: number }
      | undefined;

    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const d = parsed.data;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const entry of d.entries) {
        if (entry.score !== null && (entry.score < 0 || entry.score > exam.max_score)) {
          throw new Error(`Examination score (${entry.score}) must be between 0 and ${exam.max_score}.`);
        }
        db.prepare(`
          INSERT INTO examination_scores (
            id, school_id, examination_id, schedule_id, student_id, subject_id,
            academic_session_id, academic_term_id, score, max_score, status, entered_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(school_id, examination_id, student_id, subject_id) DO UPDATE SET
            score = excluded.score,
            status = excluded.status,
            entered_by_user_id = excluded.entered_by_user_id,
            updated_at = datetime('now')
        `).run(
          `exs_${crypto.randomUUID()}`,
          schoolId,
          exam.id,
          d.scheduleId || null,
          entry.studentId,
          d.subjectId,
          exam.academic_session_id,
          exam.academic_term_id,
          entry.status === 'absent' ? 0 : entry.score,
          exam.max_score,
          entry.status,
          req.auth!.id,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save examination scores.' });
      return;
    }

    res.json({ ok: true, count: d.entries.length });
  },
);
