import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../../db/client.ts';
import { rangesOverlap } from '../../../academics-engine.ts';
import { recordAuditLog } from '../../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../../middleware.ts';
import {
  createAcademicEventSchema,
  createAcademicTermSchema,
  updateAcademicTermSchema,
  updateSchoolAcademicSettingsSchema,
  updateSessionLifecycleSchema,
} from '../../../validation.ts';
import { ensureSchoolAcademicDefaults } from './helpers.ts';

export const sessionsTermsRouter = Router();

sessionsTermsRouter.get(
  '/academics/settings',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureSchoolAcademicDefaults(schoolId);
    res.json({ settings });
  },
);

sessionsTermsRouter.put(
  '/academics/settings',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSchoolAcademicSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid academic settings.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const d = parsed.data;

    db.prepare(`
      UPDATE school_academic_settings
      SET session_naming_convention = ?,
          term_naming_convention = ?,
          default_terms_per_session = ?,
          allow_overlapping_sessions = ?,
          allow_overlapping_terms = ?,
          score_rounding_mode = ?,
          tie_ranking_mode = ?,
          missing_score_policy = ?,
          promotion_min_average = ?,
          promotion_min_pass_subjects = ?,
          updated_at = datetime('now')
      WHERE school_id = ?
    `).run(
      d.sessionNamingConvention,
      d.termNamingConvention,
      d.defaultTermsPerSession,
      d.allowOverlappingSessions ? 1 : 0,
      d.allowOverlappingTerms ? 1 : 0,
      d.scoreRoundingMode,
      d.tieRankingMode,
      d.missingScorePolicy,
      d.promotionMinAverage,
      d.promotionMinPassSubjects,
      schoolId,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.academic_settings.updated',
      resourceType: 'school_academic_settings',
      resourceId: schoolId,
      outcome: 'success',
      ipAddress: getClientIp(req),
    });

    const settings = db.prepare('SELECT * FROM school_academic_settings WHERE school_id = ?').get(schoolId);
    res.json({ settings });
  },
);

sessionsTermsRouter.get(
  '/academics/sessions',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();

    const sessions = db
      .prepare(`
        SELECT
          s.id, s.name, s.term, s.start_date, s.end_date, s.is_current, s.created_at,
          COALESCE(l.status, 'active') AS status,
          COALESCE(l.notes, '') AS notes,
          l.closed_at, l.archived_at,
          (SELECT COUNT(*) FROM academic_terms t WHERE t.academic_session_id = s.id AND t.school_id = s.school_id) AS terms_count,
          (SELECT COUNT(*) FROM academic_events e WHERE e.academic_session_id = s.id AND e.school_id = s.school_id) AS events_count
        FROM academic_sessions s
        LEFT JOIN academic_session_lifecycle l ON l.session_id = s.id
        WHERE s.school_id = ?
        ORDER BY s.is_current DESC, s.start_date DESC
      `)
      .all(schoolId);

    const terms = db
      .prepare(`
        SELECT t.*, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ?
        ORDER BY t.is_current DESC, t.start_date ASC, t.term_order ASC
      `)
      .all(schoolId);

    res.json({ sessions, terms, settings });
  },
);

sessionsTermsRouter.get(
  '/academics/sessions/:sessionId',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();

    const session = db
      .prepare(`
        SELECT
          s.id, s.name, s.term, s.start_date, s.end_date, s.is_current, s.created_at,
          COALESCE(l.status, 'active') AS status,
          COALESCE(l.notes, '') AS notes,
          l.closed_at, l.archived_at
        FROM academic_sessions s
        LEFT JOIN academic_session_lifecycle l ON l.session_id = s.id
        WHERE s.id = ? AND s.school_id = ?
      `)
      .get(req.params.sessionId, schoolId);

    if (!session) {
      res.status(404).json({ error: 'Academic session not found.' });
      return;
    }

    const terms = db
      .prepare(`
        SELECT * FROM academic_terms
        WHERE school_id = ? AND academic_session_id = ?
        ORDER BY term_order ASC, start_date ASC
      `)
      .all(schoolId, req.params.sessionId);

    const events = db
      .prepare(`
        SELECT * FROM academic_events
        WHERE school_id = ? AND academic_session_id = ?
        ORDER BY start_date ASC
      `)
      .all(schoolId, req.params.sessionId);

    res.json({ session, terms, events });
  },
);

