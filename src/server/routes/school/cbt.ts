import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  computeCbtAttemptTotals,
  evaluateObjectiveQuestionAnswer,
  isCbtAttemptExpired,
  seededShuffle,
  type CbtQuestionType,
} from '../../cbt-engine.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { hasPermission } from '../../security.ts';
import {
  assignCbtCandidatesSchema,
  assignCbtQuestionsSchema,
  createCbtExamSchema,
  createCbtQuestionSchema,
  gradeCbtEssaySchema,
  saveCbtAnswerSchema,
  updateCbtExamSettingsSchema,
} from '../../validation-v1.ts';
import { isTeacherAuthorizedForSubjectClass } from './academics/helpers.ts';

export const schoolCbtRouter = Router();

function recalculateCbtExamTotalMarks(schoolId: string, cbtExamId: string): number {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT COALESCE(SUM(COALESCE(ceq.marks_override, qb.marks)), 0) AS total
      FROM cbt_exam_questions ceq
      INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
      WHERE ceq.school_id = ? AND ceq.cbt_exam_id = ?
    `)
    .get(schoolId, cbtExamId) as { total: number };
  const total = Math.round(Number(row.total || 0) * 100) / 100;
  db.prepare("UPDATE cbt_examinations SET total_marks = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
    total,
    cbtExamId,
    schoolId,
  );
  return total;
}

function finalizeAttemptSubmission(params: {
  schoolId: string;
  attemptId: string;
  submissionType: 'submitted' | 'auto_submitted';
  ipAddress: string;
}) {
  const db = getDb();
  const attempt = db
    .prepare('SELECT * FROM cbt_exam_attempts WHERE id = ? AND school_id = ?')
    .get(params.attemptId, params.schoolId) as
    | {
        id: string;
        cbt_exam_id: string;
        student_id: string;
        status: string;
        question_order_json: string;
      }
    | undefined;
  if (!attempt || attempt.status !== 'in_progress') return null;

  const exam = db
    .prepare('SELECT id, pass_mark_percent FROM cbt_examinations WHERE id = ? AND school_id = ?')
    .get(attempt.cbt_exam_id, params.schoolId) as { id: string; pass_mark_percent: number };

  const examQuestions = db
    .prepare(`
      SELECT ceq.question_id, COALESCE(ceq.marks_override, qb.marks) AS eff_marks,
             COALESCE(ceq.negative_marks_override, qb.negative_marks) AS eff_neg,
             qb.question_type, qb.correct_answer_json
      FROM cbt_exam_questions ceq
      INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
      WHERE ceq.school_id = ? AND ceq.cbt_exam_id = ?
    `)
    .all(params.schoolId, attempt.cbt_exam_id) as Array<{
    question_id: string;
    eff_marks: number;
    eff_neg: number;
    question_type: CbtQuestionType;
    correct_answer_json: string;
  }>;

  const answers = db
    .prepare('SELECT id, question_id, answer_json, marks_awarded FROM cbt_attempt_answers WHERE attempt_id = ? AND school_id = ?')
    .all(attempt.id, params.schoolId) as Array<{
    id: string;
    question_id: string;
    answer_json: string;
    marks_awarded: number;
  }>;
  const answerMap = new Map(answers.map((a) => [a.question_id, a]));

  const summaryInputs: Array<{ questionType: CbtQuestionType; maxMarks: number; marksAwarded: number }> = [];
  let hasEssay = false;

  for (const eq of examQuestions) {
    if (eq.question_type === 'essay') hasEssay = true;
    const ansRow = answerMap.get(eq.question_id);
    let studentAns = '';
    if (ansRow) {
      try {
        studentAns = String(JSON.parse(ansRow.answer_json) ?? '');
      } catch {
        studentAns = ansRow.answer_json;
      }
    }
    let correctAns = '';
    try {
      correctAns = String(JSON.parse(eq.correct_answer_json) ?? '');
    } catch {
      correctAns = eq.correct_answer_json;
    }

    if (eq.question_type === 'essay') {
      summaryInputs.push({
        questionType: eq.question_type,
        maxMarks: eq.eff_marks,
        marksAwarded: ansRow?.marks_awarded ?? 0,
      });
    } else {
      const evaluated = evaluateObjectiveQuestionAnswer({
        questionType: eq.question_type,
        correctAnswer: correctAns,
        studentAnswer: studentAns,
        marks: eq.eff_marks,
        negativeMarks: eq.eff_neg,
      });
      if (ansRow) {
        db.prepare('UPDATE cbt_attempt_answers SET is_correct = ?, marks_awarded = ? WHERE id = ?').run(
          evaluated.isCorrect ? 1 : 0,
          evaluated.marksAwarded,
          ansRow.id,
        );
      } else {
        db.prepare(`
          INSERT INTO cbt_attempt_answers (id, school_id, attempt_id, question_id, answer_json, is_correct, marks_awarded)
          VALUES (?, ?, ?, ?, '""', 0, 0)
        `).run(`caa_${crypto.randomUUID()}`, params.schoolId, attempt.id, eq.question_id);
      }
      summaryInputs.push({
        questionType: eq.question_type,
        maxMarks: eq.eff_marks,
        marksAwarded: evaluated.marksAwarded,
      });
    }
  }

  const totals = computeCbtAttemptTotals({
    items: summaryInputs,
    passMarkPercent: exam.pass_mark_percent,
  });

  const nextStatus = hasEssay ? params.submissionType : 'graded';
  db.prepare(`
    UPDATE cbt_exam_attempts SET
      submitted_at = datetime('now'),
      status = ?,
      objective_score = ?,
      manual_score = ?,
      total_score = ?,
      max_score = ?,
      percentage_score = ?,
      passed = ?,
      graded_at = CASE WHEN ? = 'graded' THEN datetime('now') ELSE NULL END
    WHERE id = ? AND school_id = ?
  `).run(
    nextStatus,
    totals.objectiveScore,
    totals.manualScore,
    totals.totalScore,
    totals.maxScore,
    totals.percentageScore,
    totals.passed ? 1 : 0,
    nextStatus,
    attempt.id,
    params.schoolId,
  );

  db.prepare(`
    INSERT INTO cbt_activity_logs (id, school_id, cbt_exam_id, attempt_id, student_id, event_type, event_detail, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `cal_${crypto.randomUUID()}`,
    params.schoolId,
    attempt.cbt_exam_id,
    attempt.id,
    attempt.student_id,
    params.submissionType,
    `Score: ${totals.totalScore}/${totals.maxScore} (${totals.percentageScore}%)`,
    params.ipAddress,
  );

  return { status: nextStatus, totals };
}

