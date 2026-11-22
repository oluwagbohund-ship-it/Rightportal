import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../../db/client.ts';
import {
  buildSimpleTabularPdf,
  evaluatePromotionCandidate,
  roundAcademicScore,
} from '../../../academics-engine.ts';
import { recordAuditLog } from '../../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../../middleware.ts';
import { validateActiveClassAndArm } from '../../../school-helpers.ts';
import {
  decidePromotionRecommendationSchema,
  generatePromotionRecommendationsSchema,
  upsertReportCardTemplateSchema,
  upsertStudentTermReportExtrasSchema,
} from '../../../validation.ts';
import {
  ensureSchoolAcademicDefaults,
  isTeacherAuthorizedForStudent,
} from './helpers.ts';

export const reportCardsPromotionsRouter = Router();

reportCardsPromotionsRouter.get(
  '/academics/report-card-template',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const template = db
      .prepare('SELECT * FROM report_card_templates WHERE school_id = ? AND is_default = 1 LIMIT 1')
      .get(schoolId);
    res.json({ template });
  },
);

reportCardsPromotionsRouter.put(
  '/academics/report-card-template',
  requireCsrfCheck,
  requirePermission('school.results.compute'),
  (req: AuthenticatedRequest, res) => {
    const parsed = upsertReportCardTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid report card template.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const d = parsed.data;

    db.prepare(`
      UPDATE report_card_templates
      SET name = ?, header_subtitle = ?, show_position = ?, show_class_average = ?,
          show_attendance = ?, show_affective_traits = ?, show_grading_scale = ?,
          principal_title = ?, footer_note = ?, updated_at = datetime('now')
      WHERE school_id = ? AND is_default = 1
    `).run(
      d.name,
      d.headerSubtitle,
      d.showPosition ? 1 : 0,
      d.showClassAverage ? 1 : 0,
      d.showAttendance ? 1 : 0,
      d.showAffectiveTraits ? 1 : 0,
      d.showGradingScale ? 1 : 0,
      d.principalTitle,
      d.footerNote,
      schoolId,
    );

    const template = db
      .prepare('SELECT * FROM report_card_templates WHERE school_id = ? AND is_default = 1 LIMIT 1')
      .get(schoolId);
    res.json({ template });
  },
);