sessionsTermsRouter.patch(
  '/academics/sessions/:sessionId',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSessionLifecycleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid session update.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const { sessionId } = req.params;

    const existing = db
      .prepare(`
        SELECT s.*, COALESCE(l.status, 'active') AS lifecycle_status
        FROM academic_sessions s
        LEFT JOIN academic_session_lifecycle l ON l.session_id = s.id
        WHERE s.id = ? AND s.school_id = ?
      `)
      .get(sessionId, schoolId) as
      | { id: string; name: string; start_date: string; end_date: string; is_current: number; lifecycle_status: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Academic session not found.' });
      return;
    }

    if (existing.lifecycle_status === 'archived' && parsed.data.status !== 'active') {
      res.status(400).json({ error: 'Archived sessions are locked unless explicitly reopened.' });
      return;
    }

    const nextStart = parsed.data.startDate ?? existing.start_date;
    const nextEnd = parsed.data.endDate ?? existing.end_date;
    if (nextEnd <= nextStart) {
      res.status(400).json({ error: 'Session end date must be after start date.' });
      return;
    }

    if (!settings.allow_overlapping_sessions) {
      const others = db
        .prepare('SELECT id, name, start_date, end_date FROM academic_sessions WHERE school_id = ? AND id != ?')
        .all(schoolId, sessionId) as Array<{ id: string; name: string; start_date: string; end_date: string }>;
      const conflict = others.find((o) => rangesOverlap(nextStart, nextEnd, o.start_date, o.end_date));
      if (conflict) {
        res.status(409).json({
          error: `Session dates overlap with "${conflict.name}" (${conflict.start_date} – ${conflict.end_date}).`,
        });
        return;
      }
    }

    const nextStatus = parsed.data.status ?? existing.lifecycle_status;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE academic_sessions
        SET name = ?, start_date = ?, end_date = ?, is_current = CASE WHEN ? IN ('closed', 'archived') THEN 0 ELSE is_current END
        WHERE id = ? AND school_id = ?
      `).run(parsed.data.name ?? existing.name, nextStart, nextEnd, nextStatus, sessionId, schoolId);

      db.prepare(`
        INSERT INTO academic_session_lifecycle (session_id, school_id, status, notes, closed_at, archived_at, updated_at)
        VALUES (?, ?, ?, ?, CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END, CASE WHEN ? = 'archived' THEN datetime('now') ELSE NULL END, datetime('now'))
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          notes = COALESCE(?, academic_session_lifecycle.notes),
          closed_at = CASE WHEN excluded.status = 'closed' THEN COALESCE(academic_session_lifecycle.closed_at, datetime('now')) ELSE academic_session_lifecycle.closed_at END,
          archived_at = CASE WHEN excluded.status = 'archived' THEN COALESCE(academic_session_lifecycle.archived_at, datetime('now')) ELSE academic_session_lifecycle.archived_at END,
          updated_at = datetime('now')
      `).run(
        sessionId,
        schoolId,
        nextStatus,
        parsed.data.notes ?? '',
        nextStatus,
        nextStatus,
        parsed.data.notes ?? null,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update session.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.academic_session.updated',
      resourceType: 'academic_session',
      resourceId: sessionId,
      outcome: 'success',
      metadata: { status: nextStatus },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, id: sessionId, status: nextStatus });
  },
);

sessionsTermsRouter.get(
  '/academics/terms',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';

    const terms = db
      .prepare(`
        SELECT t.*, s.name AS session_name
        FROM academic_terms t
        INNER JOIN academic_sessions s ON s.id = t.academic_session_id
        WHERE t.school_id = ?
          ${sessionId ? 'AND t.academic_session_id = ?' : ''}
        ORDER BY t.is_current DESC, s.start_date DESC, t.term_order ASC
      `)
      .all(...(sessionId ? [schoolId, sessionId] : [schoolId]));

    res.json({ terms });
  },
);

sessionsTermsRouter.post(
  '/academics/terms',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAcademicTermSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid term payload.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureSchoolAcademicDefaults(schoolId);
    const db = getDb();
    const d = parsed.data;

    const session = db
      .prepare('SELECT id, name, start_date, end_date FROM academic_sessions WHERE id = ? AND school_id = ?')
      .get(d.academicSessionId, schoolId) as
      | { id: string; name: string; start_date: string; end_date: string }
      | undefined;

    if (!session) {
      res.status(404).json({ error: 'Selected academic session does not belong to your school.' });
      return;
    }

    if (d.examStartDate && d.examEndDate && d.examEndDate < d.examStartDate) {
      res.status(400).json({ error: 'Examination end date must be on or after examination start date.' });
      return;
    }

    if (!settings.allow_overlapping_terms) {
      const existingTerms = db
        .prepare('SELECT id, name, start_date, end_date FROM academic_terms WHERE school_id = ? AND academic_session_id = ?')
        .all(schoolId, d.academicSessionId) as Array<{ id: string; name: string; start_date: string; end_date: string }>;
      const conflict = existingTerms.find((t) => rangesOverlap(d.startDate, d.endDate, t.start_date, t.end_date));
      if (conflict) {
        res.status(409).json({
          error: `Term dates overlap with "${conflict.name}" (${conflict.start_date} – ${conflict.end_date}).`,
        });
        return;
      }
    }

    const termId = `trm_${crypto.randomUUID()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.isCurrent) {
        db.prepare('UPDATE academic_terms SET is_current = 0 WHERE school_id = ?').run(schoolId);
      }
      db.prepare(`
        INSERT INTO academic_terms (
          id, school_id, academic_session_id, name, term_order, start_date, end_date,
          exam_start_date, exam_end_date, result_publication_date, status, is_current
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        termId,
        schoolId,
        d.academicSessionId,
        d.name,
        d.termOrder,
        d.startDate,
        d.endDate,
        d.examStartDate,
        d.examEndDate,
        d.resultPublicationDate,
        d.isCurrent ? 'active' : d.status,
        d.isCurrent ? 1 : 0,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(409).json({
        error: err instanceof Error && err.message.includes('UNIQUE')
          ? `Term "${d.name}" already exists inside this session.`
          : 'Unable to create academic term.',
      });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.academic_term.created',
      resourceType: 'academic_term',
      resourceId: termId,
      outcome: 'success',
      metadata: { name: d.name, sessionId: d.academicSessionId },
      ipAddress: getClientIp(req),
    });

    const created = db.prepare('SELECT * FROM academic_terms WHERE id = ?').get(termId);
    res.status(201).json({ term: created });
  },
);

sessionsTermsRouter.patch(
  '/academics/terms/:termId',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateAcademicTermSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid term update.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM academic_terms WHERE id = ? AND school_id = ?')
      .get(req.params.termId, schoolId) as
      | {
          id: string;
          name: string;
          term_order: number;
          start_date: string;
          end_date: string;
          exam_start_date: string | null;
          exam_end_date: string | null;
          result_publication_date: string | null;
          status: string;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Academic term not found.' });
      return;
    }

    const d = parsed.data;
    const nextStart = d.startDate ?? existing.start_date;
    const nextEnd = d.endDate ?? existing.end_date;
    if (nextEnd < nextStart) {
      res.status(400).json({ error: 'End date must be on or after start date.' });
      return;
    }

    const nextStatus = d.status ?? existing.status;
    db.prepare(`
      UPDATE academic_terms
      SET name = ?, term_order = ?, start_date = ?, end_date = ?,
          exam_start_date = ?, exam_end_date = ?, result_publication_date = ?,
          status = ?, is_current = CASE WHEN ? IN ('closed', 'archived') THEN 0 ELSE is_current END,
          updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      d.name ?? existing.name,
      d.termOrder ?? existing.term_order,
      nextStart,
      nextEnd,
      d.examStartDate === undefined ? existing.exam_start_date : d.examStartDate || null,
      d.examEndDate === undefined ? existing.exam_end_date : d.examEndDate || null,
      d.resultPublicationDate === undefined ? existing.result_publication_date : d.resultPublicationDate || null,
      nextStatus,
      nextStatus,
      existing.id,
      schoolId,
    );

    const updated = db.prepare('SELECT * FROM academic_terms WHERE id = ?').get(existing.id);
    res.json({ term: updated });
  },
);

