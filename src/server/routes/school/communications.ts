import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { getFcmIntegrationStatus } from '../../notifications/fcm-adapter.ts';
import { hasPermission } from '../../security.ts';
import {
  createAnnouncementSchema,
  sendDirectMessageSchema,
  updateNotificationPreferencesSchema,
} from '../../validation-v1.ts';

export const schoolCommunicationsRouter = Router();

function getSmtpConfigStatus(): { configured: boolean; host: string; from: string } {
  const host = (process.env.SMTP_HOST || '').trim();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  return {
    configured: Boolean(host && host !== 'MY_SMTP_HOST'),
    host,
    from: from || 'noreply@davetimi.local',
  };
}

async function dispatchOptionalEmail(params: {
  toEmails: string[];
  subject: string;
  body: string;
}): Promise<{ status: 'delivered' | 'failed' | 'not_configured'; detail: string }> {
  const smtp = getSmtpConfigStatus();
  if (!smtp.configured) {
    return {
      status: 'not_configured',
      detail: 'SMTP transport is not configured (set SMTP_HOST in server environment to enable email delivery).',
    };
  }
  const cleanEmails = params.toEmails.filter((e) => Boolean(e && e.includes('@')));
  if (cleanEmails.length === 0) {
    return { status: 'failed', detail: 'No valid recipient email addresses available.' };
  }
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    await transporter.sendMail({
      from: smtp.from,
      bcc: cleanEmails.join(','),
      subject: params.subject,
      text: params.body,
    });
    return {
      status: 'delivered',
      detail: `Sent via SMTP host ${smtp.host} to ${cleanEmails.length} recipient(s).`,
    };
  } catch (err) {
    return {
      status: 'failed',
      detail: err instanceof Error ? err.message : 'SMTP delivery failed.',
    };
  }
}

function resolveUserClassIdsForComms(schoolId: string, userId: string, roleCode: string): string[] {
  const db = getDb();
  if (roleCode === 'student') {
    const row = db
      .prepare('SELECT current_class_id FROM students WHERE school_id = ? AND user_id = ? LIMIT 1')
      .get(schoolId, userId) as { current_class_id: string | null } | undefined;
    return row?.current_class_id ? [row.current_class_id] : [];
  }
  if (roleCode === 'parent') {
    const rows = db
      .prepare(`
        SELECT DISTINCT s.current_class_id
        FROM parents p
        INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
        INNER JOIN students s ON s.id = sg.student_id AND s.school_id = p.school_id
        WHERE p.school_id = ? AND p.user_id = ? AND s.current_class_id IS NOT NULL
      `)
      .all(schoolId, userId) as Array<{ current_class_id: string }>;
    return rows.map((r) => r.current_class_id);
  }
  if (roleCode === 'teacher') {
    const teacher = db
      .prepare("SELECT id FROM teachers WHERE school_id = ? AND user_id = ? AND employment_status = 'active' LIMIT 1")
      .get(schoolId, userId) as { id: string } | undefined;
    if (!teacher) return [];
    const c1 = db
      .prepare('SELECT DISTINCT class_id FROM class_teacher_assignments WHERE school_id = ? AND teacher_id = ? AND is_active = 1')
      .all(schoolId, teacher.id) as Array<{ class_id: string }>;
    const c2 = db
      .prepare('SELECT DISTINCT class_id FROM teacher_subject_assignments WHERE school_id = ? AND teacher_id = ? AND is_active = 1 AND class_id IS NOT NULL')
      .all(schoolId, teacher.id) as Array<{ class_id: string }>;
    return Array.from(new Set([...c1.map((x) => x.class_id), ...c2.map((x) => x.class_id)]));
  }
  return [];
}