// Attendance summaries, Affective/Psychomotor traits, Teacher & Principal comments
reportCardsPromotionsRouter.get(
  '/academics/report-extras',
  requirePermission('teacher.comments.manage'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';
    if (!academicTermId || !studentId) {
      res.status(400).json({ error: 'academicTermId and studentId are required.' });
      return;
    }

    if (
      req.auth!.roleCode === 'teacher' &&
      !isTeacherAuthorizedForStudent({ schoolId, userId: req.auth!.id, studentId })
    ) {
      res.status(403).json({ error: 'You are not assigned to this student class.' });
      return;
    }

    const db = getDb();
    const attendance = db
      .prepare('SELECT * FROM student_attendance_summaries WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
      .get(schoolId, academicTermId, studentId);
    const traits = db
      .prepare('SELECT * FROM student_affective_traits WHERE school_id = ? AND academic_term_id = ? AND student_id = ? ORDER BY trait_category ASC, trait_name ASC')
      .all(schoolId, academicTermId, studentId);
    const teacherComment = db
      .prepare('SELECT * FROM teacher_comments WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
      .get(schoolId, academicTermId, studentId);
    const principalComment = db
      .prepare('SELECT * FROM principal_comments WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
      .get(schoolId, academicTermId, studentId);

    res.json({
      attendance: attendance ?? null,
      traits,
      teacherComment: teacherComment ?? null,
      principalComment: principalComment ?? null,
    });
  },
);

reportCardsPromotionsRouter.post(
  '/academics/report-extras',
  requireCsrfCheck,
  requirePermission('teacher.comments.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = upsertStudentTermReportExtrasSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid report remark payload.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;

    if (
      req.auth!.roleCode === 'teacher' &&
      !isTeacherAuthorizedForStudent({ schoolId, userId: req.auth!.id, studentId: d.studentId })
    ) {
      res.status(403).json({ error: 'You are not authorized to update remarks for this student.' });
      return;
    }

    const term = db
      .prepare('SELECT id, academic_session_id FROM academic_terms WHERE id = ? AND school_id = ?')
      .get(d.academicTermId, schoolId) as { id: string; academic_session_id: string } | undefined;
    if (!term) {
      res.status(404).json({ error: 'Academic term not found.' });
      return;
    }

    const stu = db
      .prepare('SELECT id FROM students WHERE id = ? AND school_id = ?')
      .get(d.studentId, schoolId);
    if (!stu) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.attendance) {
        if (d.attendance.daysPresent + d.attendance.daysAbsent > d.attendance.daysOpened && d.attendance.daysOpened > 0) {
          throw new Error('Days present + absent cannot exceed total days opened.');
        }
        db.prepare(`
          INSERT INTO student_attendance_summaries (
            id, school_id, academic_session_id, academic_term_id, student_id,
            days_opened, days_present, days_absent, late_count, updated_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(school_id, academic_term_id, student_id) DO UPDATE SET
            days_opened = excluded.days_opened,
            days_present = excluded.days_present,
            days_absent = excluded.days_absent,
            late_count = excluded.late_count,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = datetime('now')
        `).run(
          `sas_${crypto.randomUUID()}`,
          schoolId,
          term.academic_session_id,
          d.academicTermId,
          d.studentId,
          d.attendance.daysOpened,
          d.attendance.daysPresent,
          d.attendance.daysAbsent,
          d.attendance.lateCount,
          req.auth!.id,
        );
      }

      if (d.traits) {
        for (const trait of d.traits) {
          db.prepare(`
            INSERT INTO student_affective_traits (
              id, school_id, academic_session_id, academic_term_id, student_id,
              trait_category, trait_name, rating, updated_by_user_id, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(school_id, academic_term_id, student_id, trait_name) DO UPDATE SET
              trait_category = excluded.trait_category,
              rating = excluded.rating,
              updated_by_user_id = excluded.updated_by_user_id,
              updated_at = datetime('now')
          `).run(
            `sat_${crypto.randomUUID()}`,
            schoolId,
            term.academic_session_id,
            d.academicTermId,
            d.studentId,
            trait.traitCategory,
            trait.traitName,
            trait.rating,
            req.auth!.id,
          );
        }
      }

      if (d.teacherComment !== undefined) {
        const teacherRow = db
          .prepare('SELECT id FROM teachers WHERE school_id = ? AND user_id = ? LIMIT 1')
          .get(schoolId, req.auth!.id) as { id: string } | undefined;

        db.prepare(`
          INSERT INTO teacher_comments (
            id, school_id, academic_session_id, academic_term_id, student_id, teacher_id, comment, updated_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(school_id, academic_term_id, student_id) DO UPDATE SET
            teacher_id = COALESCE(excluded.teacher_id, teacher_comments.teacher_id),
            comment = excluded.comment,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = datetime('now')
        `).run(
          `tcm_${crypto.randomUUID()}`,
          schoolId,
          term.academic_session_id,
          d.academicTermId,
          d.studentId,
          teacherRow?.id ?? null,
          d.teacherComment,
          req.auth!.id,
        );
      }

      if (d.principalComment !== undefined) {
        if (req.auth!.roleCode !== 'school_admin') {
          throw new Error('Only School Administrators may set Principal / Head of School comments.');
        }
        db.prepare(`
          INSERT INTO principal_comments (
            id, school_id, academic_session_id, academic_term_id, student_id, comment, updated_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(school_id, academic_term_id, student_id) DO UPDATE SET
            comment = excluded.comment,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = datetime('now')
        `).run(
          `pcm_${crypto.randomUUID()}`,
          schoolId,
          term.academic_session_id,
          d.academicTermId,
          d.studentId,
          d.principalComment,
          req.auth!.id,
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save report extras.' });
      return;
    }

    res.json({ ok: true });
  },
);

// Helper to authorize and load complete Report Card data (strictly enforcing published-only for Student & Parent)
function buildStudentReportCardPayload(params: {
  schoolId: string;
  userId: string;
  roleCode: string;
  studentId: string;
  academicTermId: string;
}): { errorStatus?: number; error?: string; data?: Record<string, unknown> } {
  const db = getDb();
  ensureSchoolAcademicDefaults(params.schoolId);

  const student = db
    .prepare(`
      SELECT
        s.*, c.name AS class_name, c.section AS class_section, a.name AS arm_name
      FROM students s
      LEFT JOIN school_classes c ON c.id = s.current_class_id
      LEFT JOIN class_arms a ON a.id = s.current_arm_id
      WHERE s.id = ? AND s.school_id = ?
    `)
    .get(params.studentId, params.schoolId) as
    | (Record<string, unknown> & {
        id: string;
        user_id: string | null;
        first_name: string;
        middle_name: string;
        last_name: string;
        admission_number: string;
        class_name: string | null;
        arm_name: string | null;
      })
    | undefined;

  if (!student) {
    return { errorStatus: 404, error: 'Student not found in your school.' };
  }

  let requirePublished = false;
  if (params.roleCode === 'student') {
    if (student.user_id !== params.userId) {
      return { errorStatus: 403, error: 'Students may only access their own report cards.' };
    }
    requirePublished = true;
  } else if (params.roleCode === 'parent') {
    const wardLink = db
      .prepare(`
        SELECT sg.can_view_academic_records
        FROM parents p
        INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
        WHERE p.school_id = ? AND p.user_id = ? AND p.status = 'active' AND sg.student_id = ?
        LIMIT 1
      `)
      .get(params.schoolId, params.userId, params.studentId) as { can_view_academic_records: number } | undefined;

    if (!wardLink || wardLink.can_view_academic_records !== 1) {
      return { errorStatus: 403, error: 'Guardian academic record access is not permitted for this student.' };
    }
    requirePublished = true;
  } else if (params.roleCode === 'teacher') {
    if (!isTeacherAuthorizedForStudent({ schoolId: params.schoolId, userId: params.userId, studentId: params.studentId })) {
      return { errorStatus: 403, error: 'You are not assigned to this student class.' };
    }
  } else if (params.roleCode !== 'school_admin') {
    return { errorStatus: 403, error: 'Unauthorized role for report card access.' };
  }

  const term = db
    .prepare(`
      SELECT t.*, s.name AS session_name
      FROM academic_terms t
      INNER JOIN academic_sessions s ON s.id = t.academic_session_id
      WHERE t.id = ? AND t.school_id = ?
    `)
    .get(params.academicTermId, params.schoolId) as
    | { id: string; name: string; session_name: string }
    | undefined;

  if (!term) {
    return { errorStatus: 404, error: 'Academic term not found.' };
  }

  const publication = db
    .prepare(`
      SELECT rp.*, cls.name AS result_class_name, arm.name AS result_arm_name
      FROM result_publications rp
      INNER JOIN school_classes cls ON cls.id = rp.class_id
      LEFT JOIN class_arms arm ON arm.id = rp.arm_id
      WHERE rp.school_id = ? AND rp.academic_term_id = ? AND rp.student_id = ?
    `)
    .get(params.schoolId, params.academicTermId, params.studentId) as
    | (Record<string, unknown> & {
        id: string;
        status: string;
        grading_system_id: string;
        average_score: number;
        total_score_obtained: number;
        total_max_possible: number;
        overall_grade: string;
        overall_remark: string;
        class_position: number | null;
        class_size: number;
        result_class_name: string;
        result_arm_name: string | null;
      })
    | undefined;

  if (!publication) {
    return {
      errorStatus: 404,
      error: 'No computed report card exists yet for this student in the selected term.',
    };
  }

  if (requirePublished && publication.status !== 'published' && publication.status !== 'amended') {
    return {
      errorStatus: 403,
      error: 'Results for this term have not been officially published yet.',
    };
  }

  const school = db
    .prepare(`
      SELECT s.id, s.name, s.code, s.country, s.city, s.contact_email, s.phone,
             sp.motto, sp.physical_address, sp.website, sp.logo_file_id
      FROM schools s
      LEFT JOIN school_profiles sp ON sp.school_id = s.id
      WHERE s.id = ?
    `)
    .get(params.schoolId) as Record<string, unknown> & { name: string; code: string; motto: string; country: string; city: string };

  const template = db
    .prepare('SELECT * FROM report_card_templates WHERE school_id = ? AND is_default = 1 LIMIT 1')
    .get(params.schoolId);

  const subjectResults = db
    .prepare(`
      SELECT
        cr.*, sub.name AS subject_name, sub.code AS subject_code
      FROM computed_results cr
      INNER JOIN subjects sub ON sub.id = cr.subject_id
      WHERE cr.school_id = ? AND cr.academic_term_id = ? AND cr.student_id = ?
        ${requirePublished ? "AND cr.status IN ('published', 'amended')" : ''}
      ORDER BY sub.name ASC
    `)
    .all(params.schoolId, params.academicTermId, params.studentId) as Array<
    Record<string, unknown> & {
      subject_name: string;
      subject_code: string;
      ca_score: number;
      exam_score: number;
      total_score: number;
      percentage_score: number;
      grade: string;
      remark: string;
      class_average: number;
      subject_position: number | null;
    }
  >;

  const gradingBands = db
    .prepare('SELECT min_score, max_score, grade, remark, grade_point FROM grading_bands WHERE grading_system_id = ? AND school_id = ? ORDER BY min_score DESC')
    .all(publication.grading_system_id, params.schoolId);

  const attendance = db
    .prepare('SELECT * FROM student_attendance_summaries WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
    .get(params.schoolId, params.academicTermId, params.studentId);

  const traits = db
    .prepare('SELECT * FROM student_affective_traits WHERE school_id = ? AND academic_term_id = ? AND student_id = ? ORDER BY trait_category ASC, trait_name ASC')
    .all(params.schoolId, params.academicTermId, params.studentId);

  const teacherComment = db
    .prepare('SELECT comment, updated_at FROM teacher_comments WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
    .get(params.schoolId, params.academicTermId, params.studentId) as { comment: string } | undefined;

  const principalComment = db
    .prepare('SELECT comment, updated_at FROM principal_comments WHERE school_id = ? AND academic_term_id = ? AND student_id = ?')
    .get(params.schoolId, params.academicTermId, params.studentId) as { comment: string } | undefined;

  return {
    data: {
      school,
      term,
      student,
      template,
      publication,
      subjectResults,
      gradingBands,
      attendance: attendance ?? null,
      traits,
      teacherComment: teacherComment?.comment ?? '',
      principalComment: principalComment?.comment ?? '',
    },
  };
}

reportCardsPromotionsRouter.get(
  '/academics/report-cards/:studentId',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    if (!academicTermId) {
      res.status(400).json({ error: 'academicTermId query parameter is required.' });
      return;
    }

    const result = buildStudentReportCardPayload({
      schoolId,
      userId: req.auth!.id,
      roleCode: req.auth!.roleCode,
      studentId: req.params.studentId,
      academicTermId,
    });

    if (result.errorStatus) {
      res.status(result.errorStatus).json({ error: result.error });
      return;
    }
    res.json(result.data);
  },
);

reportCardsPromotionsRouter.get(
  '/academics/report-cards/:studentId/pdf',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    if (!academicTermId) {
      res.status(400).json({ error: 'academicTermId query parameter is required.' });
      return;
    }

    const result = buildStudentReportCardPayload({
      schoolId,
      userId: req.auth!.id,
      roleCode: req.auth!.roleCode,
      studentId: req.params.studentId,
      academicTermId,
    });

    if (result.errorStatus || !result.data) {
      res.status(result.errorStatus ?? 404).json({ error: result.error ?? 'Report card unavailable.' });
      return;
    }

    const payload = result.data as {
      school: { name: string; code: string; motto: string; city: string; country: string };
      term: { session_name: string; name: string };
      student: { first_name: string; middle_name: string; last_name: string; admission_number: string };
      publication: {
        result_class_name: string;
        result_arm_name: string | null;
        average_score: number;
        overall_grade: string;
        overall_remark: string;
        class_position: number | null;
        class_size: number;
        status: string;
      };
      subjectResults: Array<{
        subject_name: string;
        ca_score: number;
        exam_score: number;
        percentage_score: number;
        grade: string;
        class_average: number;
        remark: string;
      }>;
      teacherComment: string;
      principalComment: string;
    };

    const fullName = `${payload.student.first_name} ${payload.student.middle_name} ${payload.student.last_name}`.replace(/\s+/g, ' ').trim();
    const classLabel = `${payload.publication.result_class_name}${payload.publication.result_arm_name ? ` - ${payload.publication.result_arm_name}` : ''}`;

    const pdf = buildSimpleTabularPdf({
      title: `${payload.school.name} - Official Report Card`,
      subtitle: `${payload.term.session_name} | ${payload.term.name} | ${payload.school.city}, ${payload.school.country}`,
      metaLines: [
        `Student: ${fullName}   |   Admission No: ${payload.student.admission_number}`,
        `Class: ${classLabel}   |   Status: ${payload.publication.status.toUpperCase()}`,
        `Overall Average: ${payload.publication.average_score}%   |   Grade: ${payload.publication.overall_grade} (${payload.publication.overall_remark})   |   Position: ${payload.publication.class_position ?? '-'} of ${payload.publication.class_size}`,
      ],
      columns: [
        { label: 'Subject', x: 42 },
        { label: 'CA', x: 225 },
        { label: 'Exam', x: 270 },
        { label: 'Score (%)', x: 320 },
        { label: 'Class Avg', x: 385 },
        { label: 'Grade', x: 448 },
        { label: 'Remark', x: 492 },
      ],
      rows: payload.subjectResults.map((s) => [
        s.subject_name,
        String(s.ca_score),
        String(s.exam_score),
        `${s.percentage_score}%`,
        `${s.class_average}%`,
        s.grade,
        s.remark,
      ]),
      footerLines: [
        `Class Teacher Remark: ${payload.teacherComment || 'Satisfactory academic engagement.'}`,
        `Principal Remark: ${payload.principalComment || 'Keep striving for excellence.'}`,
        `Dave Timi EdTech Systems - Build * Innovate * Transform | School Code: ${payload.school.code}`,
      ],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-card-${payload.student.admission_number}-${payload.term.name.replace(/\s+/g, '-')}.pdf"`,
    );
    res.send(pdf);
  },
);

// Student & Parent Published Result Portals
reportCardsPromotionsRouter.get(
  '/academics/student/published-results',
  requirePermission('student.results.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const student = db
      .prepare('SELECT id, first_name, last_name, admission_number FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, req.auth!.id) as { id: string } | undefined;

    if (!student) {
      res.json({ student: null, publications: [], subjectResults: [] });
      return;
    }

    const publications = db
      .prepare(`
        SELECT
          rp.*, trm.name AS term_name, ses.name AS session_name, cls.name AS class_name, arm.name AS arm_name
        FROM result_publications rp
        INNER JOIN academic_terms trm ON trm.id = rp.academic_term_id
        INNER JOIN academic_sessions ses ON ses.id = rp.academic_session_id
        INNER JOIN school_classes cls ON cls.id = rp.class_id
        LEFT JOIN class_arms arm ON arm.id = rp.arm_id
        WHERE rp.school_id = ? AND rp.student_id = ? AND rp.status IN ('published', 'amended')
        ORDER BY ses.start_date DESC, trm.term_order DESC
      `)
      .all(schoolId, student.id);

    const subjectResults = db
      .prepare(`
        SELECT
          cr.*, sub.name AS subject_name, sub.code AS subject_code, trm.name AS term_name
        FROM computed_results cr
        INNER JOIN subjects sub ON sub.id = cr.subject_id
        INNER JOIN academic_terms trm ON trm.id = cr.academic_term_id
        WHERE cr.school_id = ? AND cr.student_id = ? AND cr.status IN ('published', 'amended')
        ORDER BY trm.term_order DESC, sub.name ASC
      `)
      .all(schoolId, student.id);

    res.json({ student, publications, subjectResults });
  },
);

reportCardsPromotionsRouter.get(
  '/academics/parent/wards-results',
  requirePermission('parent.results.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const parent = db
      .prepare("SELECT id, full_name FROM parents WHERE school_id = ? AND user_id = ? AND status = 'active' LIMIT 1")
      .get(schoolId, req.auth!.id) as { id: string; full_name: string } | undefined;

    if (!parent) {
      res.json({ parent: null, wards: [], publications: [], subjectResults: [] });
      return;
    }

    const wards = db
      .prepare(`
        SELECT
          sg.student_id, sg.relationship, sg.can_view_academic_records,
          st.admission_number, st.first_name, st.last_name,
          cls.name AS class_name, arm.name AS arm_name
        FROM student_guardians sg
        INNER JOIN students st ON st.id = sg.student_id
        LEFT JOIN school_classes cls ON cls.id = st.current_class_id
        LEFT JOIN class_arms arm ON arm.id = st.current_arm_id
        WHERE sg.school_id = ? AND sg.parent_id = ?
        ORDER BY st.last_name ASC
      `)
      .all(schoolId, parent.id) as Array<{
      student_id: string;
      can_view_academic_records: number;
    }>;

    const allowedStudentIds = wards
      .filter((w) => w.can_view_academic_records === 1)
      .map((w) => w.student_id);

    if (allowedStudentIds.length === 0) {
      res.json({ parent, wards, publications: [], subjectResults: [] });
      return;
    }

    const placeholders = allowedStudentIds.map(() => '?').join(',');
    const publications = db
      .prepare(`
        SELECT
          rp.*, trm.name AS term_name, ses.name AS session_name, cls.name AS class_name, arm.name AS arm_name,
          st.first_name, st.last_name, st.admission_number
        FROM result_publications rp
        INNER JOIN academic_terms trm ON trm.id = rp.academic_term_id
        INNER JOIN academic_sessions ses ON ses.id = rp.academic_session_id
        INNER JOIN school_classes cls ON cls.id = rp.class_id
        LEFT JOIN class_arms arm ON arm.id = rp.arm_id
        INNER JOIN students st ON st.id = rp.student_id
        WHERE rp.school_id = ? AND rp.student_id IN (${placeholders}) AND rp.status IN ('published', 'amended')
        ORDER BY ses.start_date DESC, trm.term_order DESC
      `)
      .all(schoolId, ...allowedStudentIds);

    const subjectResults = db
      .prepare(`
        SELECT
          cr.*, sub.name AS subject_name, sub.code AS subject_code, trm.name AS term_name
        FROM computed_results cr
        INNER JOIN subjects sub ON sub.id = cr.subject_id
        INNER JOIN academic_terms trm ON trm.id = cr.academic_term_id
        WHERE cr.school_id = ? AND cr.student_id IN (${placeholders}) AND cr.status IN ('published', 'amended')
        ORDER BY sub.name ASC
      `)
      .all(schoolId, ...allowedStudentIds);

    res.json({ parent, wards, publications, subjectResults });
  },
);

// Promotion Recommendation Engine & Explicit Admin Approval
reportCardsPromotionsRouter.get(
  '/academics/promotions/recommendations',
  requirePermission('school.promotions.approve'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const sessionId = typeof req.query.academicSessionId === 'string' ? req.query.academicSessionId : '';

    const recommendations = db
      .prepare(`
        SELECT
          pr.*,
          st.admission_number, st.first_name, st.last_name,
          fc.name AS from_class_name,
          tc.name AS recommended_to_class_name,
          ses.name AS session_name
        FROM promotion_recommendations pr
        INNER JOIN students st ON st.id = pr.student_id
        INNER JOIN school_classes fc ON fc.id = pr.from_class_id
        LEFT JOIN school_classes tc ON tc.id = pr.recommended_to_class_id
        INNER JOIN academic_sessions ses ON ses.id = pr.academic_session_id
        WHERE pr.school_id = ?
          ${sessionId ? 'AND pr.academic_session_id = ?' : ''}
        ORDER BY pr.approval_status = 'pending' DESC, pr.average_score DESC
      `)
      .all(...(sessionId ? [schoolId, sessionId] : [schoolId]));

    res.json({ recommendations });
  },
);

reportCardsPromotionsRouter.post(
  '/academics/promotions/recommendations/generate',
  requireCsrfCheck,
  requirePermission('school.promotions.approve'),
  (req: AuthenticatedRequest, res) => {
    const parsed = generatePromotionRecommendationsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid promotion generation request.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const d = parsed.data;

    const fromClass = db
      .prepare('SELECT id, name, level_order FROM school_classes WHERE id = ? AND school_id = ?')
      .get(d.fromClassId, schoolId) as { id: string; name: string; level_order: number } | undefined;

    if (!fromClass) {
      res.status(404).json({ error: 'Source class not found.' });
      return;
    }

    let nextClassId = d.targetToClassId || null;
    if (!nextClassId) {
      const nextClass = db
        .prepare(`
          SELECT id FROM school_classes
          WHERE school_id = ? AND status = 'active' AND level_order > ?
          ORDER BY level_order ASC LIMIT 1
        `)
        .get(schoolId, fromClass.level_order) as { id: string } | undefined;
      nextClassId = nextClass?.id ?? null;
    }

    const students = db
      .prepare(`
        SELECT id, current_arm_id FROM students
        WHERE school_id = ? AND status = 'active' AND current_class_id = ?
      `)
      .all(schoolId, d.fromClassId) as Array<{ id: string; current_arm_id: string | null }>;

    if (students.length === 0) {
      res.status(400).json({ error: 'No active students found in the selected class.' });
      return;
    }

    let generated = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const stu of students) {
        const pubs = db
          .prepare(`
            SELECT average_score, subjects_passed, subjects_count
            FROM result_publications
            WHERE school_id = ? AND student_id = ? AND academic_session_id = ?
              ${d.academicTermId ? 'AND academic_term_id = ?' : ''}
          `)
          .all(
            ...(d.academicTermId
              ? [schoolId, stu.id, d.academicSessionId, d.academicTermId]
              : [schoolId, stu.id, d.academicSessionId]),
          ) as Array<{ average_score: number; subjects_passed: number; subjects_count: number }>;

        const avgScore =
          pubs.length > 0
            ? roundAcademicScore(pubs.reduce((s, p) => s + p.average_score, 0) / pubs.length, settings.score_rounding_mode)
            : 0;
        const totalPassed = pubs.reduce((s, p) => s + p.subjects_passed, 0);
        const totalSubjects = pubs.reduce((s, p) => s + p.subjects_count, 0);

        const evaluation = evaluatePromotionCandidate({
          averageScore: avgScore,
          subjectsPassed: totalPassed,
          subjectsTotal: totalSubjects,
          minAverage: settings.promotion_min_average,
          minPassSubjects: settings.promotion_min_pass_subjects,
        });

        // Do NOT auto-promote! Record pending recommendation only.
        db.prepare(`
          INSERT INTO promotion_recommendations (
            id, school_id, academic_session_id, academic_term_id, student_id,
            from_class_id, from_arm_id, recommended_to_class_id,
            average_score, subjects_passed, subjects_total,
            recommendation, recommendation_reason, approval_status, generated_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
          ON CONFLICT(school_id, academic_session_id, student_id) DO UPDATE SET
            academic_term_id = excluded.academic_term_id,
            from_class_id = excluded.from_class_id,
            from_arm_id = excluded.from_arm_id,
            recommended_to_class_id = excluded.recommended_to_class_id,
            average_score = excluded.average_score,
            subjects_passed = excluded.subjects_passed,
            subjects_total = excluded.subjects_total,
            recommendation = excluded.recommendation,
            recommendation_reason = excluded.recommendation_reason,
            approval_status = CASE WHEN promotion_recommendations.approval_status = 'approved' THEN 'approved' ELSE 'pending' END,
            updated_at = datetime('now')
        `).run(
          `prec_${crypto.randomUUID()}`,
          schoolId,
          d.academicSessionId,
          d.academicTermId || null,
          stu.id,
          d.fromClassId,
          stu.current_arm_id,
          evaluation.recommendation === 'recommended_retain' ? d.fromClassId : nextClassId,
          avgScore,
          totalPassed,
          totalSubjects,
          evaluation.recommendation,
          evaluation.reason,
          req.auth!.id,
        );
        generated += 1;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to generate recommendations.' });
      return;
    }

    res.status(201).json({ ok: true, generated });
  },
);

reportCardsPromotionsRouter.post(
  '/academics/promotions/recommendations/:id/decide',
  requireCsrfCheck,
  requirePermission('school.promotions.approve'),
  (req: AuthenticatedRequest, res) => {
    const parsed = decidePromotionRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid promotion decision.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const rec = db
      .prepare('SELECT * FROM promotion_recommendations WHERE id = ? AND school_id = ?')
      .get(req.params.id, schoolId) as
      | {
          id: string;
          student_id: string;
          academic_session_id: string;
          from_class_id: string;
          from_arm_id: string | null;
          recommended_to_class_id: string | null;
          recommended_to_arm_id: string | null;
          recommendation: string;
          approval_status: string;
        }
      | undefined;

    if (!rec) {
      res.status(404).json({ error: 'Promotion recommendation not found.' });
      return;
    }
    if (rec.approval_status === 'approved') {
      res.status(409).json({ error: 'This promotion recommendation has already been approved.' });
      return;
    }

    const d = parsed.data;
    const targetClassId = d.toClassId || rec.recommended_to_class_id;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.decision === 'approved') {
        if (!targetClassId) {
          throw new Error('Select a valid destination class before approving promotion.');
        }

        const placement = validateActiveClassAndArm({
          schoolId,
          classId: targetClassId,
          armId: d.toArmId || null,
          excludeStudentId: rec.student_id,
        });
        if (!placement.ok) {
          throw new Error(placement.error);
        }

        db.prepare(`
          UPDATE students
          SET current_class_id = ?, current_arm_id = ?, updated_at = datetime('now')
          WHERE id = ? AND school_id = ?
        `).run(targetClassId, d.toArmId || null, rec.student_id, schoolId);

        db.prepare(`
          UPDATE class_enrollments
          SET status = 'completed', ended_at = datetime('now')
          WHERE school_id = ? AND student_id = ? AND status = 'active'
        `).run(schoolId, rec.student_id);

        db.prepare(`
          INSERT INTO class_enrollments (
            id, school_id, student_id, class_id, arm_id, academic_session_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'active')
        `).run(
          `cen_${crypto.randomUUID()}`,
          schoolId,
          rec.student_id,
          targetClassId,
          d.toArmId || null,
          rec.academic_session_id,
        );

        db.prepare(`
          INSERT INTO student_class_history (
            id, school_id, student_id, academic_session_id, from_class_id, from_arm_id,
            to_class_id, to_arm_id, action_type, effective_date, notes, recorded_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?)
        `).run(
          `schh_${crypto.randomUUID()}`,
          schoolId,
          rec.student_id,
          rec.academic_session_id,
          rec.from_class_id,
          rec.from_arm_id,
          targetClassId,
          d.toArmId || null,
          targetClassId === rec.from_class_id ? 'reassignment' : 'promotion',
          d.notes || `Approved academic promotion (${rec.recommendation})`,
          req.auth!.id,
        );
      }

      db.prepare(`
        UPDATE promotion_recommendations
        SET approval_status = ?,
            recommended_to_class_id = COALESCE(?, recommended_to_class_id),
            recommended_to_arm_id = ?,
            approved_by_user_id = ?,
            decision_notes = ?,
            decided_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(
        d.decision,
        targetClassId,
        d.toArmId || null,
        req.auth!.id,
        d.notes,
        rec.id,
        schoolId,
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to decide promotion.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: `school.promotion.${d.decision}`,
      resourceType: 'promotion_recommendation',
      resourceId: rec.id,
      outcome: 'success',
      metadata: { studentId: rec.student_id, targetClassId },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, decision: d.decision });
  },
);