sessionsTermsRouter.patch(
  '/academics/terms/:termId/activate',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const term = db
      .prepare('SELECT id, academic_session_id, name, status FROM academic_terms WHERE id = ? AND school_id = ?')
      .get(req.params.termId, schoolId) as
      | { id: string; academic_session_id: string; name: string; status: string }
      | undefined;

    if (!term) {
      res.status(404).json({ error: 'Academic term not found.' });
      return;
    }
    if (term.status === 'archived') {
      res.status(400).json({ error: 'Archived terms cannot be set active.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE academic_terms SET is_current = 0 WHERE school_id = ?').run(schoolId);
      db.prepare("UPDATE academic_terms SET is_current = 1, status = 'active', updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
        term.id,
        schoolId,
      );
      db.prepare('UPDATE academic_sessions SET is_current = 0 WHERE school_id = ?').run(schoolId);
      db.prepare('UPDATE academic_sessions SET is_current = 1 WHERE id = ? AND school_id = ?').run(
        term.academic_session_id,
        schoolId,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to activate term.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.academic_term.activated',
      resourceType: 'academic_term',
      resourceId: term.id,
      outcome: 'success',
      metadata: { name: term.name },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, id: term.id, is_current: 1 });
  },
);

sessionsTermsRouter.get(
  '/academics/events',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const termId = typeof req.query.termId === 'string' ? req.query.termId : '';

    const events = db
      .prepare(`
        SELECT e.*, s.name AS session_name, t.name AS term_name
        FROM academic_events e
        LEFT JOIN academic_sessions s ON s.id = e.academic_session_id
        LEFT JOIN academic_terms t ON t.id = e.academic_term_id
        WHERE e.school_id = ?
          ${sessionId ? 'AND e.academic_session_id = ?' : ''}
          ${termId ? 'AND e.academic_term_id = ?' : ''}
        ORDER BY e.start_date ASC, e.created_at DESC
      `)
      .all(
        ...[schoolId, ...(sessionId ? [sessionId] : []), ...(termId ? [termId] : [])],
      );

    res.json({ events });
  },
);