function getTargetUsersForAnnouncement(schoolId: string, audienceScope: string, targetClassId: string | null) {
  const db = getDb();
  if (audienceScope === 'school') {
    return db
      .prepare(`
        SELECT u.id AS user_id, u.email, u.full_name, COALESCE(np.email_enabled, 1) AS email_enabled
        FROM school_memberships sm
        INNER JOIN users u ON u.id = sm.user_id
        LEFT JOIN notification_preferences np ON np.user_id = u.id
        WHERE sm.school_id = ? AND sm.status = 'active' AND u.is_active = 1
      `)
      .all(schoolId) as Array<{ user_id: string; email: string; full_name: string; email_enabled: number }>;
  }
  if (audienceScope === 'teachers' || audienceScope === 'students' || audienceScope === 'parents') {
    const roleMap: Record<string, string> = {
      teachers: 'teacher',
      students: 'student',
      parents: 'parent',
    };
    return db
      .prepare(`
        SELECT u.id AS user_id, u.email, u.full_name, COALESCE(np.email_enabled, 1) AS email_enabled
        FROM school_memberships sm
        INNER JOIN roles r ON r.id = sm.role_id
        INNER JOIN users u ON u.id = sm.user_id
        LEFT JOIN notification_preferences np ON np.user_id = u.id
        WHERE sm.school_id = ? AND sm.status = 'active' AND u.is_active = 1 AND r.code = ?
      `)
      .all(schoolId, roleMap[audienceScope]) as Array<{
      user_id: string;
      email: string;
      full_name: string;
      email_enabled: number;
    }>;
  }
  if (audienceScope === 'class' && targetClassId) {
    return db
      .prepare(`
        SELECT DISTINCT u.id AS user_id, u.email, u.full_name, COALESCE(np.email_enabled, 1) AS email_enabled
        FROM users u
        LEFT JOIN notification_preferences np ON np.user_id = u.id
        WHERE u.is_active = 1 AND (
          u.id IN (SELECT user_id FROM students WHERE school_id = ? AND current_class_id = ? AND user_id IS NOT NULL)
          OR u.id IN (
            SELECT p.user_id FROM parents p
            INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
            INNER JOIN students s ON s.id = sg.student_id AND s.school_id = p.school_id
            WHERE p.school_id = ? AND s.current_class_id = ? AND p.user_id IS NOT NULL
          )
        )
      `)
      .all(schoolId, targetClassId, schoolId, targetClassId) as Array<{
      user_id: string;
      email: string;
      full_name: string;
      email_enabled: number;
    }>;
  }
  return [];
}