schoolCbtRouter.get(
  '/cbt/overview',
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const counts = {
      questionsCount: (db.prepare('SELECT COUNT(*) AS c FROM cbt_question_bank WHERE school_id = ? AND is_active = 1').get(schoolId) as { c: number }).c,
      examsCount: (db.prepare('SELECT COUNT(*) AS c FROM cbt_examinations WHERE school_id = ?').get(schoolId) as { c: number }).c,
      activeExamsCount: (db.prepare("SELECT COUNT(*) AS c FROM cbt_examinations WHERE school_id = ? AND status IN ('published', 'active')").get(schoolId) as { c: number }).c,
      attemptsCount: (db.prepare('SELECT COUNT(*) AS c FROM cbt_exam_attempts WHERE school_id = ?').get(schoolId) as { c: number }).c,
      pendingManualGradingCount: (db.prepare("SELECT COUNT(*) AS c FROM cbt_exam_attempts WHERE school_id = ? AND status IN ('submitted', 'auto_submitted')").get(schoolId) as { c: number }).c,
    };

    const recentExams = db
      .prepare(`
        SELECT ce.*, sub.name AS subject_name, c.name AS class_name,
               (SELECT COUNT(*) FROM cbt_exam_questions q WHERE q.cbt_exam_id = ce.id) AS questions_count,
               (SELECT COUNT(*) FROM cbt_exam_attempts a WHERE a.cbt_exam_id = ce.id) AS attempts_count
        FROM cbt_examinations ce
        INNER JOIN subjects sub ON sub.id = ce.subject_id
        INNER JOIN school_classes c ON c.id = ce.class_id
        WHERE ce.school_id = ?
        ORDER BY ce.created_at DESC
        LIMIT 8
      `)
      .all(schoolId);

    res.json({ counts, recentExams });
  },
);

// Question Bank
schoolCbtRouter.get(
  '/cbt/questions',
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : '';
    const conditions = ['qb.school_id = ?', 'qb.is_active = 1'];
    const params: string[] = [schoolId];
    if (subjectId) {
      conditions.push('qb.subject_id = ?');
      params.push(subjectId);
    }

    const questions = db
      .prepare(`
        SELECT qb.*, sub.name AS subject_name, sub.code AS subject_code, c.name AS class_name
        FROM cbt_question_bank qb
        INNER JOIN subjects sub ON sub.id = qb.subject_id
        LEFT JOIN school_classes c ON c.id = qb.class_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY qb.created_at DESC
        LIMIT 250
      `)
      .all(...params);
    res.json({ questions });
  },
);

