import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../../db/client.ts';
import {
  buildSimpleTabularPdf,
  validateComponentScoreInput,
  validateGradingBands,
} from '../../../academics-engine.ts';
import { recordAuditLog } from '../../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../../middleware.ts';
import {
  amendPublishedResultSchema,
  computeResultsSchema,
  createGradingSystemSchema,
  publishResultsSchema,
} from '../../../validation.ts';
import {
  ensureSchoolAcademicDefaults,
  recomputeClassTermResults,
} from './helpers.ts';

export const gradingResultsRouter = Router();

gradingResultsRouter.get(
  '/academics/grading-systems',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();

    const systems = db
      .prepare(`
        SELECT gs.*, cls.name AS class_name
        FROM grading_systems gs
        LEFT JOIN school_classes cls ON cls.id = gs.class_id
        WHERE gs.school_id = ?
        ORDER BY gs.is_default DESC, gs.created_at DESC
      `)
      .all(schoolId) as Array<Record<string, unknown> & { id: string }>;

    const bands = db
      .prepare(`
        SELECT * FROM grading_bands
        WHERE school_id = ?
        ORDER BY min_score DESC, display_order ASC
      `)
      .all(schoolId) as Array<Record<string, unknown> & { grading_system_id: string }>;

    const bandsBySystem = new Map<string, Array<Record<string, unknown>>>();
    for (const band of bands) {
      const list = bandsBySystem.get(band.grading_system_id) ?? [];
      list.push(band);
      bandsBySystem.set(band.grading_system_id, list);
    }

    res.json({
      gradingSystems: systems.map((s) => ({
        ...s,
        bands: bandsBySystem.get(s.id) ?? [],
      })),
    });
  },
);