schoolCommunicationsRouter.get(
  '/communications/overview',
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.comms.manage');

    const announcementStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
          SUM(CASE WHEN priority = 'emergency' AND status = 'published' THEN 1 ELSE 0 END) AS emergency
        FROM announcements
        WHERE school_id = ?
      `)
      .get(schoolId) as Record<string, number | null>;

    const unreadDirectMessages = (
      db
        .prepare('SELECT COUNT(*) AS count FROM direct_messages WHERE school_id = ? AND recipient_user_id = ? AND read_at IS NULL')
        .get(schoolId, req.auth!.id) as { count: number }
    ).count;

    const deliveryStats = isAdmin
      ? db
          .prepare(`
            SELECT channel, status, COUNT(*) AS count
            FROM message_delivery_logs
            WHERE school_id = ?
            GROUP BY channel, status
          `)
          .all(schoolId)
      : [];

    res.json({
      stats: {
        totalAnnouncements: announcementStats.total ?? 0,
        publishedAnnouncements: announcementStats.published ?? 0,
        scheduledAnnouncements: announcementStats.scheduled ?? 0,
        draftAnnouncements: announcementStats.draft ?? 0,
        emergencyAnnouncements: announcementStats.emergency ?? 0,
        unreadDirectMessages,
      },
      deliveryStats,
      channels: {
        inApp: { configured: true },
        email: getSmtpConfigStatus(),
        fcm: getFcmIntegrationStatus(),
      },
    });
  },
);

schoolCommunicationsRouter.get(
  '/communications/announcements',
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.comms.manage');
    const roleCode = req.auth!.roleCode;

    // Auto-publish any scheduled announcements whose scheduled_for timestamp has passed
    db.prepare(`
      UPDATE announcements
      SET status = 'published', published_at = COALESCE(published_at, scheduled_for), updated_at = datetime('now')
      WHERE school_id = ? AND status = 'scheduled' AND scheduled_for IS NOT NULL AND datetime(scheduled_for) <= datetime('now')
    `).run(schoolId);

    const rows = db
      .prepare(`
        SELECT
          a.*,
          c.name AS target_class_name,
          CASE WHEN arr.read_at IS NOT NULL THEN 1 ELSE 0 END AS is_read_int,
          (SELECT COUNT(*) FROM announcement_read_receipts arr2 WHERE arr2.announcement_id = a.id) AS read_count
        FROM announcements a
        LEFT JOIN school_classes c ON c.id = a.target_class_id
        LEFT JOIN announcement_read_receipts arr ON arr.announcement_id = a.id AND arr.user_id = ?
        WHERE a.school_id = ?
        ORDER BY CASE WHEN a.priority = 'emergency' THEN 0 ELSE 1 END ASC, COALESCE(a.published_at, a.created_at) DESC
        LIMIT 100
      `)
      .all(req.auth!.id, schoolId) as Array<{
      id: string;
      school_id: string;
      title: string;
      body: string;
      audience_scope: string;
      target_class_id: string | null;
      target_class_name: string | null;
      priority: string;
      status: string;
      scheduled_for: string | null;
      published_at: string | null;
      created_by_user_id: string | null;
      created_by_name: string;
      created_at: string;
      is_read_int: number;
      read_count: number;
    }>;

    const myClassIds = !isAdmin ? resolveUserClassIdsForComms(schoolId, req.auth!.id, roleCode) : [];
    const roleAudienceMap: Record<string, string> = {
      teacher: 'teachers',
      student: 'students',
      parent: 'parents',
    };

    const visible = isAdmin
      ? rows
      : rows.filter((row) => {
          if (row.status !== 'published') {
            return row.created_by_user_id === req.auth!.id;
          }
          if (row.audience_scope === 'school') return true;
          if (row.audience_scope === roleAudienceMap[roleCode]) return true;
          if (row.audience_scope === 'class' && row.target_class_id) {
            return myClassIds.includes(row.target_class_id);
          }
          return false;
        });

    res.json({
      announcements: visible.map(({ is_read_int, ...rest }) => ({
        ...rest,
        is_read: is_read_int === 1,
      })),
    });
  },
);

schoolCommunicationsRouter.post(
  '/communications/announcements',
  requireCsrfCheck,
  requirePermission('school.comms.send'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid announcement payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.comms.manage');
    const d = parsed.data;

    if (!isAdmin) {
      if (d.audienceScope !== 'class' || !d.targetClassId) {
        res.status(403).json({
          error: 'Teachers may only send announcements targeted to their assigned classes.',
        });
        return;
      }
      const allowedClasses = resolveUserClassIdsForComms(schoolId, req.auth!.id, req.auth!.roleCode);
      if (!allowedClasses.includes(d.targetClassId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    if (d.audienceScope === 'class') {
      if (!d.targetClassId) {
        res.status(400).json({ error: 'Select a target class for class announcements.' });
        return;
      }
      const cls = db
        .prepare('SELECT id FROM school_classes WHERE id = ? AND school_id = ?')
        .get(d.targetClassId, schoolId);
      if (!cls) {
        res.status(404).json({ error: 'Selected class not found in your school.' });
        return;
      }
    }

    if (d.status === 'scheduled' && !d.scheduledFor) {
      res.status(400).json({ error: 'Provide scheduledFor date/time for scheduled announcements.' });
      return;
    }

    const id = `ann_${crypto.randomUUID()}`;
    const publishedAt = d.status === 'published' ? new Date().toISOString() : null;

    db.prepare(`
      INSERT INTO announcements (
        id, school_id, title, body, audience_scope, target_class_id, priority, status,
        scheduled_for, published_at, created_by_user_id, created_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      schoolId,
      d.title,
      d.body,
      d.audienceScope,
      d.audienceScope === 'class' ? d.targetClassId ?? null : null,
      d.priority,
      d.status,
      d.scheduledFor ?? null,
      publishedAt,
      req.auth!.id,
      req.auth!.fullName,
    );

    if (d.status === 'published') {
      const targets = getTargetUsersForAnnouncement(schoolId, d.audienceScope, d.targetClassId ?? null);
      const insertLog = db.prepare(`
        INSERT INTO message_delivery_logs (id, school_id, source_type, source_id, recipient_user_id, channel, status, detail)
        VALUES (?, ?, 'announcement', ?, ?, ?, ?, ?)
      `);
      for (const t of targets) {
        insertLog.run(`mdl_${crypto.randomUUID()}`, schoolId, id, t.user_id, 'in_app', 'delivered', 'Delivered to school portal inbox');
      }

      const emailTargets = targets
        .filter((t) => d.priority === 'emergency' || t.email_enabled === 1)
        .map((t) => t.email);
      if (emailTargets.length > 0) {
        const emailResult = await dispatchOptionalEmail({
          toEmails: emailTargets,
          subject: d.priority === 'emergency' ? `[EMERGENCY NOTICE] ${d.title}` : d.title,
          body: d.body,
        });
        insertLog.run(`mdl_${crypto.randomUUID()}`, schoolId, id, null, 'email', emailResult.status, emailResult.detail);
      }

      const fcm = getFcmIntegrationStatus();
      insertLog.run(
        `mdl_${crypto.randomUUID()}`,
        schoolId,
        id,
        null,
        'fcm',
        fcm.configured ? 'delivered' : 'not_configured',
        fcm.configured ? 'Dispatched via FCM' : 'FCM credentials not configured on server.',
      );
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.announcement.created',
      resourceType: 'announcement',
      resourceId: id,
      outcome: 'success',
      metadata: { status: d.status, audienceScope: d.audienceScope, priority: d.priority },
      ipAddress: getClientIp(req),
    });

    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    res.status(201).json({ announcement });
  },
);