schoolCbtRouter.post(
  '/cbt/questions',
  requireCsrfCheck,
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createCbtQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid question.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const sub = db
      .prepare('SELECT id FROM subjects WHERE id = ? AND school_id = ?')
      .get(parsed.data.subjectId, schoolId);
    if (!sub) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    if (parsed.data.questionType === 'mcq' && parsed.data.options.length < 2) {
      res.status(400).json({ error: 'Multiple choice questions require at least 2 answer options.' });
      return;
    }

    const id = `cqb_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO cbt_question_bank (
        id, school_id, subject_id, class_id, question_type, difficulty, topic,
        question_text, options_json, correct_answer_json, marks, negative_marks, explanation, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      schoolId,
      parsed.data.subjectId,
      parsed.data.classId ?? null,
      parsed.data.questionType,
      parsed.data.difficulty,
      parsed.data.topic,
      parsed.data.questionText,
      JSON.stringify(parsed.data.options),
      JSON.stringify(parsed.data.correctAnswer),
      parsed.data.marks,
      parsed.data.negativeMarks,
      parsed.data.explanation,
      req.auth!.id,
    );

    res.status(201).json({ question: db.prepare('SELECT * FROM cbt_question_bank WHERE id = ?').get(id) });
  },
);

// CBT Examinations Management
schoolCbtRouter.get(
  '/cbt/exams',
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const exams = db
      .prepare(`
        SELECT ce.*, sub.name AS subject_name, c.name AS class_name, a.name AS arm_name,
               trm.name AS term_name,
               (SELECT COUNT(*) FROM cbt_exam_questions q WHERE q.cbt_exam_id = ce.id) AS questions_count,
               (SELECT COUNT(*) FROM cbt_exam_candidates cd WHERE cd.cbt_exam_id = ce.id AND cd.is_eligible = 1) AS candidates_count,
               (SELECT COUNT(*) FROM cbt_exam_attempts att WHERE att.cbt_exam_id = ce.id) AS attempts_count
        FROM cbt_examinations ce
        INNER JOIN subjects sub ON sub.id = ce.subject_id
        INNER JOIN school_classes c ON c.id = ce.class_id
        LEFT JOIN class_arms a ON a.id = ce.arm_id
        LEFT JOIN academic_terms trm ON trm.id = ce.academic_term_id
        WHERE ce.school_id = ?
        ORDER BY ce.created_at DESC
      `)
      .all(schoolId);
    res.json({ exams });
  },
);

schoolCbtRouter.post(
  '/cbt/exams',
  requireCsrfCheck,
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createCbtExamSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid CBT examination.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    if (!hasPermission(req.auth!.permissions, 'school.cbt.manage')) {
      const authorized = isTeacherAuthorizedForSubjectClass({
        schoolId,
        userId: req.auth!.id,
        classId: parsed.data.classId,
        subjectId: parsed.data.subjectId,
      });
      if (!authorized) {
        res.status(403).json({ error: 'You are not assigned to teach this class and subject.' });
        return;
      }
    }
    const id = `cbt_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO cbt_examinations (
        id, school_id, academic_session_id, academic_term_id, class_id, arm_id, subject_id,
        linked_examination_id, linked_component_id, title, instructions, duration_minutes,
        pass_mark_percent, shuffle_questions, shuffle_options, show_result_immediately,
        max_attempts, starts_at, ends_at, status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      id,
      schoolId,
      parsed.data.academicSessionId ?? null,
      parsed.data.academicTermId ?? null,
      parsed.data.classId,
      parsed.data.armId ?? null,
      parsed.data.subjectId,
      parsed.data.linkedExaminationId ?? null,
      parsed.data.linkedComponentId ?? null,
      parsed.data.title,
      parsed.data.instructions,
      parsed.data.durationMinutes,
      parsed.data.passMarkPercent,
      parsed.data.shuffleQuestions ? 1 : 0,
      parsed.data.shuffleOptions ? 1 : 0,
      parsed.data.showResultImmediately ? 1 : 0,
      parsed.data.maxAttempts,
      parsed.data.startsAt ?? null,
      parsed.data.endsAt ?? null,
      req.auth!.id,
    );

    // Auto-enroll active students in that class/arm as eligible candidates
    const stuRows = parsed.data.armId
      ? (db
          .prepare("SELECT id FROM students WHERE school_id = ? AND current_class_id = ? AND current_arm_id = ? AND status = 'active'")
          .all(schoolId, parsed.data.classId, parsed.data.armId) as Array<{ id: string }>)
      : (db
          .prepare("SELECT id FROM students WHERE school_id = ? AND current_class_id = ? AND status = 'active'")
          .all(schoolId, parsed.data.classId) as Array<{ id: string }>);

    for (const stu of stuRows) {
      db.prepare(`
        INSERT OR IGNORE INTO cbt_exam_candidates (id, school_id, cbt_exam_id, student_id, is_eligible)
        VALUES (?, ?, ?, ?, 1)
      `).run(`ccd_${crypto.randomUUID()}`, schoolId, id, stu.id);
    }

    res.status(201).json({ exam: db.prepare('SELECT * FROM cbt_examinations WHERE id = ?').get(id) });
  },
);

schoolCbtRouter.get(
  '/cbt/exams/:examId',
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const exam = db
      .prepare(`
        SELECT ce.*, sub.name AS subject_name, c.name AS class_name, a.name AS arm_name
        FROM cbt_examinations ce
        INNER JOIN subjects sub ON sub.id = ce.subject_id
        INNER JOIN school_classes c ON c.id = ce.class_id
        LEFT JOIN class_arms a ON a.id = ce.arm_id
        WHERE ce.id = ? AND ce.school_id = ?
      `)
      .get(req.params.examId, schoolId);

    if (!exam) {
      res.status(404).json({ error: 'CBT examination not found.' });
      return;
    }

    const assignedQuestions = db
      .prepare(`
        SELECT ceq.id AS link_id, ceq.question_order, qb.*
        FROM cbt_exam_questions ceq
        INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
        WHERE ceq.school_id = ? AND ceq.cbt_exam_id = ?
        ORDER BY ceq.question_order ASC
      `)
      .all(schoolId, req.params.examId);

    const candidates = db
      .prepare(`
        SELECT cd.*, s.admission_number, s.first_name, s.last_name
        FROM cbt_exam_candidates cd
        INNER JOIN students s ON s.id = cd.student_id
        WHERE cd.school_id = ? AND cd.cbt_exam_id = ?
        ORDER BY s.last_name ASC
      `)
      .all(schoolId, req.params.examId);

    const attempts = db
      .prepare(`
        SELECT att.*, s.admission_number, s.first_name, s.last_name
        FROM cbt_exam_attempts att
        INNER JOIN students s ON s.id = att.student_id
        WHERE att.school_id = ? AND att.cbt_exam_id = ?
        ORDER BY att.started_at DESC
      `)
      .all(schoolId, req.params.examId);

    const activityLogs = db
      .prepare(`
        SELECT cal.*, s.admission_number, s.first_name, s.last_name
        FROM cbt_activity_logs cal
        LEFT JOIN students s ON s.id = cal.student_id
        WHERE cal.school_id = ? AND cal.cbt_exam_id = ?
        ORDER BY cal.created_at DESC
        LIMIT 80
      `)
      .all(schoolId, req.params.examId);

    res.json({ exam, assignedQuestions, candidates, attempts, activityLogs });
  },
);