gradingResultsRouter.post(
  '/academics/grading-systems',
  requireCsrfCheck,
  requirePermission('school.grading.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createGradingSystemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid grading system.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    const validation = validateGradingBands(d.bands, d.requireFullCoverage);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const gsId = `grs_${crypto.randomUUID()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.isDefault) {
        db.prepare('UPDATE grading_systems SET is_default = 0 WHERE school_id = ?').run(schoolId);
      }

      db.prepare(`
        INSERT INTO grading_systems (
          id, school_id, name, description, section_scope, class_id,
          is_default, require_full_coverage, is_active, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        gsId,
        schoolId,
        d.name,
        d.description,
        d.sectionScope,
        d.classId || null,
        d.isDefault ? 1 : 0,
        d.requireFullCoverage ? 1 : 0,
        req.auth!.id,
      );

      const insertBand = db.prepare(`
        INSERT INTO grading_bands (
          id, school_id, grading_system_id, min_score, max_score, grade, remark, grade_point, is_passing, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      validation.sortedBands.forEach((band, idx) => {
        insertBand.run(
          `grb_${crypto.randomUUID()}`,
          schoolId,
          gsId,
          band.minScore,
          band.maxScore,
          band.grade,
          band.remark,
          band.gradePoint,
          band.isPassing ? 1 : 0,
          idx + 1,
        );
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(409).json({
        error: err instanceof Error && err.message.includes('UNIQUE')
          ? 'A grading system with this name already exists.'
          : err instanceof Error
            ? err.message
            : 'Unable to create grading system.',
      });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.grading_system.created',
      resourceType: 'grading_system',
      resourceId: gsId,
      outcome: 'success',
      metadata: { name: d.name },
      ipAddress: getClientIp(req),
    });

    const created = db.prepare('SELECT * FROM grading_systems WHERE id = ?').get(gsId);
    const createdBands = db.prepare('SELECT * FROM grading_bands WHERE grading_system_id = ? ORDER BY min_score DESC').all(gsId);
    res.status(201).json({ gradingSystem: { ...created, bands: createdBands } });
  },
);

gradingResultsRouter.patch(
  '/academics/grading-systems/:id/default',
  requireCsrfCheck,
  requirePermission('school.grading.manage'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const target = db
      .prepare('SELECT id FROM grading_systems WHERE id = ? AND school_id = ?')
      .get(req.params.id, schoolId);
    if (!target) {
      res.status(404).json({ error: 'Grading system not found.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE grading_systems SET is_default = 0 WHERE school_id = ?').run(schoolId);
      db.prepare("UPDATE grading_systems SET is_default = 1, is_active = 1, updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
        req.params.id,
        schoolId,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to set default grading system.' });
      return;
    }

    res.json({ ok: true, id: req.params.id });
  },
);

// Server-side Results Computation Engine
gradingResultsRouter.post(
  '/academics/results/compute',
  requireCsrfCheck,
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const parsed = computeResultsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid computation request.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    let summary: ReturnType<typeof recomputeClassTermResults>;
    db.exec('BEGIN IMMEDIATE');
    try {
      summary = recomputeClassTermResults({
        db,
        schoolId,
        academicTermId: d.academicTermId,
        classId: d.classId,
        armId: d.armId,
        gradingSystemId: d.gradingSystemId,
        actorUserId: req.auth!.id,
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Result computation failed.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.results.computed',
      resourceType: 'computed_results',
      resourceId: `${d.academicTermId}:${d.classId}`,
      outcome: 'success',
      metadata: summary,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, summary });
  },
);

gradingResultsRouter.get(
  '/academics/results',
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';

    if (!academicTermId) {
      res.status(400).json({ error: 'academicTermId query parameter is required.' });
      return;
    }

    const publications = db
      .prepare(`
        SELECT
          rp.*,
          st.admission_number, st.first_name, st.last_name,
          cls.name AS class_name, arm.name AS arm_name,
          gs.name AS grading_system_name
        FROM result_publications rp
        INNER JOIN students st ON st.id = rp.student_id
        INNER JOIN school_classes cls ON cls.id = rp.class_id
        LEFT JOIN class_arms arm ON arm.id = rp.arm_id
        LEFT JOIN grading_systems gs ON gs.id = rp.grading_system_id
        WHERE rp.school_id = ? AND rp.academic_term_id = ?
          ${classId ? 'AND rp.class_id = ?' : ''}
          ${studentId ? 'AND rp.student_id = ?' : ''}
        ORDER BY rp.class_position ASC, st.last_name ASC
      `)
      .all(
        ...[schoolId, academicTermId, ...(classId ? [classId] : []), ...(studentId ? [studentId] : [])],
      );

    const subjectResults = db
      .prepare(`
        SELECT
          cr.*,
          st.admission_number, st.first_name, st.last_name,
          sub.name AS subject_name, sub.code AS subject_code
        FROM computed_results cr
        INNER JOIN students st ON st.id = cr.student_id
        INNER JOIN subjects sub ON sub.id = cr.subject_id
        WHERE cr.school_id = ? AND cr.academic_term_id = ?
          ${classId ? 'AND cr.class_id = ?' : ''}
          ${studentId ? 'AND cr.student_id = ?' : ''}
        ORDER BY st.last_name ASC, sub.name ASC
      `)
      .all(
        ...[schoolId, academicTermId, ...(classId ? [classId] : []), ...(studentId ? [studentId] : [])],
      );

    res.json({ publications, subjectResults });
  },
);

// Review / Approve / Publish Results
gradingResultsRouter.post(
  '/academics/results/publish',
  requireCsrfCheck,
  requirePermission('school.results.publish'),
  (req: AuthenticatedRequest, res) => {
    const parsed = publishResultsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid publication request.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    const existingCount = db
      .prepare(`
        SELECT COUNT(*) AS count FROM result_publications
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
          ${d.armId ? 'AND arm_id = ?' : ''}
      `)
      .get(...(d.armId ? [schoolId, d.academicTermId, d.classId, d.armId] : [schoolId, d.academicTermId, d.classId])) as {
      count: number;
    };

    if (existingCount.count === 0) {
      res.status(400).json({ error: 'Compute results for this class and term before publishing.' });
      return;
    }

    const pubStatus =
      d.action === 'mark_under_review'
        ? 'under_review'
        : d.action === 'approve'
          ? 'draft'
          : 'published';
    const crStatus =
      d.action === 'mark_under_review'
        ? 'under_review'
        : d.action === 'approve'
          ? 'approved'
          : 'published';

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE result_publications
        SET status = CASE WHEN status = 'amended' AND ? = 'published' THEN 'amended' ELSE ? END,
            published_by_user_id = CASE WHEN ? = 'published' THEN ? ELSE published_by_user_id END,
            published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
            updated_at = datetime('now')
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
          ${d.armId ? 'AND arm_id = ?' : ''}
      `).run(
        pubStatus,
        pubStatus,
        pubStatus,
        req.auth!.id,
        pubStatus,
        ...(d.armId ? [schoolId, d.academicTermId, d.classId, d.armId] : [schoolId, d.academicTermId, d.classId]),
      );

      db.prepare(`
        UPDATE computed_results
        SET status = CASE WHEN status = 'amended' AND ? = 'published' THEN 'amended' ELSE ? END,
            approved_by_user_id = CASE WHEN ? IN ('approved', 'published') THEN ? ELSE approved_by_user_id END,
            approved_at = CASE WHEN ? IN ('approved', 'published') THEN COALESCE(approved_at, datetime('now')) ELSE approved_at END,
            published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
            updated_at = datetime('now')
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
          ${d.armId ? 'AND arm_id = ?' : ''}
      `).run(
        crStatus,
        crStatus,
        crStatus,
        req.auth!.id,
        crStatus,
        crStatus,
        ...(d.armId ? [schoolId, d.academicTermId, d.classId, d.armId] : [schoolId, d.academicTermId, d.classId]),
      );

      if (d.action === 'publish') {
        db.prepare(`
          UPDATE score_submission_batches
          SET status = 'published', updated_at = datetime('now')
          WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
            ${d.armId ? 'AND arm_id = ?' : ''}
        `).run(
          ...(d.armId ? [schoolId, d.academicTermId, d.classId, d.armId] : [schoolId, d.academicTermId, d.classId]),
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to update publication status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: `school.results.${d.action}`,
      resourceType: 'result_publications',
      resourceId: `${d.academicTermId}:${d.classId}`,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, action: d.action, count: existingCount.count });
  },
);

// Audited Post-Publication Result Amendments
gradingResultsRouter.get(
  '/academics/results/amendments',
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';

    const amendments = db
      .prepare(`
        SELECT
          ra.*,
          st.admission_number, st.first_name, st.last_name,
          sub.name AS subject_name, sub.code AS subject_code,
          trm.name AS term_name,
          u.full_name AS amended_by_name
        FROM result_amendments ra
        INNER JOIN students st ON st.id = ra.student_id
        INNER JOIN subjects sub ON sub.id = ra.subject_id
        INNER JOIN academic_terms trm ON trm.id = ra.academic_term_id
        LEFT JOIN users u ON u.id = ra.amended_by_user_id
        WHERE ra.school_id = ?
          ${academicTermId ? 'AND ra.academic_term_id = ?' : ''}
        ORDER BY ra.created_at DESC
        LIMIT 100
      `)
      .all(...(academicTermId ? [schoolId, academicTermId] : [schoolId]));

    res.json({ amendments });
  },
);

gradingResultsRouter.post(
  '/academics/results/amend',
  requireCsrfCheck,
  requirePermission('school.results.amend'),
  (req: AuthenticatedRequest, res) => {
    const parsed = amendPublishedResultSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid amendment payload.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    const existingResult = db
      .prepare('SELECT * FROM computed_results WHERE id = ? AND school_id = ?')
      .get(d.computedResultId, schoolId) as
      | {
          id: string;
          academic_session_id: string;
          academic_term_id: string;
          class_id: string;
          arm_id: string | null;
          student_id: string;
          subject_id: string;
          grading_system_id: string;
          total_score: number;
          percentage_score: number;
          grade: string;
          status: string;
        }
      | undefined;

    if (!existingResult) {
      res.status(404).json({ error: 'Computed result record not found.' });
      return;
    }

    const comp = db
      .prepare('SELECT id, max_score FROM assessment_components WHERE id = ? AND school_id = ?')
      .get(d.componentId, schoolId) as { id: string; max_score: number } | undefined;
    if (!comp) {
      res.status(404).json({ error: 'Assessment component not found.' });
      return;
    }

    const scoreValidation = validateComponentScoreInput({
      score: d.newScore,
      status: d.newStatus,
      maxScore: comp.max_score,
    });
    if (!scoreValidation.ok) {
      res.status(400).json({ error: scoreValidation.error });
      return;
    }

    const pub = db
      .prepare('SELECT id, average_score, class_position FROM result_publications WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
      .get(schoolId, existingResult.academic_term_id, existingResult.student_id) as
      | { id: string; average_score: number; class_position: number | null }
      | undefined;

    const oldSnapshot = {
      totalScore: existingResult.total_score,
      percentageScore: existingResult.percentage_score,
      grade: existingResult.grade,
      averageScore: pub?.average_score ?? null,
    };

    db.exec('BEGIN IMMEDIATE');
    try {
      const prevScore = db
        .prepare(`
          SELECT id, score, status FROM assessment_scores
          WHERE school_id = ? AND academic_term_id = ? AND student_id = ? AND subject_id = ? AND component_id = ?
        `)
        .get(
          schoolId,
          existingResult.academic_term_id,
          existingResult.student_id,
          existingResult.subject_id,
          comp.id,
        ) as { id: string; score: number | null; status: string } | undefined;

      const scoreId = prevScore?.id ?? `asc_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO assessment_scores (
          id, school_id, academic_session_id, academic_term_id, class_id, subject_id,
          student_id, component_id, score, status, comment, entered_by_user_id, updated_by_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(school_id, academic_term_id, student_id, subject_id, component_id) DO UPDATE SET
          score = excluded.score,
          status = excluded.status,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = datetime('now')
      `).run(
        scoreId,
        schoolId,
        existingResult.academic_session_id,
        existingResult.academic_term_id,
        existingResult.class_id,
        existingResult.subject_id,
        existingResult.student_id,
        comp.id,
        scoreValidation.normalizedScore,
        d.newStatus,
        `Amended: ${d.reason}`,
        req.auth!.id,
        req.auth!.id,
      );

      db.prepare(`
        INSERT INTO assessment_score_history (
          id, school_id, assessment_score_id, student_id, subject_id, component_id, academic_term_id,
          old_score, new_score, old_status, new_status, reason, actor_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ash_${crypto.randomUUID()}`,
        schoolId,
        scoreId,
        existingResult.student_id,
        existingResult.subject_id,
        comp.id,
        existingResult.academic_term_id,
        prevScore?.score ?? null,
        scoreValidation.normalizedScore,
        prevScore?.status ?? '',
        d.newStatus,
        d.reason,
        req.auth!.id,
      );

      recomputeClassTermResults({
        db,
        schoolId,
        academicTermId: existingResult.academic_term_id,
        classId: existingResult.class_id,
        armId: existingResult.arm_id,
        gradingSystemId: existingResult.grading_system_id,
        actorUserId: req.auth!.id,
        allowAmendPublished: true,
      });

      const updatedResult = db
        .prepare('SELECT total_score, percentage_score, grade FROM computed_results WHERE id = ?')
        .get(existingResult.id) as { total_score: number; percentage_score: number; grade: string };

      const updatedPub = db
        .prepare('SELECT id, average_score FROM result_publications WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
        .get(schoolId, existingResult.academic_term_id, existingResult.student_id) as
        | { id: string; average_score: number }
        | undefined;

      db.prepare(`
        INSERT INTO result_amendments (
          id, school_id, academic_term_id, student_id, subject_id, computed_result_id,
          result_publication_id, old_values_json, new_values_json, reason, amended_by_user_id, approved_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ram_${crypto.randomUUID()}`,
        schoolId,
        existingResult.academic_term_id,
        existingResult.student_id,
        existingResult.subject_id,
        existingResult.id,
        updatedPub?.id ?? pub?.id ?? null,
        JSON.stringify(oldSnapshot),
        JSON.stringify({
          totalScore: updatedResult.total_score,
          percentageScore: updatedResult.percentage_score,
          grade: updatedResult.grade,
          averageScore: updatedPub?.average_score ?? null,
        }),
        d.reason,
        req.auth!.id,
        req.auth!.id,
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to amend result.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.results.amended',
      resourceType: 'computed_result',
      resourceId: existingResult.id,
      outcome: 'success',
      metadata: { reason: d.reason, componentId: d.componentId },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);

// Class Broadsheet + CSV & PDF Export
function loadBroadsheetPayload(params: {
  schoolId: string;
  academicTermId: string;
  classId: string;
  armId?: string | null;
}) {
  const db = getDb();
  const school = db.prepare('SELECT name, code FROM schools WHERE id = ?').get(params.schoolId) as {
    name: string;
    code: string;
  };
  const term = db
    .prepare(`
      SELECT t.id, t.name AS term_name, s.name AS session_name
      FROM academic_terms t
      INNER JOIN academic_sessions s ON s.id = t.academic_session_id
      WHERE t.id = ? AND t.school_id = ?
    `)
    .get(params.academicTermId, params.schoolId) as
    | { id: string; term_name: string; session_name: string }
    | undefined;
  const classRow = db
    .prepare('SELECT id, name FROM school_classes WHERE id = ? AND school_id = ?')
    .get(params.classId, params.schoolId) as { id: string; name: string } | undefined;

  if (!term || !classRow) return null;

  const subjects = db
    .prepare(`
      SELECT DISTINCT sub.id, sub.code, sub.name
      FROM computed_results cr
      INNER JOIN subjects sub ON sub.id = cr.subject_id
      WHERE cr.school_id = ? AND cr.academic_term_id = ? AND cr.class_id = ?
        ${params.armId ? 'AND cr.arm_id = ?' : ''}
      ORDER BY sub.name ASC
    `)
    .all(
      ...(params.armId
        ? [params.schoolId, params.academicTermId, params.classId, params.armId]
        : [params.schoolId, params.academicTermId, params.classId]),
    ) as Array<{ id: string; code: string; name: string }>;

  const publications = db
    .prepare(`
      SELECT
        rp.*, st.admission_number, st.first_name, st.last_name, arm.name AS arm_name
      FROM result_publications rp
      INNER JOIN students st ON st.id = rp.student_id
      LEFT JOIN class_arms arm ON arm.id = rp.arm_id
      WHERE rp.school_id = ? AND rp.academic_term_id = ? AND rp.class_id = ?
        ${params.armId ? 'AND rp.arm_id = ?' : ''}
      ORDER BY rp.class_position ASC, st.last_name ASC
    `)
    .all(
      ...(params.armId
        ? [params.schoolId, params.academicTermId, params.classId, params.armId]
        : [params.schoolId, params.academicTermId, params.classId]),
    ) as Array<{
    student_id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    arm_name: string | null;
    subjects_count: number;
    subjects_passed: number;
    total_score_obtained: number;
    average_score: number;
    overall_grade: string;
    class_position: number | null;
    status: string;
  }>;

  const rawScores = db
    .prepare(`
      SELECT student_id, subject_id, total_score, percentage_score, grade
      FROM computed_results
      WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
        ${params.armId ? 'AND arm_id = ?' : ''}
    `)
    .all(
      ...(params.armId
        ? [params.schoolId, params.academicTermId, params.classId, params.armId]
        : [params.schoolId, params.academicTermId, params.classId]),
    ) as Array<{
    student_id: string;
    subject_id: string;
    total_score: number;
    percentage_score: number;
    grade: string;
  }>;

  const scoreLookup = new Map<string, Record<string, { score: number; grade: string }>>();
  for (const r of rawScores) {
    const map = scoreLookup.get(r.student_id) ?? {};
    map[r.subject_id] = { score: r.percentage_score, grade: r.grade };
    scoreLookup.set(r.student_id, map);
  }

  return {
    school,
    term,
    classRow,
    subjects,
    rows: publications.map((p) => ({
      ...p,
      subjectScores: scoreLookup.get(p.student_id) ?? {},
    })),
  };
}

gradingResultsRouter.get(
  '/academics/broadsheet',
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const armId = typeof req.query.armId === 'string' && req.query.armId ? req.query.armId : null;

    if (!academicTermId || !classId) {
      res.status(400).json({ error: 'academicTermId and classId are required.' });
      return;
    }

    const payload = loadBroadsheetPayload({ schoolId, academicTermId, classId, armId });
    if (!payload) {
      res.status(404).json({ error: 'Term or class not found.' });
      return;
    }
    res.json(payload);
  },
);

gradingResultsRouter.get(
  '/academics/broadsheet/export.csv',
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const armId = typeof req.query.armId === 'string' && req.query.armId ? req.query.armId : null;

    const payload = loadBroadsheetPayload({ schoolId, academicTermId, classId, armId });
    if (!payload) {
      res.status(404).json({ error: 'Broadsheet scope not found.' });
      return;
    }

    const headers = [
      'Pos',
      'Admission No',
      'Student Name',
      ...payload.subjects.map((s) => `${s.code} (%)`),
      'Total',
      'Average (%)',
      'Grade',
      'Status',
    ];
    const csvLines = [headers.join(',')];

    for (const row of payload.rows) {
      const cells = [
        String(row.class_position ?? '-'),
        `"${row.admission_number}"`,
        `"${row.first_name} ${row.last_name}"`,
        ...payload.subjects.map((s) => {
          const item = row.subjectScores[s.id];
          return item ? `${item.score} (${item.grade})` : '-';
        }),
        String(row.total_score_obtained),
        String(row.average_score),
        row.overall_grade,
        row.status,
      ];
      csvLines.push(cells.join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="broadsheet-${payload.classRow.name.replace(/\s+/g, '-')}.csv"`,
    );
    res.send(csvLines.join('\n'));
  },
);

gradingResultsRouter.get(
  '/academics/broadsheet/export.pdf',
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const armId = typeof req.query.armId === 'string' && req.query.armId ? req.query.armId : null;

    const payload = loadBroadsheetPayload({ schoolId, academicTermId, classId, armId });
    if (!payload) {
      res.status(404).json({ error: 'Broadsheet scope not found.' });
      return;
    }

    const pdf = buildSimpleTabularPdf({
      title: `${payload.school.name} - Academic Broadsheet`,
      subtitle: `${payload.term.session_name} | ${payload.term.term_name} | Class: ${payload.classRow.name}`,
      metaLines: [
        `School Code: ${payload.school.code}`,
        `Total Students Ranked: ${payload.rows.length} | Subjects Assessed: ${payload.subjects.length}`,
      ],
      columns: [
        { label: 'Pos', x: 42 },
        { label: 'Admission No', x: 74 },
        { label: 'Student Name', x: 170 },
        { label: 'Subjects Passed', x: 325 },
        { label: 'Avg (%)', x: 415 },
        { label: 'Grade', x: 470 },
        { label: 'Status', x: 510 },
      ],
      rows: payload.rows.map((r) => [
        String(r.class_position ?? '-'),
        r.admission_number,
        `${r.first_name} ${r.last_name}`,
        `${r.subjects_passed}/${r.subjects_count}`,
        `${r.average_score}%`,
        r.overall_grade,
        r.status,
      ]),
      footerLines: [
        'Generated by Dave Timi EdTech Systems Academic Engine',
        `Printed: ${new Date().toISOString().slice(0, 10)}`,
      ],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="broadsheet-${payload.classRow.name.replace(/\s+/g, '-')}.pdf"`,
    );
    res.send(pdf);
  },
);
