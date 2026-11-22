import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { getDb } from '../db/client.ts';

export type AiCoreCapabilityStatus = 'active' | 'inactive';

export interface AiCoreModuleDescriptor {
  id: string;
  name: string;
  domain: 'analytics' | 'academic_insights' | 'school_performance' | 'administrative_assistance';
  status: AiCoreCapabilityStatus;
  phaseTarget: string;
  tenantScope: 'platform' | 'school';
  requiredPermission: string;
  summary: string;
  dataDependencies: string[];
}

export interface AiCoreBlueprint {
  engineName: 'DT AI CORE';
  architecturePhase: string;
  activeInferenceEnabled: boolean;
  providerConfigured: boolean;
  modelName: string;
  modules: AiCoreModuleDescriptor[];
}

export function getGeminiStatus(): {
  configured: boolean;
  model: 'gemini-4-hydrogen';
  state: 'active' | 'inactive_no_key';
} {
  const raw = (process.env.GEMINI_API_KEY || '').trim();
  const configured = Boolean(raw && raw !== 'MY_GEMINI_API_KEY' && raw !== 'YOUR_API_KEY');
  return {
    configured,
    model: 'gemini-4-hydrogen',
    state: configured ? 'active' : 'inactive_no_key',
  };
}

export function getAiCoreBlueprint(): AiCoreBlueprint {
  const gemini = getGeminiStatus();
  const status: AiCoreCapabilityStatus = gemini.configured ? 'active' : 'inactive';
  return {
    engineName: 'DT AI CORE',
    architecturePhase: gemini.configured
      ? 'Phase 10 — Active Grounded Analytics & Gemini Synthesis'
      : 'Phase 10 — SQL Analytics Active (Gemini API Key Not Configured)',
    activeInferenceEnabled: gemini.configured,
    providerConfigured: gemini.configured,
    modelName: gemini.model,
    modules: [
      {
        id: 'ai-educational-analytics',
        name: 'Educational Analytics Engine',
        domain: 'analytics',
        status: 'active',
        phaseTarget: 'Phase 10',
        tenantScope: 'school',
        requiredPermission: 'ai.core.view',
        summary:
          'SQL-grounded attendance trends, fee collection ratios, CBT pass rates, and cohort pacing diagnostics scoped strictly per school tenant.',
        dataDependencies: ['academic_terms', 'attendance_records', 'student_fee_assignments', 'cbt_attempts'],
      },
      {
        id: 'ai-academic-insights',
        name: 'Academic Insights Synthesizer',
        domain: 'academic_insights',
        status,
        phaseTarget: 'Phase 10',
        tenantScope: 'school',
        requiredPermission: 'ai.core.view',
        summary:
          'Subject mastery variance detection, weak-topic spotting, and early at-risk learner interventions grounded in institutional records.',
        dataDependencies: ['computed_results', 'result_publications', 'cbt_attempts'],
      },
      {
        id: 'ai-school-performance',
        name: 'School Performance Analysis',
        domain: 'school_performance',
        status: 'active',
        phaseTarget: 'Phase 10',
        tenantScope: 'platform',
        requiredPermission: 'ai.core.view',
        summary:
          'Platform and tenant-level institutional benchmarks and operational health telemetry with strict tenant privacy boundaries.',
        dataDependencies: ['schools', 'academic_sessions', 'computed_results'],
      },
      {
        id: 'ai-admin-assistance',
        name: 'Administrative Assistance Copilot',
        domain: 'administrative_assistance',
        status,
        phaseTarget: 'Phase 10',
        tenantScope: 'school',
        requiredPermission: 'ai.core.use',
        summary:
          'Data-grounded administrative drafting and operational action recommendations backed by Gemini when GEMINI_API_KEY is configured.',
        dataDependencies: ['academic_terms', 'fee_payments', 'announcements', 'audit_logs'],
      },
    ],
  };
}

