import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { type AuthenticatedRequest, requirePermission } from '../../middleware.ts';
import { assessmentsExamsRouter } from './academics/assessments-exams.ts';
import { enrollmentsRouter } from './academics/enrollments.ts';
import { gradingResultsRouter } from './academics/grading-results.ts';
import { ensureSchoolAcademicDefaults } from './academics/helpers.ts';
import { reportCardsPromotionsRouter } from './academics/report-cards-promotions.ts';
import { sessionsTermsRouter } from './academics/sessions-terms.ts';

export const schoolAcademicsRouter = Router();

schoolAcademicsRouter.get(
  '/academics/overview',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();

    const activeTerm = db
      .prepare(`
        SELECT t.*, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ? AND t.is_current = 1
        LIMIT 1
      `)
      .get(schoolId) as { id: string; name: string; session_name: string } | undefined;

    const fallbackTerm =
      activeTerm ??
      (db
        .prepare(`
          SELECT t.*, s.name AS session_name
          FROM academic_terms t
          INNER JOIN academic_sessions s ON s.id = t.academic_session_id
          WHERE t.school_id = ?
          ORDER BY t.start_date DESC LIMIT 1
        `)
        .get(schoolId) as { id: string; name: string; session_name: string } | undefined);

    const stats = {
      sessionsCount: (db.prepare('SELECT COUNT(*) AS c FROM academic_sessions WHERE school_id = ?').get(schoolId) as { c: number }).c,
      termsCount: (db.prepare('SELECT COUNT(*) AS c FROM academic_terms WHERE school_id = ?').get(schoolId) as { c: number }).c,
      upcomingEventsCount: (db.prepare("SELECT COUNT(*) AS c FROM academic_events WHERE school_id = ? AND end_date >= date('now')").get(schoolId) as { c: number }).c,
      activeEnrollmentsCount: (db.prepare("SELECT COUNT(*) AS c FROM student_subject_enrollments WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c,
      assessmentComponentsCount: (db.prepare('SELECT COUNT(*) AS c FROM assessment_components WHERE school_id = ? AND is_active = 1').get(schoolId) as { c: number }).c,
      pendingScoreBatchesCount: (db.prepare("SELECT COUNT(*) AS c FROM score_submission_batches WHERE school_id = ? AND status IN ('submitted', 'under_review')").get(schoolId) as { c: number }).c,
      examinationsCount: (db.prepare('SELECT COUNT(*) AS c FROM examinations WHERE school_id = ?').get(schoolId) as { c: number }).c,
      gradingSystemsCount: (db.prepare('SELECT COUNT(*) AS c FROM grading_systems WHERE school_id = ? AND is_active = 1').get(schoolId) as { c: number }).c,
      computedResultsCount: fallbackTerm
        ? (db.prepare('SELECT COUNT(*) AS c FROM computed_results WHERE school_id = ? AND academic_term_id = ?').get(schoolId, fallbackTerm.id) as { c: number }).c
        : 0,
      publishedResultsCount: fallbackTerm
        ? (db.prepare("SELECT COUNT(*) AS c FROM result_publications WHERE school_id = ? AND academic_term_id = ? AND status IN ('published', 'amended')").get(schoolId, fallbackTerm.id) as { c: number }).c
        : 0,
      pendingPromotionsCount: (db.prepare("SELECT COUNT(*) AS c FROM promotion_recommendations WHERE school_id = ? AND approval_status = 'pending'").get(schoolId) as { c: number }).c,
    };

    const classPerformance = fallbackTerm
      ? db
          .prepare(`
            SELECT
              cls.id AS class_id, cls.name AS class_name,
              COUNT(rp.id) AS ranked_students,
              ROUND(AVG(rp.average_score), 2) AS class_average,
              SUM(CASE WHEN rp.status IN ('published', 'amended') THEN 1 ELSE 0 END) AS published_count
            FROM result_publications rp
            INNER JOIN school_classes cls ON cls.id = rp.class_id
            WHERE rp.school_id = ? AND rp.academic_term_id = ?
            GROUP BY cls.id, cls.name
            ORDER BY cls.level_order ASC
          `)
          .all(schoolId, fallbackTerm.id)
      : [];

    const recentBatches = db
      .prepare(`
        SELECT sb.id, sb.status, sb.updated_at, cls.name AS class_name, sub.name AS subject_name, trm.name AS term_name
        FROM score_submission_batches sb
        INNER JOIN school_classes cls ON cls.id = sb.class_id
        INNER JOIN subjects sub ON sub.id = sb.subject_id
        INNER JOIN academic_terms trm ON trm.id = sb.academic_term_id
        WHERE sb.school_id = ?
        ORDER BY sb.updated_at DESC LIMIT 6
      `)
      .all(schoolId);

    const upcomingEvents = db
      .prepare(`
        SELECT id, title, event_type, start_date, end_date
        FROM academic_events
        WHERE school_id = ?
        ORDER BY start_date ASC LIMIT 6
      `)
      .all(schoolId);

    res.json({
      activeTerm: fallbackTerm ?? null,
      stats,
      classPerformance,
      recentBatches,
      upcomingEvents,
    });
  },
);

schoolAcademicsRouter.use(sessionsTermsRouter);
schoolAcademicsRouter.use(enrollmentsRouter);
schoolAcademicsRouter.use(assessmentsExamsRouter);
schoolAcademicsRouter.use(gradingResultsRouter);
schoolAcademicsRouter.use(reportCardsPromotionsRouter);