schoolCbtRouter.patch(
  '/cbt/exams/:examId/settings',
  requireCsrfCheck,
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateCbtExamSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid CBT exam settings.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const existing = db
      .prepare('SELECT * FROM cbt_examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId) as ({ class_id: string; subject_id: string } & Record<string, unknown>) | undefined;
    if (!existing) {
      res.status(404).json({ error: 'CBT examination not found.' });
      return;
    }
    if (!hasPermission(req.auth!.permissions, 'school.cbt.manage')) {
      const authorized = isTeacherAuthorizedForSubjectClass({
        schoolId,
        userId: req.auth!.id,
        classId: existing.class_id,
        subjectId: existing.subject_id,
      });
      if (!authorized) {
        res.status(403).json({ error: 'You are not assigned to manage this CBT examination.' });
        return;
      }
    }

    if ((parsed.data.status === 'published' || parsed.data.status === 'active')) {
      const qCount = (
        db
          .prepare('SELECT COUNT(*) AS c FROM cbt_exam_questions WHERE cbt_exam_id = ? AND school_id = ?')
          .get(req.params.examId, schoolId) as { c: number }
      ).c;
      if (qCount === 0) {
        res.status(400).json({ error: 'Add at least one question before publishing or activating this CBT exam.' });
        return;
      }
    }

    const d = parsed.data;
    db.prepare(`
      UPDATE cbt_examinations SET
        title = COALESCE(?, title),
        instructions = COALESCE(?, instructions),
        duration_minutes = COALESCE(?, duration_minutes),
        pass_mark_percent = COALESCE(?, pass_mark_percent),
        shuffle_questions = COALESCE(?, shuffle_questions),
        shuffle_options = COALESCE(?, shuffle_options),
        show_result_immediately = COALESCE(?, show_result_immediately),
        max_attempts = COALESCE(?, max_attempts),
        linked_component_id = COALESCE(?, linked_component_id),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      d.title ?? null,
      d.instructions ?? null,
      d.durationMinutes ?? null,
      d.passMarkPercent ?? null,
      d.shuffleQuestions === undefined ? null : d.shuffleQuestions ? 1 : 0,
      d.shuffleOptions === undefined ? null : d.shuffleOptions ? 1 : 0,
      d.showResultImmediately === undefined ? null : d.showResultImmediately ? 1 : 0,
      d.maxAttempts ?? null,
      d.linkedComponentId ?? null,
      d.status ?? null,
      req.params.examId,
      schoolId,
    );

    res.json({ exam: db.prepare('SELECT * FROM cbt_examinations WHERE id = ?').get(req.params.examId) });
  },
);

schoolCbtRouter.post(
  '/cbt/exams/:examId/questions',
  requireCsrfCheck,
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = assignCbtQuestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid questions list.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const exam = db
      .prepare('SELECT id, class_id, subject_id FROM cbt_examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId) as { id: string; class_id: string; subject_id: string } | undefined;
    if (!exam) {
      res.status(404).json({ error: 'CBT examination not found.' });
      return;
    }
    if (!hasPermission(req.auth!.permissions, 'school.cbt.manage')) {
      const authorized = isTeacherAuthorizedForSubjectClass({
        schoolId,
        userId: req.auth!.id,
        classId: exam.class_id,
        subjectId: exam.subject_id,
      });
      if (!authorized) {
        res.status(403).json({ error: 'You are not assigned to manage questions for this CBT examination.' });
        return;
      }
    }

    const maxOrder = (
      db.prepare('SELECT COALESCE(MAX(question_order), 0) AS m FROM cbt_exam_questions WHERE cbt_exam_id = ?').get(req.params.examId) as { m: number }
    ).m;

    let order = maxOrder + 1;
    for (const qid of parsed.data.questionIds) {
      const q = db.prepare('SELECT id FROM cbt_question_bank WHERE id = ? AND school_id = ?').get(qid, schoolId);
      if (!q) continue;
      db.prepare(`
        INSERT OR IGNORE INTO cbt_exam_questions (id, school_id, cbt_exam_id, question_id, question_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(`ceq_${crypto.randomUUID()}`, schoolId, req.params.examId, qid, order++);
    }

    const totalMarks = recalculateCbtExamTotalMarks(schoolId, req.params.examId);
    res.json({ ok: true, totalMarks });
  },
);

schoolCbtRouter.put(
  '/cbt/exams/:examId/candidates',
  requireCsrfCheck,
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = assignCbtCandidatesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid candidates list.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const exam = db
      .prepare('SELECT id, class_id, subject_id FROM cbt_examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId) as { id: string; class_id: string; subject_id: string } | undefined;
    if (!exam) {
      res.status(404).json({ error: 'CBT examination not found.' });
      return;
    }
    if (!hasPermission(req.auth!.permissions, 'school.cbt.manage')) {
      const authorized = isTeacherAuthorizedForSubjectClass({
        schoolId,
        userId: req.auth!.id,
        classId: exam.class_id,
        subjectId: exam.subject_id,
      });
      if (!authorized) {
        res.status(403).json({ error: 'You are not assigned to manage candidates for this CBT examination.' });
        return;
      }
    }
    db.prepare('UPDATE cbt_exam_candidates SET is_eligible = 0 WHERE cbt_exam_id = ? AND school_id = ?').run(req.params.examId, schoolId);
    for (const studentId of parsed.data.studentIds) {
      db.prepare(`
        INSERT INTO cbt_exam_candidates (id, school_id, cbt_exam_id, student_id, is_eligible)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(cbt_exam_id, student_id) DO UPDATE SET is_eligible = 1
      `).run(`ccd_${crypto.randomUUID()}`, schoolId, req.params.examId, studentId);
    }
    res.json({ ok: true, eligibleCount: parsed.data.studentIds.length });
  },
);

// Manual Essay Grading
schoolCbtRouter.get(
  '/cbt/attempts/:attemptId/review',
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const attempt = db
      .prepare(`
        SELECT att.*, s.admission_number, s.first_name, s.last_name, ce.title AS exam_title
        FROM cbt_exam_attempts att
        INNER JOIN students s ON s.id = att.student_id
        INNER JOIN cbt_examinations ce ON ce.id = att.cbt_exam_id
        WHERE att.id = ? AND att.school_id = ?
      `)
      .get(req.params.attemptId, schoolId);

    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    const answers = db
      .prepare(`
        SELECT caa.*, qb.question_type, qb.question_text, qb.marks AS max_marks, qb.correct_answer_json
        FROM cbt_attempt_answers caa
        INNER JOIN cbt_question_bank qb ON qb.id = caa.question_id
        WHERE caa.attempt_id = ? AND caa.school_id = ?
      `)
      .all(req.params.attemptId, schoolId);

    res.json({ attempt, answers });
  },
);

