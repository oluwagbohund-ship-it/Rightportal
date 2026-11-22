import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import {
  buildSchoolAnalyticsContext,
  getAiCoreBlueprint,
  getGeminiStatus,
  runGroundedAiCoreQuery,
} from '../../ai-core.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { hasPermission } from '../../security.ts';
import { aiAssistantQuerySchema } from '../../validation-v1.ts';

export const schoolAiRouter = Router();

schoolAiRouter.get(
  '/ai/overview',
  requirePermission('ai.core.view'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.overview.read') && req.auth!.roleCode === 'school_admin';
    const context = buildSchoolAnalyticsContext(schoolId, null, isAdmin ? undefined : req.auth!.id);

    const recentLogs = db
      .prepare(`
        SELECT l.*, u.full_name AS user_name
        FROM ai_core_query_logs l
        INNER JOIN users u ON u.id = l.user_id
        WHERE l.school_id = ? ${isAdmin ? '' : 'AND l.user_id = ?'}
        ORDER BY l.created_at DESC
        LIMIT 20
      `)
      .all(...(isAdmin ? [schoolId] : [schoolId, req.auth!.id]));

    const insights = db
      .prepare(`
        SELECT *
        FROM ai_generated_insights
        WHERE school_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `)
      .all(schoolId);

    res.json({
      blueprint: getAiCoreBlueprint(),
      geminiStatus: getGeminiStatus(),
      analytics: context,
      recentLogs,
      insights,
    });
  },
);

schoolAiRouter.get(
  '/ai/analytics',
  requirePermission('ai.core.view'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : null;
    const isAdmin = req.auth!.roleCode === 'school_admin';
    const analytics = buildSchoolAnalyticsContext(schoolId, academicTermId, isAdmin ? undefined : req.auth!.id);

    res.json({
      geminiStatus: getGeminiStatus(),
      analytics,
    });
  },
);

schoolAiRouter.post(
  '/ai/insights/generate',
  requireCsrfCheck,
  requirePermission('ai.core.use'),
  async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = req.auth!.roleCode === 'school_admin';
    const insightType = typeof req.body?.insightType === 'string' ? req.body.insightType : 'academic_overview';
    const academicTermId = typeof req.body?.academicTermId === 'string' ? req.body.academicTermId : null;

    const analytics = buildSchoolAnalyticsContext(schoolId, academicTermId, isAdmin ? undefined : req.auth!.id);
    const weakSubjects = analytics.academics.subjectAverages.filter((s) => s.average_score < 55);
    const dataSummary = [
      `Attendance (30d): ${analytics.attendanceLast30Days.attendanceRatePercent}% across ${analytics.attendanceLast30Days.totalMarks} marks.`,
      `At-risk students (<50% avg): ${analytics.academics.atRiskStudents.length}.`,
      `Subjects below 55% average: ${weakSubjects.map((w) => `${w.subject_name} (${w.average_score}%)`).join(', ') || 'None'}.`,
      `CBT Completed Attempts: ${analytics.cbt.completedAttempts} (avg ${analytics.cbt.averagePercentage}%).`,
    ].join(' ');

    let aiNarrative = '';
    let sourceType: 'sql_analytics' | 'gemini_enriched' = 'sql_analytics';

    const gemini = getGeminiStatus();
    if (gemini.configured) {
      const gen = await runGroundedAiCoreQuery({
        schoolId,
        userId: req.auth!.id,
        roleCode: req.auth!.roleCode,
        moduleDomain: 'academic_insights',
        prompt: `Provide a concise, actionable institutional briefing (${insightType}) based strictly on these metrics.`,
        contextData: analytics,
      });
      if (gen.ok && gen.answer) {
        aiNarrative = gen.answer;
        sourceType = 'gemini_enriched';
      }
    }

    const id = `aii_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO ai_generated_insights (
        id, school_id, academic_term_id, insight_type, title, data_summary, ai_narrative, source_type, generated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      schoolId,
      academicTermId || null,
      insightType,
      `Institutional Intelligence Briefing — ${new Date().toISOString().slice(0, 10)}`,
      dataSummary,
      aiNarrative,
      sourceType,
      req.auth!.id,
    );

    const insight = db.prepare('SELECT * FROM ai_generated_insights WHERE id = ?').get(id);
    res.status(201).json({ insight, geminiStatus: gemini });
  },
);

schoolAiRouter.post(
  '/ai/assistant',
  requireCsrfCheck,
  requirePermission('ai.core.use'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = aiAssistantQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid AI assistant query.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = req.auth!.roleCode === 'school_admin';
    const contextData = buildSchoolAnalyticsContext(
      schoolId,
      parsed.data.academicTermId ?? null,
      isAdmin ? undefined : req.auth!.id,
    );

    const result = await runGroundedAiCoreQuery({
      schoolId,
      userId: req.auth!.id,
      roleCode: req.auth!.roleCode,
      moduleDomain: parsed.data.moduleDomain,
      prompt: parsed.data.prompt,
      contextData,
    });

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.ai_core.queried',
      resourceType: 'ai_core',
      outcome: result.ok ? 'success' : 'failure',
      metadata: {
        moduleDomain: parsed.data.moduleDomain,
        providerStatus: result.providerStatus,
      },
      ipAddress: getClientIp(req),
    });

    res.json({
      ...result,
      analyticsSnapshot: contextData,
    });
  },
);