export function buildSchoolAnalyticsContext(schoolId: string, academicTermId?: string | null, teacherUserId?: string) {
  const db = getDb();

  const school = db
    .prepare('SELECT id, name, code, city, country, status FROM schools WHERE id = ?')
    .get(schoolId) as { id: string; name: string; code: string; city: string; country: string; status: string } | undefined;

  const activeTerm = academicTermId
    ? db
        .prepare('SELECT id, name, status FROM academic_terms WHERE id = ? AND school_id = ?')
        .get(academicTermId, schoolId)
    : db
        .prepare('SELECT id, name, status FROM academic_terms WHERE school_id = ? AND is_current = 1 LIMIT 1')
        .get(schoolId);

  const counts = {
    students: (db.prepare("SELECT COUNT(*) AS c FROM students WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c,
    teachers: (db.prepare("SELECT COUNT(*) AS c FROM teachers WHERE school_id = ? AND employment_status = 'active'").get(schoolId) as { c: number }).c,
    classes: (db.prepare("SELECT COUNT(*) AS c FROM school_classes WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c,
    subjects: (db.prepare("SELECT COUNT(*) AS c FROM subjects WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c,
  };

  let teacherClassIds: string[] | null = null;
  if (teacherUserId) {
    const teacher = db
      .prepare("SELECT id FROM teachers WHERE school_id = ? AND user_id = ? AND employment_status = 'active' LIMIT 1")
      .get(schoolId, teacherUserId) as { id: string } | undefined;
    if (teacher) {
      const c1 = db
        .prepare('SELECT DISTINCT class_id FROM class_teacher_assignments WHERE school_id = ? AND teacher_id = ? AND is_active = 1')
        .all(schoolId, teacher.id) as Array<{ class_id: string }>;
      const c2 = db
        .prepare('SELECT DISTINCT class_id FROM teacher_subject_assignments WHERE school_id = ? AND teacher_id = ? AND is_active = 1 AND class_id IS NOT NULL')
        .all(schoolId, teacher.id) as Array<{ class_id: string }>;
      teacherClassIds = Array.from(new Set([...c1.map((x) => x.class_id), ...c2.map((x) => x.class_id)]));
    } else {
      teacherClassIds = [];
    }
  }

  const classFilterSql =
    teacherClassIds !== null
      ? teacherClassIds.length > 0
        ? `AND class_id IN (${teacherClassIds.map(() => '?').join(',')})`
        : 'AND 1 = 0'
      : '';
  const classFilterParams = teacherClassIds ?? [];

  const attSummary = db
    .prepare(`
      SELECT
        COUNT(*) AS total_marks,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) AS excused_count
      FROM attendance_records
      WHERE school_id = ? AND date(attendance_date) >= date('now', '-30 days') ${classFilterSql}
    `)
    .get(schoolId, ...classFilterParams) as Record<string, number | null>;

  const totalMarks = attSummary.total_marks ?? 0;
  const presentPlusLate = (attSummary.present_count ?? 0) + (attSummary.late_count ?? 0);
  const attendanceRatePercent = totalMarks > 0 ? Math.round((presentPlusLate / totalMarks) * 1000) / 10 : 0;

  const termFilterSql = (activeTerm as { id?: string } | undefined)?.id ? 'AND cr.academic_term_id = ?' : '';
  const termFilterParams = (activeTerm as { id?: string } | undefined)?.id
    ? [(activeTerm as { id: string }).id]
    : [];

  const subjectAverages = db
    .prepare(`
      SELECT
        sub.id AS subject_id,
        sub.name AS subject_name,
        ROUND(AVG(cr.percentage_score), 2) AS average_score,
        COUNT(*) AS records_count,
        SUM(CASE WHEN cr.is_passing = 1 THEN 1 ELSE 0 END) AS pass_count
      FROM computed_results cr
      INNER JOIN subjects sub ON sub.id = cr.subject_id
      WHERE cr.school_id = ? ${termFilterSql} ${classFilterSql.replace(/class_id/g, 'cr.class_id')}
      GROUP BY sub.id, sub.name
      ORDER BY average_score ASC
      LIMIT 15
    `)
    .all(schoolId, ...termFilterParams, ...classFilterParams) as Array<{
    subject_id: string;
    subject_name: string;
    average_score: number;
    records_count: number;
    pass_count: number;
  }>;

  const atRiskStudents = db
    .prepare(`
      SELECT
        s.id AS student_id,
        s.admission_number,
        (s.first_name || ' ' || s.last_name) AS student_name,
        c.name AS class_name,
        ROUND(AVG(cr.percentage_score), 2) AS average_score,
        COUNT(*) AS subjects_counted
      FROM computed_results cr
      INNER JOIN students s ON s.id = cr.student_id
      LEFT JOIN school_classes c ON c.id = cr.class_id
      WHERE cr.school_id = ? ${termFilterSql} ${classFilterSql.replace(/class_id/g, 'cr.class_id')}
      GROUP BY s.id, s.admission_number, s.first_name, s.last_name, c.name
      HAVING AVG(cr.percentage_score) < 50
      ORDER BY average_score ASC
      LIMIT 15
    `)
    .all(schoolId, ...termFilterParams, ...classFilterParams) as Array<{
    student_id: string;
    admission_number: string;
    student_name: string;
    class_name: string | null;
    average_score: number;
    subjects_counted: number;
  }>;

  const cbtStats = db
    .prepare(`
      SELECT
        COUNT(*) AS attempts_count,
        ROUND(AVG(percentage_score), 2) AS avg_percentage,
        SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed_count
      FROM cbt_exam_attempts
      WHERE school_id = ? AND status IN ('submitted', 'graded', 'auto_submitted')
    `)
    .get(schoolId) as { attempts_count: number; avg_percentage: number | null; passed_count: number | null };

  // Exclude finance metrics when invoked in teacher scope
  let financeSummary: Record<string, number> | null = null;
  if (teacherClassIds === null) {
    const fin = db
      .prepare(`
        SELECT
          COALESCE(SUM(net_amount), 0) AS total_billed,
          COALESCE(SUM(amount_paid), 0) AS total_collected,
          COALESCE(SUM(balance_due), 0) AS total_outstanding
        FROM student_fee_assignments
        WHERE school_id = ?
      `)
      .get(schoolId) as { total_billed: number; total_collected: number; total_outstanding: number };
    const expenses = (
      db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM school_expenses WHERE school_id = ? AND status != 'voided'").get(schoolId) as { total: number }
    ).total;
    const pendingPayments = (
      db.prepare("SELECT COUNT(*) AS count FROM fee_payments WHERE school_id = ? AND status = 'pending_verification'").get(schoolId) as { count: number }
    ).count;

    financeSummary = {
      totalBilled: Number(fin.total_billed ?? 0),
      totalCollected: Number(fin.total_collected ?? 0),
      totalOutstanding: Number(fin.total_outstanding ?? 0),
      totalExpenses: Number(expenses ?? 0),
      pendingPaymentVerifications: pendingPayments,
      collectionRatePercent:
        fin.total_billed > 0 ? Math.round((fin.total_collected / fin.total_billed) * 1000) / 10 : 0,
    };
  }

  return {
    school,
    activeTerm: activeTerm ?? null,
    counts,
    attendanceLast30Days: {
      totalMarks,
      presentCount: attSummary.present_count ?? 0,
      lateCount: attSummary.late_count ?? 0,
      absentCount: attSummary.absent_count ?? 0,
      excusedCount: attSummary.excused_count ?? 0,
      attendanceRatePercent,
    },
    academics: {
      subjectAverages,
      atRiskStudents,
    },
    cbt: {
      completedAttempts: cbtStats.attempts_count ?? 0,
      averagePercentage: Number(cbtStats.avg_percentage ?? 0),
      passedCount: cbtStats.passed_count ?? 0,
    },
    finance: financeSummary,
  };
}

export async function runGroundedAiCoreQuery(params: {
  schoolId: string | null;
  userId: string;
  roleCode: string;
  moduleDomain: string;
  prompt: string;
  contextData: unknown;
}): Promise<{
  ok: boolean;
  providerStatus: 'active_gemini' | 'inactive_no_key' | 'error';
  modelName: string;
  answer: string | null;
  error?: string;
}> {
  const db = getDb();
  const gemini = getGeminiStatus();
  const logId = `ail_${crypto.randomUUID()}`;

  if (!gemini.configured) {
    db.prepare(`
      INSERT INTO ai_core_query_logs (
        id, school_id, user_id, role_code, module_domain, prompt_summary, provider_status, model_name, data_grounded
      ) VALUES (?, ?, ?, ?, ?, ?, 'inactive_no_key', ?, 1)
    `).run(logId, params.schoolId, params.userId, params.roleCode, params.moduleDomain, params.prompt.slice(0, 180), gemini.model);

    return {
      ok: false,
      providerStatus: 'inactive_no_key',
      modelName: gemini.model,
      answer: null,
      error:
        'Generative AI narrative is currently inactive because GEMINI_API_KEY is not configured in server secrets. Real database analytics remain active below.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemPrompt = [
      'You are DT AI CORE, the official education intelligence assistant for Dave Timi EdTech Systems.',
      'STRICT RULES:',
      '1. Ground every metric, count, student name, subject, and financial figure strictly in the verified JSON database context provided below.',
      '2. NEVER invent, guess, or extrapolate statistics or names that do not appear in the JSON context.',
      '3. If the data in the JSON context is empty or zero, clearly state that no records exist yet for that metric.',
      '4. Keep responses concise, structured, actionable, and appropriate for an educator or school administrator.',
      '',
      `Verified Tenant Database Context JSON:\n${JSON.stringify(params.contextData, null, 2)}`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: gemini.model,
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${params.prompt}` }] },
      ],
    });

    const answer = response.text?.trim() || 'No text returned by AI provider.';

    db.prepare(`
      INSERT INTO ai_core_query_logs (
        id, school_id, user_id, role_code, module_domain, prompt_summary, provider_status, model_name, data_grounded
      ) VALUES (?, ?, ?, ?, ?, ?, 'active_gemini', ?, 1)
    `).run(logId, params.schoolId, params.userId, params.roleCode, params.moduleDomain, params.prompt.slice(0, 180), gemini.model);

    return {
      ok: true,
      providerStatus: 'active_gemini',
      modelName: gemini.model,
      answer,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI provider error.';
    db.prepare(`
      INSERT INTO ai_core_query_logs (
        id, school_id, user_id, role_code, module_domain, prompt_summary, provider_status, model_name, data_grounded
      ) VALUES (?, ?, ?, ?, ?, ?, 'error', ?, 1)
    `).run(logId, params.schoolId, params.userId, params.roleCode, params.moduleDomain, params.prompt.slice(0, 180), gemini.model);

    return {
      ok: false,
      providerStatus: 'error',
      modelName: gemini.model,
      answer: null,
      error: `Gemini provider error: ${message}`,
    };
  }
}