schoolCbtRouter.post(
  '/cbt/grade-essay',
  requireCsrfCheck,
  requirePermission('teacher.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = gradeCbtEssaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid essay grade.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const attempt = db
      .prepare('SELECT id, cbt_exam_id, student_id FROM cbt_exam_attempts WHERE id = ? AND school_id = ?')
      .get(parsed.data.attemptId, schoolId) as { id: string; cbt_exam_id: string; student_id: string } | undefined;
    if (!attempt) {
      res.status(404).json({ error: 'CBT attempt not found.' });
      return;
    }

    const exam = db
      .prepare('SELECT pass_mark_percent FROM cbt_examinations WHERE id = ? AND school_id = ?')
      .get(attempt.cbt_exam_id, schoolId) as { pass_mark_percent: number };

    const qRow = db
      .prepare(`
        SELECT COALESCE(ceq.marks_override, qb.marks) AS max_marks
        FROM cbt_exam_questions ceq
        INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
        WHERE ceq.cbt_exam_id = ? AND ceq.question_id = ? AND ceq.school_id = ?
      `)
      .get(attempt.cbt_exam_id, parsed.data.questionId, schoolId) as { max_marks: number } | undefined;

    if (!qRow || parsed.data.marksAwarded > qRow.max_marks) {
      res.status(400).json({ error: `Marks awarded cannot exceed question maximum (${qRow?.max_marks ?? 0}).` });
      return;
    }

    db.prepare(`
      UPDATE cbt_attempt_answers
      SET marks_awarded = ?, grader_feedback = ?, is_correct = CASE WHEN ? > 0 THEN 1 ELSE 0 END
      WHERE attempt_id = ? AND question_id = ? AND school_id = ?
    `).run(
      parsed.data.marksAwarded,
      parsed.data.feedback,
      parsed.data.marksAwarded,
      attempt.id,
      parsed.data.questionId,
      schoolId,
    );

    const allAnswers = db
      .prepare(`
        SELECT qb.question_type, COALESCE(ceq.marks_override, qb.marks) AS max_marks, COALESCE(caa.marks_awarded, 0) AS marks_awarded
        FROM cbt_exam_questions ceq
        INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
        LEFT JOIN cbt_attempt_answers caa ON caa.attempt_id = ? AND caa.question_id = ceq.question_id
        WHERE ceq.cbt_exam_id = ? AND ceq.school_id = ?
      `)
      .all(attempt.id, attempt.cbt_exam_id, schoolId) as Array<{
      question_type: CbtQuestionType;
      max_marks: number;
      marks_awarded: number;
    }>;

    const totals = computeCbtAttemptTotals({
      items: allAnswers.map((a) => ({
        questionType: a.question_type,
        maxMarks: a.max_marks,
        marksAwarded: a.marks_awarded,
      })),
      passMarkPercent: exam.pass_mark_percent,
    });

    db.prepare(`
      UPDATE cbt_exam_attempts
      SET objective_score = ?, manual_score = ?, total_score = ?, max_score = ?, percentage_score = ?,
          passed = ?, status = 'graded', graded_by_user_id = ?, graded_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      totals.objectiveScore,
      totals.manualScore,
      totals.totalScore,
      totals.maxScore,
      totals.percentageScore,
      totals.passed ? 1 : 0,
      req.auth!.id,
      attempt.id,
      schoolId,
    );

    res.json({ totals });
  },
);

// Clean Bridge into Phase 3 Results Engine (explicit admin/authorized sync, never corrupts published results)
schoolCbtRouter.post(
  '/cbt/exams/:examId/sync-results',
  requireCsrfCheck,
  requirePermission('school.cbt.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const exam = db
      .prepare('SELECT * FROM cbt_examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId) as
      | {
          id: string;
          academic_session_id: string | null;
          academic_term_id: string | null;
          class_id: string;
          subject_id: string;
          linked_component_id: string | null;
          title: string;
        }
      | undefined;

    if (!exam) {
      res.status(404).json({ error: 'CBT exam not found.' });
      return;
    }
    if (!exam.academic_term_id || !exam.academic_session_id || !exam.linked_component_id) {
      res.status(400).json({
        error: 'Link this CBT exam to an academic session, term, and Phase 3 Assessment Component before syncing scores.',
      });
      return;
    }

    const comp = db
      .prepare('SELECT id, max_score FROM assessment_components WHERE id = ? AND school_id = ?')
      .get(exam.linked_component_id, schoolId) as { id: string; max_score: number } | undefined;
    if (!comp) {
      res.status(404).json({ error: 'Linked assessment component not found.' });
      return;
    }

    // Refuse overwrite if already published for this class/term
    const published = db
      .prepare("SELECT COUNT(*) AS c FROM result_publications WHERE school_id = ? AND academic_term_id = ? AND class_id = ? AND status IN ('published', 'amended')")
      .get(schoolId, exam.academic_term_id, exam.class_id) as { c: number };
    if (published.c > 0) {
      res.status(409).json({
        error: 'Results for this class/term are already published. Use the audited Result Amendment workflow instead.',
      });
      return;
    }

    const bestAttempts = db
      .prepare(`
        SELECT student_id, MAX(percentage_score) AS best_pct, id AS attempt_id
        FROM cbt_exam_attempts
        WHERE school_id = ? AND cbt_exam_id = ? AND status IN ('graded', 'submitted', 'auto_submitted')
        GROUP BY student_id
      `)
      .all(schoolId, exam.id) as Array<{ student_id: string; best_pct: number; attempt_id: string }>;

    let syncedCount = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const att of bestAttempts) {
        const scaledScore = Math.round(((att.best_pct / 100) * comp.max_score) * 100) / 100;
        db.prepare(`
          INSERT INTO assessment_scores (
            id, school_id, academic_session_id, academic_term_id, class_id, subject_id,
            student_id, component_id, score, status, comment, entered_by_user_id, updated_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scored', ?, ?, ?)
          ON CONFLICT(school_id, academic_term_id, student_id, subject_id, component_id) DO UPDATE SET
            score = excluded.score,
            status = 'scored',
            comment = excluded.comment,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = datetime('now')
        `).run(
          `asc_${crypto.randomUUID()}`,
          schoolId,
          exam.academic_session_id,
          exam.academic_term_id,
          exam.class_id,
          exam.subject_id,
          att.student_id,
          comp.id,
          scaledScore,
          `Synced from CBT: ${exam.title}`,
          req.auth!.id,
          req.auth!.id,
        );
        db.prepare("UPDATE cbt_exam_attempts SET synced_to_results_at = datetime('now') WHERE id = ?").run(att.attempt_id);
        syncedCount++;
      }
      db.exec('COMMIT');
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to sync CBT scores to Results Engine.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.cbt.synced_to_results',
      resourceType: 'cbt_examination',
      resourceId: exam.id,
      outcome: 'success',
      metadata: { syncedCount, componentId: comp.id },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, syncedCount });
  },
);

// Student CBT Portal & Exam Runner Endpoints
schoolCbtRouter.get(
  '/student/cbt',
  requirePermission('student.cbt.take'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare('SELECT id, current_class_id, current_arm_id, first_name, last_name, admission_number FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string; current_class_id: string | null } | undefined;

    if (!student) {
      res.json({ student: null, exams: [] });
      return;
    }

    const exams = db
      .prepare(`
        SELECT ce.id, ce.title, ce.instructions, ce.duration_minutes, ce.pass_mark_percent, ce.total_marks,
               ce.max_attempts, ce.show_result_immediately, ce.starts_at, ce.ends_at, ce.status,
               sub.name AS subject_name, sub.code AS subject_code, c.name AS class_name,
               (SELECT COUNT(*) FROM cbt_exam_questions q WHERE q.cbt_exam_id = ce.id) AS questions_count,
               (SELECT COUNT(*) FROM cbt_exam_attempts att WHERE att.cbt_exam_id = ce.id AND att.student_id = ?) AS used_attempts,
               (SELECT att.id FROM cbt_exam_attempts att WHERE att.cbt_exam_id = ce.id AND att.student_id = ? ORDER BY att.attempt_number DESC LIMIT 1) AS latest_attempt_id,
               (SELECT att.status FROM cbt_exam_attempts att WHERE att.cbt_exam_id = ce.id AND att.student_id = ? ORDER BY att.attempt_number DESC LIMIT 1) AS latest_attempt_status,
               (SELECT att.percentage_score FROM cbt_exam_attempts att WHERE att.cbt_exam_id = ce.id AND att.student_id = ? ORDER BY att.attempt_number DESC LIMIT 1) AS latest_percentage
        FROM cbt_examinations ce
        INNER JOIN subjects sub ON sub.id = ce.subject_id
        INNER JOIN school_classes c ON c.id = ce.class_id
        INNER JOIN cbt_exam_candidates cd ON cd.cbt_exam_id = ce.id AND cd.student_id = ? AND cd.is_eligible = 1
        WHERE ce.school_id = ? AND ce.status IN ('published', 'active', 'closed')
        ORDER BY ce.created_at DESC
      `)
      .all(student.id, student.id, student.id, student.id, student.id, schoolId);

    res.json({ student, exams });
  },
);

schoolCbtRouter.post(
  '/student/cbt/:examId/start',
  requireCsrfCheck,
  requirePermission('student.cbt.take'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare("SELECT id FROM students WHERE school_id = ? AND user_id = ? AND status = 'active' LIMIT 1")
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    if (!student) {
      res.status(403).json({ error: 'Active student profile required to take CBT.' });
      return;
    }

    const exam = db
      .prepare('SELECT * FROM cbt_examinations WHERE id = ? AND school_id = ?')
      .get(req.params.examId, schoolId) as
      | {
          id: string;
          title: string;
          duration_minutes: number;
          max_attempts: number;
          shuffle_questions: number;
          shuffle_options: number;
          status: string;
        }
      | undefined;

    if (!exam || (exam.status !== 'active' && exam.status !== 'published')) {
      res.status(400).json({ error: 'This CBT examination is not currently open for sitting.' });
      return;
    }

    const eligible = db
      .prepare('SELECT id FROM cbt_exam_candidates WHERE cbt_exam_id = ? AND student_id = ? AND school_id = ? AND is_eligible = 1')
      .get(exam.id, student.id, schoolId);
    if (!eligible) {
      res.status(403).json({ error: 'You are not registered as an eligible candidate for this exam.' });
      return;
    }

    // Resume active attempt if still valid
    const inProgress = db
      .prepare("SELECT * FROM cbt_exam_attempts WHERE cbt_exam_id = ? AND student_id = ? AND status = 'in_progress' ORDER BY attempt_number DESC LIMIT 1")
      .get(exam.id, student.id) as { id: string; expires_at: string } | undefined;

    if (inProgress) {
      if (isCbtAttemptExpired(inProgress.expires_at)) {
        finalizeAttemptSubmission({
          schoolId,
          attemptId: inProgress.id,
          submissionType: 'auto_submitted',
          ipAddress: getClientIp(req),
        });
      } else {
        res.json({ attemptId: inProgress.id, resumed: true });
        return;
      }
    }

    const existingAttempts = (
      db
        .prepare('SELECT COUNT(*) AS c FROM cbt_exam_attempts WHERE cbt_exam_id = ? AND student_id = ?')
        .get(exam.id, student.id) as { c: number }
    ).c;

    if (existingAttempts >= exam.max_attempts) {
      res.status(409).json({ error: `Maximum attempts (${exam.max_attempts}) reached for this examination.` });
      return;
    }

    const examQuestions = db
      .prepare(`
        SELECT ceq.question_id, qb.options_json
        FROM cbt_exam_questions ceq
        INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
        WHERE ceq.cbt_exam_id = ? AND ceq.school_id = ?
        ORDER BY ceq.question_order ASC
      `)
      .all(exam.id, schoolId) as Array<{ question_id: string; options_json: string }>;

    if (examQuestions.length === 0) {
      res.status(400).json({ error: 'Exam contains no questions yet.' });
      return;
    }

    const attemptId = `cat_${crypto.randomUUID()}`;
    const qIds = examQuestions.map((q) => q.question_id);
    const orderedQIds = exam.shuffle_questions === 1 ? seededShuffle(qIds, attemptId) : qIds;
    const optionOrders: Record<string, string[]> = {};
    for (const q of examQuestions) {
      try {
        const opts = JSON.parse(q.options_json) as string[];
        if (Array.isArray(opts) && opts.length > 0) {
          optionOrders[q.question_id] = exam.shuffle_options === 1 ? seededShuffle(opts, `${attemptId}:${q.question_id}`) : opts;
        }
      } catch {
        // skip
      }
    }

    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + exam.duration_minutes * 60_000).toISOString();

    db.prepare(`
      INSERT INTO cbt_exam_attempts (
        id, school_id, cbt_exam_id, student_id, attempt_number,
        question_order_json, option_orders_json, started_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')
    `).run(
      attemptId,
      schoolId,
      exam.id,
      student.id,
      existingAttempts + 1,
      JSON.stringify(orderedQIds),
      JSON.stringify(optionOrders),
      startedAt,
      expiresAt,
    );

    db.prepare(`
      INSERT INTO cbt_activity_logs (id, school_id, cbt_exam_id, attempt_id, student_id, event_type, event_detail, ip_address)
      VALUES (?, ?, ?, ?, ?, 'exam_started', ?, ?)
    `).run(`cal_${crypto.randomUUID()}`, schoolId, exam.id, attemptId, student.id, `Attempt #${existingAttempts + 1}`, getClientIp(req));

    res.status(201).json({ attemptId, startedAt, expiresAt });
  },
);

schoolCbtRouter.get(
  '/student/cbt/attempts/:attemptId',
  requirePermission('student.cbt.take'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    if (!student) {
      res.status(403).json({ error: 'Student profile not found.' });
      return;
    }

    let attempt = db
      .prepare(`
        SELECT att.*, ce.title AS exam_title, ce.instructions, ce.duration_minutes,
               ce.show_result_immediately, ce.pass_mark_percent, sub.name AS subject_name
        FROM cbt_exam_attempts att
        INNER JOIN cbt_examinations ce ON ce.id = att.cbt_exam_id
        INNER JOIN subjects sub ON sub.id = ce.subject_id
        WHERE att.id = ? AND att.student_id = ? AND att.school_id = ?
      `)
      .get(req.params.attemptId, student.id, schoolId) as
      | {
          id: string;
          cbt_exam_id: string;
          status: string;
          expires_at: string;
          started_at: string;
          submitted_at: string | null;
          question_order_json: string;
          option_orders_json: string;
          exam_title: string;
          instructions: string;
          duration_minutes: number;
          show_result_immediately: number;
          pass_mark_percent: number;
          subject_name: string;
          total_score: number;
          max_score: number;
          percentage_score: number;
          passed: number;
        }
      | undefined;

    if (!attempt) {
      res.status(404).json({ error: 'CBT attempt not found.' });
      return;
    }

    if (attempt.status === 'in_progress' && isCbtAttemptExpired(attempt.expires_at)) {
      finalizeAttemptSubmission({
        schoolId,
        attemptId: attempt.id,
        submissionType: 'auto_submitted',
        ipAddress: getClientIp(req),
      });
      attempt = db
        .prepare(`
          SELECT att.*, ce.title AS exam_title, ce.instructions, ce.duration_minutes,
                 ce.show_result_immediately, ce.pass_mark_percent, sub.name AS subject_name
          FROM cbt_exam_attempts att
          INNER JOIN cbt_examinations ce ON ce.id = att.cbt_exam_id
          INNER JOIN subjects sub ON sub.id = ce.subject_id
          WHERE att.id = ? AND att.student_id = ? AND att.school_id = ?
        `)
        .get(req.params.attemptId, student.id, schoolId) as typeof attempt;
    }

    const qOrder: string[] = JSON.parse(attempt.question_order_json || '[]');
    const optOrders: Record<string, string[]> = JSON.parse(attempt.option_orders_json || '{}');
    const qRows = db
      .prepare(`
        SELECT qb.id, qb.question_type, qb.question_text, qb.options_json, qb.topic,
               COALESCE(ceq.marks_override, qb.marks) AS marks
        FROM cbt_exam_questions ceq
        INNER JOIN cbt_question_bank qb ON qb.id = ceq.question_id
        WHERE ceq.cbt_exam_id = ? AND ceq.school_id = ?
      `)
      .all(attempt.cbt_exam_id, schoolId) as Array<{
      id: string;
      question_type: CbtQuestionType;
      question_text: string;
      options_json: string;
      topic: string;
      marks: number;
    }>;
    const qMap = new Map(qRows.map((q) => [q.id, q]));

    const ansRows = db
      .prepare('SELECT question_id, answer_json, is_flagged FROM cbt_attempt_answers WHERE attempt_id = ? AND school_id = ?')
      .all(attempt.id, schoolId) as Array<{ question_id: string; answer_json: string; is_flagged: number }>;
    const ansMap = new Map(ansRows.map((a) => [a.question_id, a]));

    const questions = qOrder
      .map((qid) => qMap.get(qid))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .map((q, idx) => {
        const saved = ansMap.get(q.id);
        let parsedAnswer = '';
        if (saved) {
          try {
            parsedAnswer = String(JSON.parse(saved.answer_json) ?? '');
          } catch {
            parsedAnswer = saved.answer_json;
          }
        }
        const defaultOpts = (() => {
          try {
            return JSON.parse(q.options_json) as string[];
          } catch {
            return [];
          }
        })();
        return {
          index: idx + 1,
          id: q.id,
          questionType: q.question_type,
          questionText: q.question_text,
          topic: q.topic,
          marks: q.marks,
          options: optOrders[q.id] ?? defaultOpts,
          savedAnswer: parsedAnswer,
          isFlagged: saved?.is_flagged === 1,
        };
      });

    const secondsRemaining = Math.max(
      0,
      Math.floor((Date.parse(attempt.expires_at) - Date.now()) / 1000),
    );

    res.json({
      attempt: {
        id: attempt.id,
        examTitle: attempt.exam_title,
        subjectName: attempt.subject_name,
        instructions: attempt.instructions,
        status: attempt.status,
        startedAt: attempt.started_at,
        expiresAt: attempt.expires_at,
        submittedAt: attempt.submitted_at,
        secondsRemaining: attempt.status === 'in_progress' ? secondsRemaining : 0,
        showResultImmediately: attempt.show_result_immediately === 1,
        summary:
          attempt.status !== 'in_progress' && attempt.show_result_immediately === 1
            ? {
                totalScore: attempt.total_score,
                maxScore: attempt.max_score,
                percentageScore: attempt.percentage_score,
                passed: attempt.passed === 1,
              }
            : null,
      },
      questions,
    });
  },
);

schoolCbtRouter.put(
  '/student/cbt/attempts/:attemptId/answer',
  requireCsrfCheck,
  requirePermission('student.cbt.take'),
  (req: AuthenticatedRequest, res) => {
    const parsed = saveCbtAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid answer payload.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;
    if (!student) {
      res.status(403).json({ error: 'Student profile not found.' });
      return;
    }

    const attempt = db
      .prepare('SELECT id, cbt_exam_id, status, expires_at FROM cbt_exam_attempts WHERE id = ? AND student_id = ? AND school_id = ?')
      .get(req.params.attemptId, student.id, schoolId) as
      | { id: string; cbt_exam_id: string; status: string; expires_at: string }
      | undefined;
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.status !== 'in_progress') {
      res.status(409).json({ error: 'Attempt has already been submitted.' });
      return;
    }
    if (isCbtAttemptExpired(attempt.expires_at)) {
      finalizeAttemptSubmission({
        schoolId,
        attemptId: attempt.id,
        submissionType: 'auto_submitted',
        ipAddress: getClientIp(req),
      });
      res.status(409).json({ error: 'Examination timer expired; your answers were auto-submitted.' });
      return;
    }

    db.prepare(`
      INSERT INTO cbt_attempt_answers (id, school_id, attempt_id, question_id, answer_json, is_flagged, answered_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        answer_json = excluded.answer_json,
        is_flagged = COALESCE(?, is_flagged),
        answered_at = datetime('now')
    `).run(
      `caa_${crypto.randomUUID()}`,
      schoolId,
      attempt.id,
      parsed.data.questionId,
      JSON.stringify(parsed.data.answer),
      parsed.data.isFlagged ? 1 : 0,
      parsed.data.isFlagged === undefined ? null : parsed.data.isFlagged ? 1 : 0,
    );

    res.json({ ok: true });
  },
);

schoolCbtRouter.post(
  '/student/cbt/attempts/:attemptId/event',
  requireCsrfCheck,
  requirePermission('student.cbt.take'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;
    if (!student) {
      res.status(403).json({ error: 'Student profile not found.' });
      return;
    }
    const attempt = db
      .prepare('SELECT id, cbt_exam_id, status FROM cbt_exam_attempts WHERE id = ? AND student_id = ? AND school_id = ?')
      .get(req.params.attemptId, student.id, schoolId) as { id: string; cbt_exam_id: string; status: string } | undefined;
    if (!attempt || attempt.status !== 'in_progress') {
      res.json({ ok: true });
      return;
    }

    const eventType = req.body?.eventType === 'focus_lost' ? 'focus_lost' : 'tab_hidden';
    db.prepare('UPDATE cbt_exam_attempts SET tab_switch_count = tab_switch_count + 1 WHERE id = ?').run(attempt.id);
    db.prepare(`
      INSERT INTO cbt_activity_logs (id, school_id, cbt_exam_id, attempt_id, student_id, event_type, event_detail, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `cal_${crypto.randomUUID()}`,
      schoolId,
      attempt.cbt_exam_id,
      attempt.id,
      student.id,
      eventType,
      String(req.body?.detail ?? 'Browser visibility/focus event').slice(0, 180),
      getClientIp(req),
    );
    res.json({ ok: true });
  },
);

schoolCbtRouter.post(
  '/student/cbt/attempts/:attemptId/submit',
  requireCsrfCheck,
  requirePermission('student.cbt.take'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;
    if (!student) {
      res.status(403).json({ error: 'Student profile not found.' });
      return;
    }

    const attempt = db
      .prepare('SELECT id, status, expires_at FROM cbt_exam_attempts WHERE id = ? AND student_id = ? AND school_id = ?')
      .get(req.params.attemptId, student.id, schoolId) as { id: string; status: string; expires_at: string } | undefined;
    if (!attempt) {
      res.status(404).json({ error: 'CBT attempt not found.' });
      return;
    }

    if (attempt.status !== 'in_progress') {
      res.json({ ok: true, alreadySubmitted: true });
      return;
    }

    const expired = isCbtAttemptExpired(attempt.expires_at);
    const finalized = finalizeAttemptSubmission({
      schoolId,
      attemptId: attempt.id,
      submissionType: expired ? 'auto_submitted' : 'submitted',
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, ...(finalized ?? {}) });
  },
);