sessionsTermsRouter.post(
  '/academics/events',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAcademicEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid academic event.' });
      return;
    }

    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const d = parsed.data;
    const eventId = `aev_${crypto.randomUUID()}`;

    if (d.academicSessionId) {
      const s = db.prepare('SELECT id FROM academic_sessions WHERE id = ? AND school_id = ?').get(d.academicSessionId, schoolId);
      if (!s) {
        res.status(400).json({ error: 'Selected session does not belong to your school.' });
        return;
      }
    }
    if (d.academicTermId) {
      const t = db.prepare('SELECT id FROM academic_terms WHERE id = ? AND school_id = ?').get(d.academicTermId, schoolId);
      if (!t) {
        res.status(400).json({ error: 'Selected term does not belong to your school.' });
        return;
      }
    }

    db.prepare(`
      INSERT INTO academic_events (
        id, school_id, academic_session_id, academic_term_id, title, event_type, start_date, end_date, description, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      schoolId,
      d.academicSessionId || null,
      d.academicTermId || null,
      d.title,
      d.eventType,
      d.startDate,
      d.endDate,
      d.description,
      req.auth!.id,
    );

    const created = db.prepare('SELECT * FROM academic_events WHERE id = ?').get(eventId);
    res.status(201).json({ event: created });
  },
);

sessionsTermsRouter.delete(
  '/academics/events/:eventId',
  requireCsrfCheck,
  requirePermission('school.academics.manage'),
  (req: AuthenticatedRequest, res) => {
    const schoolId = req.auth!.activeSchoolId!;
    const db = getDb();
    const result = db
      .prepare('DELETE FROM academic_events WHERE id = ? AND school_id = ?')
      .run(req.params.eventId, schoolId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Academic calendar event not found.' });
      return;
    }
    res.json({ ok: true });
  },
);
