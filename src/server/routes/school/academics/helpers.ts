import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../../../../db/client.ts';
import {
  computeStudentSubjectResult,
  rankScores,
  roundAcademicScore,
  resolveGradeForScore,
  type AssessmentScoreStatus,
  type GradingBandRule,
  type MissingScorePolicy,
  type ScoreRoundingMode,
  type TieRankingMode,
} from '../../../academics-engine.ts';

export interface SchoolAcademicSettingsRow {
  school_id: string;
  session_naming_convention: string;
  term_naming_convention: string;
  default_terms_per_session: number;
  allow_overlapping_sessions: number;
  allow_overlapping_terms: number;
  score_rounding_mode: ScoreRoundingMode;
  tie_ranking_mode: TieRankingMode;
  missing_score_policy: MissingScorePolicy;
  promotion_min_average: number;
  promotion_min_pass_subjects: number;
}

export function ensureSchoolAcademicDefaults(schoolId: string): SchoolAcademicSettingsRow {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO school_academic_settings (school_id)
    VALUES (?)
  `).run(schoolId);

  const settings = db
    .prepare('SELECT * FROM school_academic_settings WHERE school_id = ?')
    .get(schoolId) as unknown as SchoolAcademicSettingsRow;

  // Ensure default assessment categories exist
  const catCount = db
    .prepare('SELECT COUNT(*) AS count FROM assessment_categories WHERE school_id = ?')
    .get(schoolId) as { count: number };

  let caCatId = '';
  let examCatId = '';

  if (catCount.count === 0) {
    caCatId = `acat_${crypto.randomUUID()}`;
    const testCatId = `acat_${crypto.randomUUID()}`;
    const assignCatId = `acat_${crypto.randomUUID()}`;
    examCatId = `acat_${crypto.randomUUID()}`;

    const insertCat = db.prepare(`
      INSERT INTO assessment_categories (id, school_id, name, code, description, is_exam, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCat.run(caCatId, schoolId, 'Continuous Assessment', 'CA', 'Periodic continuous assessments and classwork', 0, 1);
    insertCat.run(testCatId, schoolId, 'Mid-Term Test', 'TEST', 'Scheduled mid-term tests and quizzes', 0, 2);
    insertCat.run(assignCatId, schoolId, 'Assignment & Practical', 'ASSIGN', 'Take-home assignments, labs, and projects', 0, 3);
    insertCat.run(examCatId, schoolId, 'Terminal Examination', 'EXAM', 'End-of-term formal examination', 1, 4);
  } else {
    const caRow = db
      .prepare('SELECT id FROM assessment_categories WHERE school_id = ? AND is_exam = 0 ORDER BY display_order ASC LIMIT 1')
      .get(schoolId) as { id: string } | undefined;
    const exRow = db
      .prepare('SELECT id FROM assessment_categories WHERE school_id = ? AND is_exam = 1 ORDER BY display_order ASC LIMIT 1')
      .get(schoolId) as { id: string } | undefined;
    caCatId = caRow?.id ?? '';
    examCatId = exRow?.id ?? '';
  }

  // Ensure default school-wide assessment components exist (20 + 20 + 60 = 100%)
  const compCount = db
    .prepare('SELECT COUNT(*) AS count FROM assessment_components WHERE school_id = ?')
    .get(schoolId) as { count: number };

  if (compCount.count === 0 && caCatId && examCatId) {
    const insertComp = db.prepare(`
      INSERT INTO assessment_components (
        id, school_id, category_id, name, max_score, weight_percentage, display_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertComp.run(`acmp_${crypto.randomUUID()}`, schoolId, caCatId, 'First CA', 20, 20, 1);
    insertComp.run(`acmp_${crypto.randomUUID()}`, schoolId, caCatId, 'Second CA', 20, 20, 2);
    insertComp.run(`acmp_${crypto.randomUUID()}`, schoolId, examCatId, 'Terminal Exam', 60, 60, 3);
  }

  // Ensure default grading system exists
  const gsCount = db
    .prepare('SELECT COUNT(*) AS count FROM grading_systems WHERE school_id = ?')
    .get(schoolId) as { count: number };

  if (gsCount.count === 0) {
    const gsId = `grs_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO grading_systems (id, school_id, name, description, section_scope, is_default, require_full_coverage, is_active)
      VALUES (?, ?, 'Standard Institutional Grading Scale', 'Default 0-100 grading scale (A-F)', 'All Sections', 1, 1, 1)
    `).run(gsId, schoolId);

    const insertBand = db.prepare(`
      INSERT INTO grading_bands (id, school_id, grading_system_id, min_score, max_score, grade, remark, grade_point, is_passing, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertBand.run(`grb_${crypto.randomUUID()}`, schoolId, gsId, 70, 100, 'A', 'Excellent', 4.0, 1, 1);
    insertBand.run(`grb_${crypto.randomUUID()}`, schoolId, gsId, 60, 69.99, 'B', 'Very Good', 3.5, 1, 2);
    insertBand.run(`grb_${crypto.randomUUID()}`, schoolId, gsId, 50, 59.99, 'C', 'Credit', 3.0, 1, 3);
    insertBand.run(`grb_${crypto.randomUUID()}`, schoolId, gsId, 45, 49.99, 'D', 'Pass', 2.0, 1, 4);
    insertBand.run(`grb_${crypto.randomUUID()}`, schoolId, gsId, 0, 44.99, 'F', 'Fail', 0.0, 0, 5);
  }

  // Ensure default report card template exists
  db.prepare(`
    INSERT OR IGNORE INTO report_card_templates (id, school_id, name, is_default)
    VALUES (?, ?, 'Standard Institutional Report Card', 1)
  `).run(`rct_${schoolId}`, schoolId);

  // Sync any Phase 1/2 academic_sessions that lack lifecycle or academic_terms rows
  const sessions = db
    .prepare('SELECT id, term, start_date, end_date, is_current FROM academic_sessions WHERE school_id = ?')
    .all(schoolId) as Array<{
    id: string;
    term: string;
    start_date: string;
    end_date: string;
    is_current: number;
  }>;

  for (const s of sessions) {
    db.prepare(`
      INSERT OR IGNORE INTO academic_session_lifecycle (session_id, school_id, status)
      VALUES (?, ?, 'active')
    `).run(s.id, schoolId);

    const existingTerm = db
      .prepare('SELECT id FROM academic_terms WHERE school_id = ? AND academic_session_id = ? LIMIT 1')
      .get(schoolId, s.id);
    if (!existingTerm) {
      const termName = s.term === 'Annual' ? 'First Term' : s.term;
      db.prepare(`
        INSERT OR IGNORE INTO academic_terms (
          id, school_id, academic_session_id, name, term_order, start_date, end_date, status, is_current
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(
        `trm_${crypto.randomUUID()}`,
        schoolId,
        s.id,
        termName,
        s.start_date,
        s.end_date,
        s.is_current === 1 ? 'active' : 'draft',
        s.is_current === 1 ? 1 : 0,
      );
    }
  }

  return settings;
}

export interface ResolvedComponentRow {
  id: string;
  category_id: string;
  category_name: string;
  is_exam: number;
  name: string;
  max_score: number;
  weight_percentage: number;
  display_order: number;
  class_id: string | null;
  subject_id: string | null;
  academic_term_id: string | null;
}

export function resolveEffectiveComponents(params: {
  schoolId: string;
  academicTermId?: string | null;
  classId?: string | null;
  subjectId?: string | null;
}): ResolvedComponentRow[] {
  const db = getDb();
  ensureSchoolAcademicDefaults(params.schoolId);

  const allActive = db
    .prepare(`
      SELECT
        ac.id, ac.category_id, cat.name AS category_name, cat.is_exam,
        ac.name, ac.max_score, ac.weight_percentage, ac.display_order,
        ac.class_id, ac.subject_id, ac.academic_term_id
      FROM assessment_components ac
      INNER JOIN assessment_categories cat ON cat.id = ac.category_id
      WHERE ac.school_id = ? AND ac.is_active = 1
      ORDER BY cat.is_exam ASC, ac.display_order ASC, ac.created_at ASC
    `)
    .all(params.schoolId) as unknown as ResolvedComponentRow[];

  // Specificity cascade: class+subject+term -> class+subject -> class -> term -> school-wide default
  const matchers: Array<(r: ResolvedComponentRow) => boolean> = [
    (r) =>
      Boolean(params.classId && params.subjectId && params.academicTermId) &&
      r.class_id === params.classId &&
      r.subject_id === params.subjectId &&
      r.academic_term_id === params.academicTermId,
    (r) =>
      Boolean(params.classId && params.subjectId) &&
      r.class_id === params.classId &&
      r.subject_id === params.subjectId &&
      !r.academic_term_id,
    (r) =>
      Boolean(params.classId) &&
      r.class_id === params.classId &&
      !r.subject_id &&
      (!r.academic_term_id || r.academic_term_id === params.academicTermId),
    (r) =>
      Boolean(params.academicTermId) &&
      !r.class_id &&
      !r.subject_id &&
      r.academic_term_id === params.academicTermId,
    (r) => !r.class_id && !r.subject_id && !r.academic_term_id,
  ];

  for (const matcher of matchers) {
    const matched = allActive.filter(matcher);
    if (matched.length > 0) return matched;
  }

  return [];
}

export function resolveEffectiveGradingSystem(params: {
  schoolId: string;
  classId?: string | null;
  gradingSystemId?: string | null;
}): {
  system: { id: string; name: string; require_full_coverage: number };
  bands: GradingBandRule[];
} {
  const db = getDb();
  ensureSchoolAcademicDefaults(params.schoolId);

  let sys: { id: string; name: string; require_full_coverage: number } | undefined;

  if (params.gradingSystemId) {
    sys = db
      .prepare('SELECT id, name, require_full_coverage FROM grading_systems WHERE id = ? AND school_id = ? AND is_active = 1')
      .get(params.gradingSystemId, params.schoolId) as typeof sys;
  }

  if (!sys && params.classId) {
    sys = db
      .prepare('SELECT id, name, require_full_coverage FROM grading_systems WHERE class_id = ? AND school_id = ? AND is_active = 1 LIMIT 1')
      .get(params.classId, params.schoolId) as typeof sys;
  }

  if (!sys) {
    sys = db
      .prepare('SELECT id, name, require_full_coverage FROM grading_systems WHERE school_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1')
      .get(params.schoolId) as typeof sys;
  }

  if (!sys) {
    sys = db
      .prepare('SELECT id, name, require_full_coverage FROM grading_systems WHERE school_id = ? AND is_active = 1 LIMIT 1')
      .get(params.schoolId) as typeof sys;
  }

  if (!sys) {
    throw new Error('No active grading system configured for this school.');
  }

  const rawBands = db
    .prepare('SELECT id, min_score, max_score, grade, remark, grade_point, is_passing FROM grading_bands WHERE grading_system_id = ? AND school_id = ? ORDER BY min_score DESC')
    .all(sys.id, params.schoolId) as Array<{
    id: string;
    min_score: number;
    max_score: number;
    grade: string;
    remark: string;
    grade_point: number;
    is_passing: number;
  }>;

  const bands: GradingBandRule[] = rawBands.map((b) => ({
    id: b.id,
    minScore: b.min_score,
    maxScore: b.max_score,
    grade: b.grade,
    remark: b.remark,
    gradePoint: b.grade_point,
    isPassing: b.is_passing === 1,
  }));

  return { system: sys, bands };
}

export function getTeacherRecordForUser(schoolId: string, userId: string): { id: string } | undefined {
  const db = getDb();
  return db
    .prepare("SELECT id FROM teachers WHERE school_id = ? AND user_id = ? AND employment_status = 'active' LIMIT 1")
    .get(schoolId, userId) as { id: string } | undefined;
}

export function isTeacherAuthorizedForSubjectClass(params: {
  schoolId: string;
  userId: string;
  classId: string;
  subjectId: string;
}): boolean {
  const db = getDb();
  const teacher = getTeacherRecordForUser(params.schoolId, params.userId);
  if (!teacher) return false;

  const subjectAssigned = db
    .prepare(`
      SELECT 1 FROM teacher_subject_assignments
      WHERE school_id = ? AND teacher_id = ? AND subject_id = ? AND is_active = 1
        AND (class_id IS NULL OR class_id = ?)
      LIMIT 1
    `)
    .get(params.schoolId, teacher.id, params.subjectId, params.classId);

  if (subjectAssigned) return true;

  const classTeacherAssigned = db
    .prepare(`
      SELECT 1 FROM class_teacher_assignments
      WHERE school_id = ? AND teacher_id = ? AND class_id = ? AND is_active = 1
      LIMIT 1
    `)
    .get(params.schoolId, teacher.id, params.classId);

  return Boolean(classTeacherAssigned);
}

export function isTeacherAuthorizedForStudent(params: {
  schoolId: string;
  userId: string;
  studentId: string;
}): boolean {
  const db = getDb();
  const teacher = getTeacherRecordForUser(params.schoolId, params.userId);
  if (!teacher) return false;

  const row = db
    .prepare(`
      SELECT 1
      FROM students s
      WHERE s.id = ? AND s.school_id = ?
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
      LIMIT 1
    `)
    .get(params.studentId, params.schoolId, teacher.id, teacher.id);

  return Boolean(row);
}

export function recomputeClassTermResults(params: {
  db: DatabaseSync;
  schoolId: string;
  academicTermId: string;
  classId: string;
  armId?: string | null;
  gradingSystemId?: string | null;
  actorUserId: string;
  allowAmendPublished?: boolean;
}): {
  computedSubjectsCount: number;
  studentsProcessed: number;
  termName: string;
  sessionId: string;
} {
  const { db, schoolId, academicTermId, classId, armId, actorUserId, allowAmendPublished } = params;
  const settings = ensureSchoolAcademicDefaults(schoolId);

  const term = db
    .prepare('SELECT id, academic_session_id, name, status FROM academic_terms WHERE id = ? AND school_id = ?')
    .get(academicTermId, schoolId) as
    | { id: string; academic_session_id: string; name: string; status: string }
    | undefined;
  if (!term) {
    throw new Error('Academic term not found for your school.');
  }

  const classRow = db
    .prepare('SELECT id, name FROM school_classes WHERE id = ? AND school_id = ?')
    .get(classId, schoolId) as { id: string; name: string } | undefined;
  if (!classRow) {
    throw new Error('Selected class does not belong to your school.');
  }

  if (!allowAmendPublished) {
    const publishedAlready = db
      .prepare(`
        SELECT COUNT(*) AS count FROM result_publications
        WHERE school_id = ? AND academic_term_id = ? AND class_id = ?
          ${armId ? 'AND arm_id = ?' : ''}
          AND status IN ('published', 'amended')
      `)
      .get(...(armId ? [schoolId, academicTermId, classId, armId] : [schoolId, academicTermId, classId])) as {
      count: number;
    };

    if (publishedAlready.count > 0) {
      throw new Error(
        'Published results cannot be silently recomputed or overwritten. Use the official Result Amendment workflow.',
      );
    }
  }

  const { system, bands } = resolveEffectiveGradingSystem({
    schoolId,
    classId,
    gradingSystemId: params.gradingSystemId,
  });

  // Get students in this class/arm (either active current_class_id or enrolled in subjects for this class & session)
  const students = db
    .prepare(`
      SELECT DISTINCT s.id, s.current_arm_id
      FROM students s
      WHERE s.school_id = ? AND s.status = 'active' AND s.current_class_id = ?
        ${armId ? 'AND s.current_arm_id = ?' : ''}
    `)
    .all(...(armId ? [schoolId, classId, armId] : [schoolId, classId])) as Array<{
    id: string;
    current_arm_id: string | null;
  }>;

  if (students.length === 0) {
    throw new Error('No active students found in the selected class/arm.');
  }

  // Subjects: distinct subjects either in student_subject_enrollments for this session/class OR assigned to class_subjects
  const studentSubjectMap = new Map<string, string[]>();
  const allSubjectsSet = new Set<string>();

  const classSubjects = db
    .prepare(`
      SELECT cs.subject_id
      FROM class_subjects cs
      INNER JOIN subjects sub ON sub.id = cs.subject_id
      WHERE cs.school_id = ? AND cs.class_id = ? AND sub.status = 'active'
    `)
    .all(schoolId, classId) as Array<{ subject_id: string }>;

  for (const stu of students) {
    const enrolled = db
      .prepare(`
        SELECT DISTINCT subject_id
        FROM student_subject_enrollments
        WHERE school_id = ? AND student_id = ? AND academic_session_id = ?
          AND (academic_term_id IS NULL OR academic_term_id = ?)
          AND status = 'active'
      `)
      .all(schoolId, stu.id, term.academic_session_id, academicTermId) as Array<{ subject_id: string }>;

    const subjIds = enrolled.length > 0 ? enrolled.map((e) => e.subject_id) : classSubjects.map((c) => c.subject_id);
    studentSubjectMap.set(stu.id, subjIds);
    for (const sid of subjIds) allSubjectsSet.add(sid);
  }

  if (allSubjectsSet.size === 0) {
    throw new Error('No active subjects are assigned or enrolled for this class.');
  }

  // Compute each student-subject record
  const subjectOutputs: Array<{
    studentId: string;
    armId: string | null;
    subjectId: string;
    resultId: string;
    outcome: ReturnType<typeof computeStudentSubjectResult>;
  }> = [];

  for (const stu of students) {
    const subjIds = studentSubjectMap.get(stu.id) ?? [];
    for (const subjectId of subjIds) {
      const components = resolveEffectiveComponents({
        schoolId,
        academicTermId,
        classId,
        subjectId,
      });
      if (components.length === 0) {
        throw new Error('No active assessment components configured for this school.');
      }

      const storedScores = db
        .prepare(`
          SELECT component_id, score, status
          FROM assessment_scores
          WHERE school_id = ? AND academic_term_id = ? AND student_id = ? AND subject_id = ?
        `)
        .all(schoolId, academicTermId, stu.id, subjectId) as Array<{
        component_id: string;
        score: number | null;
        status: AssessmentScoreStatus;
      }>;

      const scoreByComp = new Map(storedScores.map((row) => [row.component_id, row]));

      const outcome = computeStudentSubjectResult({
        inputs: components.map((comp) => {
          const entry = scoreByComp.get(comp.id);
          return {
            component: {
              id: comp.id,
              name: comp.name,
              categoryName: comp.category_name,
              isExam: comp.is_exam === 1,
              maxScore: comp.max_score,
              weightPercentage: comp.weight_percentage,
            },
            score: entry ? entry.score : null,
            status: entry ? entry.status : 'pending',
          };
        }),
        bands,
        roundingMode: settings.score_rounding_mode,
        missingPolicy: settings.missing_score_policy,
      });

      const existingRow = db
        .prepare(`
          SELECT id, computation_version, status
          FROM computed_results
          WHERE school_id = ? AND academic_term_id = ? AND student_id = ? AND subject_id = ?
        `)
        .get(schoolId, academicTermId, stu.id, subjectId) as
        | { id: string; computation_version: number; status: string }
        | undefined;

      const resultId = existingRow?.id ?? `cres_${crypto.randomUUID()}`;
      subjectOutputs.push({
        studentId: stu.id,
        armId: stu.current_arm_id,
        subjectId,
        resultId,
        outcome,
      });
    }
  }

  // Group by subjectId to calculate class average and per-subject rank
  const bySubject = new Map<string, typeof subjectOutputs>();
  for (const row of subjectOutputs) {
    const arr = bySubject.get(row.subjectId) ?? [];
    arr.push(row);
    bySubject.set(row.subjectId, arr);
  }

  for (const [, rows] of bySubject.entries()) {
    const avg =
      rows.length > 0
        ? roundAcademicScore(
            rows.reduce((sum, r) => sum + r.outcome.percentageScore, 0) / rows.length,
            settings.score_rounding_mode,
          )
        : 0;
    const ranks = rankScores(
      rows.map((r) => ({ id: r.studentId, score: r.outcome.percentageScore })),
      settings.tie_ranking_mode,
    );

    for (const r of rows) {
      const existing = db
        .prepare(`
          SELECT computation_version, status
          FROM computed_results WHERE id = ? AND school_id = ?
        `)
        .get(r.resultId, schoolId) as { computation_version: number; status: string } | undefined;

      const nextStatus =
        existing && (existing.status === 'published' || existing.status === 'amended')
          ? 'amended'
          : 'computed';
      const version = (existing?.computation_version ?? 0) + 1;

      db.prepare(`
        INSERT INTO computed_results (
          id, school_id, academic_session_id, academic_term_id, class_id, arm_id,
          student_id, subject_id, grading_system_id, ca_score, exam_score, total_score,
          max_possible_score, percentage_score, grade, remark, grade_point, is_passing,
          class_average, subject_position, subject_student_count, computation_version,
          snapshot_json, status, computed_by_user_id, computed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(school_id, academic_term_id, student_id, subject_id) DO UPDATE SET
          class_id = excluded.class_id,
          arm_id = excluded.arm_id,
          grading_system_id = excluded.grading_system_id,
          ca_score = excluded.ca_score,
          exam_score = excluded.exam_score,
          total_score = excluded.total_score,
          max_possible_score = excluded.max_possible_score,
          percentage_score = excluded.percentage_score,
          grade = excluded.grade,
          remark = excluded.remark,
          grade_point = excluded.grade_point,
          is_passing = excluded.is_passing,
          class_average = excluded.class_average,
          subject_position = excluded.subject_position,
          subject_student_count = excluded.subject_student_count,
          computation_version = excluded.computation_version,
          snapshot_json = excluded.snapshot_json,
          status = excluded.status,
          computed_by_user_id = excluded.computed_by_user_id,
          computed_at = datetime('now'),
          updated_at = datetime('now')
      `).run(
        r.resultId,
        schoolId,
        term.academic_session_id,
        academicTermId,
        classId,
        r.armId,
        r.studentId,
        r.subjectId,
        system.id,
        r.outcome.caScore,
        r.outcome.examScore,
        r.outcome.totalScore,
        r.outcome.maxPossibleScore,
        r.outcome.percentageScore,
        r.outcome.grade,
        r.outcome.remark,
        r.outcome.gradePoint,
        r.outcome.isPassing ? 1 : 0,
        avg,
        ranks.get(r.studentId) ?? null,
        rows.length,
        version,
        JSON.stringify({
          roundingMode: settings.score_rounding_mode,
          tieRankingMode: settings.tie_ranking_mode,
          missingPolicy: settings.missing_score_policy,
          gradingSystemId: system.id,
          items: r.outcome.items,
        }),
        nextStatus,
        actorUserId,
      );

      db.prepare('DELETE FROM computed_result_items WHERE computed_result_id = ? AND school_id = ?').run(
        r.resultId,
        schoolId,
      );
      const insertItem = db.prepare(`
        INSERT INTO computed_result_items (
          id, school_id, computed_result_id, component_id, component_name, category_name,
          is_exam, raw_score, max_score, weight_percentage, weighted_contribution, score_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of r.outcome.items) {
        insertItem.run(
          `cri_${crypto.randomUUID()}`,
          schoolId,
          r.resultId,
          item.componentId,
          item.componentName,
          item.categoryName,
          item.isExam ? 1 : 0,
          item.rawScore,
          item.maxScore,
          item.weightPercentage,
          item.weightedContribution,
          item.status,
        );
      }
    }
  }

  // Aggregate overall student publication summaries & class ranking
  const byStudent = new Map<string, typeof subjectOutputs>();
  for (const row of subjectOutputs) {
    const arr = byStudent.get(row.studentId) ?? [];
    arr.push(row);
    byStudent.set(row.studentId, arr);
  }

  const studentAverages = Array.from(byStudent.entries()).map(([studentId, rows]) => {
    const totalObtained = roundAcademicScore(
      rows.reduce((sum, r) => sum + r.outcome.totalScore, 0),
      settings.score_rounding_mode,
    );
    const totalPossible = roundAcademicScore(
      rows.reduce((sum, r) => sum + r.outcome.maxPossibleScore, 0),
      settings.score_rounding_mode,
    );
    const averageScore =
      rows.length > 0
        ? roundAcademicScore(
            rows.reduce((sum, r) => sum + r.outcome.percentageScore, 0) / rows.length,
            settings.score_rounding_mode,
          )
        : 0;
    const subjectsPassed = rows.filter((r) => r.outcome.isPassing).length;
    return {
      studentId,
      armId: rows[0]?.armId ?? null,
      subjectsCount: rows.length,
      subjectsPassed,
      totalObtained,
      totalPossible,
      averageScore,
    };
  });

  const classPositions = rankScores(
    studentAverages.map((s) => ({ id: s.studentId, score: s.averageScore })),
    settings.tie_ranking_mode,
  );
  const avgs = studentAverages.map((s) => s.averageScore);
  const highestAvg = avgs.length ? Math.max(...avgs) : 0;
  const lowestAvg = avgs.length ? Math.min(...avgs) : 0;

  for (const stu of studentAverages) {
    const overallBand = resolveGradeForScore(stu.averageScore, bands);
    const existingPub = db
      .prepare('SELECT id, status FROM result_publications WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
      .get(schoolId, academicTermId, stu.studentId) as { id: string; status: string } | undefined;
    const pubStatus =
      existingPub && (existingPub.status === 'published' || existingPub.status === 'amended')
        ? 'amended'
        : 'draft';

    db.prepare(`
      INSERT INTO result_publications (
        id, school_id, academic_session_id, academic_term_id, class_id, arm_id, student_id,
        grading_system_id, subjects_count, subjects_passed, total_score_obtained, total_max_possible,
        average_score, overall_grade, overall_remark, class_position, class_size,
        highest_class_average, lowest_class_average, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(school_id, academic_term_id, student_id) DO UPDATE SET
        class_id = excluded.class_id,
        arm_id = excluded.arm_id,
        grading_system_id = excluded.grading_system_id,
        subjects_count = excluded.subjects_count,
        subjects_passed = excluded.subjects_passed,
        total_score_obtained = excluded.total_score_obtained,
        total_max_possible = excluded.total_max_possible,
        average_score = excluded.average_score,
        overall_grade = excluded.overall_grade,
        overall_remark = excluded.overall_remark,
        class_position = excluded.class_position,
        class_size = excluded.class_size,
        highest_class_average = excluded.highest_class_average,
        lowest_class_average = excluded.lowest_class_average,
        status = excluded.status,
        updated_at = datetime('now')
    `).run(
      existingPub?.id ?? `rpub_${crypto.randomUUID()}`,
      schoolId,
      term.academic_session_id,
      academicTermId,
      classId,
      stu.armId,
      stu.studentId,
      system.id,
      stu.subjectsCount,
      stu.subjectsPassed,
      stu.totalObtained,
      stu.totalPossible,
      stu.averageScore,
      overallBand.grade,
      overallBand.remark,
      classPositions.get(stu.studentId) ?? null,
      studentAverages.length,
      highestAvg,
      lowestAvg,
      pubStatus,
    );
  }

  return {
    computedSubjectsCount: subjectOutputs.length,
    studentsProcessed: studentAverages.length,
    termName: term.name,
    sessionId: term.academic_session_id,
  };
}