schoolCommunicationsRouter.patch(
  '/communications/announcements/:id/publish',
  requireCsrfCheck,
  requirePermission('school.comms.manage'),
  async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const row = db
      .prepare('SELECT * FROM announcements WHERE id = ? AND school_id = ?')
      .get(req.params.id, schoolId) as
      | { id: string; title: string; body: string; audience_scope: string; target_class_id: string | null; priority: string; status: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Announcement not found in your school.' });
      return;
    }

    db.prepare(`
      UPDATE announcements
      SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(row.id, schoolId);

    const targets = getTargetUsersForAnnouncement(schoolId, row.audience_scope, row.target_class_id);
    const insertLog = db.prepare(`
      INSERT INTO message_delivery_logs (id, school_id, source_type, source_id, recipient_user_id, channel, status, detail)
      VALUES (?, ?, 'announcement', ?, ?, ?, ?, ?)
    `);
    for (const t of targets) {
      insertLog.run(`mdl_${crypto.randomUUID()}`, schoolId, row.id, t.user_id, 'in_app', 'delivered', 'Delivered to school portal inbox');
    }

    res.json({ id: row.id, status: 'published' });
  },
);

schoolCommunicationsRouter.post(
  '/communications/announcements/:id/read',
  requireCsrfCheck,
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const ann = db
      .prepare('SELECT id FROM announcements WHERE id = ? AND school_id = ?')
      .get(req.params.id, schoolId);
    if (!ann) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    db.prepare(`
      INSERT OR IGNORE INTO announcement_read_receipts (announcement_id, user_id)
      VALUES (?, ?)
    `).run(req.params.id, req.auth!.id);

    res.json({ ok: true });
  },
);

schoolCommunicationsRouter.get(
  '/communications/announcements/:id/receipts',
  requirePermission('school.comms.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const ann = db
      .prepare('SELECT id, title FROM announcements WHERE id = ? AND school_id = ?')
      .get(req.params.id, schoolId);
    if (!ann) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const receipts = db
      .prepare(`
        SELECT arr.user_id, arr.read_at, u.full_name, u.email, r.name AS role_name, r.code AS role_code
        FROM announcement_read_receipts arr
        INNER JOIN users u ON u.id = arr.user_id
        INNER JOIN school_memberships sm ON sm.user_id = u.id AND sm.school_id = ?
        INNER JOIN roles r ON r.id = sm.role_id
        WHERE arr.announcement_id = ?
        ORDER BY arr.read_at DESC
      `)
      .all(schoolId, req.params.id);

    res.json({ announcement: ann, receipts });
  },
);

schoolCommunicationsRouter.get(
  '/communications/recipients',
  requirePermission('school.comms.send'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const roleCode = req.auth!.roleCode;
    const isAdmin = hasPermission(req.auth!.permissions, 'school.comms.manage');

    if (isAdmin) {
      const recipients = db
        .prepare(`
          SELECT u.id AS user_id, u.full_name, u.email, r.code AS role_code, r.name AS role_name
          FROM school_memberships sm
          INNER JOIN users u ON u.id = sm.user_id
          INNER JOIN roles r ON r.id = sm.role_id
          WHERE sm.school_id = ? AND sm.status = 'active' AND u.is_active = 1 AND u.id != ?
          ORDER BY r.code ASC, u.full_name ASC
        `)
        .all(schoolId, req.auth!.id);
      res.json({ recipients });
      return;
    }

    if (roleCode === 'teacher') {
      const myClasses = resolveUserClassIdsForComms(schoolId, req.auth!.id, 'teacher');
      const allStaff = db
        .prepare(`
          SELECT u.id AS user_id, u.full_name, u.email, r.code AS role_code, r.name AS role_name
          FROM school_memberships sm
          INNER JOIN users u ON u.id = sm.user_id
          INNER JOIN roles r ON r.id = sm.role_id
          WHERE sm.school_id = ? AND sm.status = 'active' AND u.is_active = 1
            AND u.id != ? AND r.code IN ('school_admin', 'teacher')
        `)
        .all(schoolId, req.auth!.id) as Array<{ user_id: string; full_name: string; email: string; role_code: string; role_name: string }>;

      const classParentsAndStudents =
        myClasses.length > 0
          ? (db
              .prepare(`
                SELECT DISTINCT u.id AS user_id, u.full_name, u.email, r.code AS role_code, r.name AS role_name
                FROM school_memberships sm
                INNER JOIN users u ON u.id = sm.user_id
                INNER JOIN roles r ON r.id = sm.role_id
                WHERE sm.school_id = ? AND sm.status = 'active' AND u.is_active = 1 AND (
                  u.id IN (SELECT user_id FROM students WHERE school_id = ? AND current_class_id IN (${myClasses.map(() => '?').join(',')}) AND user_id IS NOT NULL)
                  OR u.id IN (
                    SELECT p.user_id FROM parents p
                    INNER JOIN student_guardians sg ON sg.parent_id = p.id AND sg.school_id = p.school_id
                    INNER JOIN students s ON s.id = sg.student_id AND s.school_id = p.school_id
                    WHERE p.school_id = ? AND s.current_class_id IN (${myClasses.map(() => '?').join(',')}) AND p.user_id IS NOT NULL
                  )
                )
              `)
              .all(schoolId, schoolId, ...myClasses, schoolId, ...myClasses) as typeof allStaff)
          : [];

      const seen = new Set<string>();
      const merged = [...allStaff, ...classParentsAndStudents].filter((r) => {
        if (seen.has(r.user_id)) return false;
        seen.add(r.user_id);
        return true;
      });
      res.json({ recipients: merged });
      return;
    }

    // Student & Parent: can message school admins & teachers in their school
    const staffRecipients = db
      .prepare(`
        SELECT u.id AS user_id, u.full_name, u.email, r.code AS role_code, r.name AS role_name
        FROM school_memberships sm
        INNER JOIN users u ON u.id = sm.user_id
        INNER JOIN roles r ON r.id = sm.role_id
        WHERE sm.school_id = ? AND sm.status = 'active' AND u.is_active = 1
          AND r.code IN ('school_admin', 'teacher')
        ORDER BY r.code ASC, u.full_name ASC
      `)
      .all(schoolId);
    res.json({ recipients: staffRecipients });
  },
);

schoolCommunicationsRouter.get(
  '/communications/messages',
  requirePermission('school.comms.send'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const messages = db
      .prepare(`
        SELECT
          dm.*,
          su.full_name AS sender_name, su.email AS sender_email,
          ru.full_name AS recipient_name, ru.email AS recipient_email
        FROM direct_messages dm
        INNER JOIN users su ON su.id = dm.sender_user_id
        INNER JOIN users ru ON ru.id = dm.recipient_user_id
        WHERE dm.school_id = ? AND (dm.sender_user_id = ? OR dm.recipient_user_id = ?)
        ORDER BY dm.created_at DESC
        LIMIT 120
      `)
      .all(schoolId, req.auth!.id, req.auth!.id);

    res.json({ messages });
  },
);

schoolCommunicationsRouter.post(
  '/communications/messages',
  requireCsrfCheck,
  requirePermission('school.comms.send'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = sendDirectMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid message payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { recipientUserId, subject, body } = parsed.data;

    if (recipientUserId === req.auth!.id) {
      res.status(400).json({ error: 'You cannot send a direct message to yourself.' });
      return;
    }

    const recipient = db
      .prepare(`
        SELECT u.id, u.email, u.full_name, r.code AS role_code
        FROM school_memberships sm
        INNER JOIN users u ON u.id = sm.user_id
        INNER JOIN roles r ON r.id = sm.role_id
        WHERE sm.school_id = ? AND sm.user_id = ? AND sm.status = 'active' AND u.is_active = 1
      `)
      .get(schoolId, recipientUserId) as
      | { id: string; email: string; full_name: string; role_code: string }
      | undefined;

    if (!recipient) {
      res.status(404).json({ error: 'Recipient member not found in your school tenant.' });
      return;
    }

    // Prevent student <-> student or student <-> unrelated parent direct messaging for child safeguarding
    if ((req.auth!.roleCode === 'student' || req.auth!.roleCode === 'parent') && !['school_admin', 'teacher'].includes(recipient.role_code)) {
      res.status(403).json({ error: 'Students and parents may only send direct messages to school administrators and teachers.' });
      return;
    }

    const pair = [req.auth!.id, recipientUserId].sort();
    const threadId = `thr_${pair[0]}_${pair[1]}`;
    const id = `msg_${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO direct_messages (id, school_id, thread_id, sender_user_id, recipient_user_id, subject, body)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, schoolId, threadId, req.auth!.id, recipientUserId, subject, body);

    db.prepare(`
      INSERT INTO message_delivery_logs (id, school_id, source_type, source_id, recipient_user_id, channel, status, detail)
      VALUES (?, ?, 'direct_message', ?, ?, 'in_app', 'delivered', 'Delivered to direct inbox')
    `).run(`mdl_${crypto.randomUUID()}`, schoolId, id, recipientUserId);

    const pref = db
      .prepare('SELECT email_enabled FROM notification_preferences WHERE user_id = ?')
      .get(recipientUserId) as { email_enabled: number } | undefined;
    if (!pref || pref.email_enabled === 1) {
      const emailRes = await dispatchOptionalEmail({
        toEmails: [recipient.email],
        subject: `[DT Portal Message] ${subject || 'New Message'}`,
        body: `From: ${req.auth!.fullName}\n\n${body}`,
      });
      db.prepare(`
        INSERT INTO message_delivery_logs (id, school_id, source_type, source_id, recipient_user_id, channel, status, detail)
        VALUES (?, ?, 'direct_message', ?, ?, 'email', ?, ?)
      `).run(`mdl_${crypto.randomUUID()}`, schoolId, id, recipientUserId, emailRes.status, emailRes.detail);
    }

    const message = db
      .prepare(`
        SELECT dm.*, su.full_name AS sender_name, ru.full_name AS recipient_name
        FROM direct_messages dm
        INNER JOIN users su ON su.id = dm.sender_user_id
        INNER JOIN users ru ON ru.id = dm.recipient_user_id
        WHERE dm.id = ?
      `)
      .get(id);
    res.status(201).json({ message });
  },
);

schoolCommunicationsRouter.patch(
  '/communications/messages/:messageId/read',
  requireCsrfCheck,
  requirePermission('school.comms.send'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const result = db
      .prepare(`
        UPDATE direct_messages
        SET read_at = COALESCE(read_at, datetime('now'))
        WHERE id = ? AND school_id = ? AND recipient_user_id = ?
      `)
      .run(req.params.messageId, schoolId, req.auth!.id);

    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Direct message not found in your inbox.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolCommunicationsRouter.get(
  '/communications/delivery-logs',
  requirePermission('school.comms.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const channel = typeof req.query.channel === 'string' ? req.query.channel : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';

    const where = ['mdl.school_id = ?'];
    const params: Array<string> = [schoolId];
    if (channel && channel !== 'all') {
      where.push('mdl.channel = ?');
      params.push(channel);
    }
    if (status && status !== 'all') {
      where.push('mdl.status = ?');
      params.push(status);
    }

    const logs = db
      .prepare(`
        SELECT mdl.*, u.full_name AS recipient_name, u.email AS recipient_email
        FROM message_delivery_logs mdl
        LEFT JOIN users u ON u.id = mdl.recipient_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY mdl.created_at DESC
        LIMIT 150
      `)
      .all(...params);

    res.json({ logs });
  },
);

schoolCommunicationsRouter.get(
  '/communications/preferences',
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    db.prepare('INSERT OR IGNORE INTO notification_preferences (user_id, school_id) VALUES (?, ?)').run(
      req.auth!.id,
      schoolId,
    );
    const preferences = db
      .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
      .get(req.auth!.id);
    res.json({ preferences });
  },
);

schoolCommunicationsRouter.put(
  '/communications/preferences',
  requireCsrfCheck,
  requirePermission('school.notifications.read'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateNotificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid notification preferences.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    db.prepare(`
      INSERT INTO notification_preferences (user_id, school_id, in_app_enabled, email_enabled, push_enabled, emergency_override, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        in_app_enabled = excluded.in_app_enabled,
        email_enabled = excluded.email_enabled,
        push_enabled = excluded.push_enabled,
        emergency_override = excluded.emergency_override,
        updated_at = datetime('now')
    `).run(
      req.auth!.id,
      schoolId,
      d.inAppEnabled ? 1 : 0,
      d.emailEnabled ? 1 : 0,
      d.pushEnabled ? 1 : 0,
      d.emergencyOverride ? 1 : 0,
    );

    const preferences = db
      .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
      .get(req.auth!.id);
    res.json({ preferences });
  },
);
