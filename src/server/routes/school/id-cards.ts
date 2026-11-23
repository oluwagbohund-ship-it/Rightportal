import crypto from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import {
  decryptIdCardToken,
  encryptIdCardToken,
  evaluateIdCardValidity,
  formatIdCardNumber,
  generateIdCardQrToken,
  getOrCreateIdCardMasterSecret,
} from '../../id-card-helpers.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { sha256Hex } from '../../security.ts';
import {
  issueStudentIdCardSchema,
  revokeStudentIdCardSchema,
} from '../../validation.ts';

export const schoolIdCardsRouter = Router();

interface IdCardDbRow {
  id: string;
  school_id: string;
  student_id: string;
  card_number: string;
  qr_token_hash: string;
  qr_token_encrypted: string;
  status: 'active' | 'revoked' | 'expired';
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string;
  last_used_login_at: string | null;
  last_used_attendance_at: string | null;
}

interface StudentProfileForCard {
  id: string;
  school_id: string;
  user_id: string | null;
  admission_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  photo_file_id: string | null;
  status: string;
  class_name: string | null;
  arm_name: string | null;
  user_active: number | null;
  membership_status: string | null;
}

function getSchoolCardMeta(schoolId: string) {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        s.id, s.name, s.code, s.city, s.country,
        COALESCE(sp.motto, '') AS motto,
        sp.logo_file_id
      FROM schools s
      LEFT JOIN school_profiles sp ON sp.school_id = s.id
      WHERE s.id = ?
    `)
    .get(schoolId) as {
    id: string;
    name: string;
    code: string;
    city: string;
    country: string;
    motto: string;
    logo_file_id: string | null;
  };
}

function getStudentForCard(schoolId: string, studentId: string): StudentProfileForCard | undefined {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        s.id, s.school_id, s.user_id, s.admission_number,
        s.first_name, s.middle_name, s.last_name, s.gender, s.date_of_birth,
        s.photo_file_id, s.status,
        c.name AS class_name, a.name AS arm_name,
        u.is_active AS user_active, sm.status AS membership_status
      FROM students s
      LEFT JOIN school_classes c ON c.id = s.current_class_id
      LEFT JOIN class_arms a ON a.id = s.current_arm_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN school_memberships sm ON sm.user_id = s.user_id AND sm.school_id = s.school_id
      WHERE s.id = ? AND s.school_id = ?
      LIMIT 1
    `)
    .get(studentId, schoolId) as StudentProfileForCard | undefined;
}

function allocateNextCardNumber(schoolId: string): string {
  const db = getDb();
  const year = new Date().getUTCFullYear();
  const prefix = `DT-IDC-${year}-`;
  const rows = db
    .prepare('SELECT card_number FROM student_id_cards WHERE school_id = ? AND card_number LIKE ?')
    .all(schoolId, `${prefix}%`) as Array<{ card_number: string }>;

  let maxSeq = 0;
  for (const r of rows) {
    const tail = r.card_number.slice(prefix.length);
    const num = Number.parseInt(tail, 10);
    if (Number.isFinite(num) && num > maxSeq) {
      maxSeq = num;
    }
  }
  return formatIdCardNumber(maxSeq + 1, year);
}

function issueCardInTransaction(params: {
  schoolId: string;
  studentId: string;
  actorUserId: string;
  validityDays: number;
}): { cardId: string; cardNumber: string; expiresAt: string } {
  const db = getDb();
  const secret = getOrCreateIdCardMasterSecret();
  const rawToken = generateIdCardQrToken();
  const tokenHash = sha256Hex(rawToken);
  const tokenEncrypted = encryptIdCardToken(rawToken, secret);
  const cardId = `idc_${crypto.randomUUID()}`;
  const cardNumber = allocateNextCardNumber(params.schoolId);
  const expiresAt = new Date(Date.now() + params.validityDays * 86_400_000).toISOString();

  db.prepare(`
    UPDATE student_id_cards
    SET status = 'revoked',
        revoked_by_user_id = ?,
        revoked_reason = 'Superseded by re-issued ID card',
        revoked_at = datetime('now')
    WHERE school_id = ? AND student_id = ? AND status = 'active'
  `).run(params.actorUserId, params.schoolId, params.studentId);

  db.prepare(`
    INSERT INTO student_id_cards (
      id, school_id, student_id, card_number, qr_token_hash, qr_token_encrypted,
      status, issued_by_user_id, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    cardId,
    params.schoolId,
    params.studentId,
    cardNumber,
    tokenHash,
    tokenEncrypted,
    params.actorUserId,
    expiresAt,
  );

  return { cardId, cardNumber, expiresAt };
}

async function formatCardResponse(
  schoolId: string,
  card: IdCardDbRow,
  student: StudentProfileForCard,
) {
  const school = getSchoolCardMeta(schoolId);
  const secret = getOrCreateIdCardMasterSecret();
  const rawToken = decryptIdCardToken(card.qr_token_encrypted, secret);
  const validity = evaluateIdCardValidity(card);

  let effectiveStatus: 'active' | 'revoked' | 'expired' = card.status;
  if (card.status === 'active' && !validity.valid) {
    effectiveStatus = card.revoked_at ? 'revoked' : 'expired';
  }

  const qrDataUrl =
    rawToken && effectiveStatus === 'active'
      ? await QRCode.toDataURL(rawToken, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#0F172A', light: '#FFFFFF' },
        })
      : null;

  return {
    id: card.id,
    school_id: card.school_id,
    student_id: card.student_id,
    card_number: card.card_number,
    status: effectiveStatus,
    issued_at: card.issued_at,
    expires_at: card.expires_at,
    revoked_at: card.revoked_at,
    revoked_reason: card.revoked_reason,
    last_used_login_at: card.last_used_login_at,
    last_used_attendance_at: card.last_used_attendance_at,
    qrToken: effectiveStatus === 'active' ? rawToken : null,
    qrDataUrl,
    school,
    student: {
      id: student.id,
      user_id: student.user_id,
      admission_number: student.admission_number,
      first_name: student.first_name,
      middle_name: student.middle_name,
      last_name: student.last_name,
      gender: student.gender,
      date_of_birth: student.date_of_birth,
      class_name: student.class_name,
      arm_name: student.arm_name,
      photo_file_id: student.photo_file_id,
      status: student.status,
      portalLoginEnabled:
        student.status === 'active' &&
        Boolean(student.user_id) &&
        student.user_active === 1 &&
        student.membership_status === 'active',
    },
  };
}

// School Admin: Directory of Students & their Digital ID Card state
schoolIdCardsRouter.get(
  '/id-cards',
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId.trim() : '';
    const cardStatus = typeof req.query.cardStatus === 'string' ? req.query.cardStatus.trim() : '';

    const conditions = ['s.school_id = ?'];
    const params: Array<string> = [schoolId];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        "(LOWER(s.first_name || ' ' || s.last_name) LIKE ? OR LOWER(s.admission_number) LIKE ? OR LOWER(COALESCE(latest.card_number, '')) LIKE ?)",
      );
      params.push(pattern, pattern, pattern);
    }
    if (classId && classId !== 'all') {
      conditions.push('s.current_class_id = ?');
      params.push(classId);
    }

    const rows = db
      .prepare(`
        SELECT
          s.id AS student_id,
          s.user_id,
          s.admission_number,
          s.first_name,
          s.last_name,
          s.gender,
          s.status AS student_status,
          s.current_class_id AS class_id,
          c.name AS class_name,
          a.name AS arm_name,
          s.photo_file_id,
          latest.id AS card_id,
          latest.card_number,
          latest.status AS card_status,
          latest.issued_at,
          latest.expires_at,
          latest.last_used_login_at,
          latest.last_used_attendance_at
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        LEFT JOIN student_id_cards latest ON latest.id = (
          SELECT ic.id
          FROM student_id_cards ic
          WHERE ic.school_id = s.school_id AND ic.student_id = s.id
          ORDER BY CASE WHEN ic.status = 'active' THEN 0 ELSE 1 END ASC, ic.created_at DESC, ic.rowid DESC
          LIMIT 1
        )
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.last_name ASC, s.first_name ASC
        LIMIT 250
      `)
      .all(...params) as Array<{
      student_id: string;
      user_id: string | null;
      admission_number: string;
      first_name: string;
      last_name: string;
      gender: string;
      student_status: string;
      class_id: string | null;
      class_name: string | null;
      arm_name: string | null;
      photo_file_id: string | null;
      card_id: string | null;
      card_number: string | null;
      card_status: 'active' | 'revoked' | 'expired' | null;
      issued_at: string | null;
      expires_at: string | null;
      last_used_login_at: string | null;
      last_used_attendance_at: string | null;
    }>;

    const nowMs = Date.now();
    const normalized = rows.map((row) => {
      let effectiveStatus = row.card_status;
      if (effectiveStatus === 'active' && row.expires_at && new Date(row.expires_at).getTime() <= nowMs) {
        effectiveStatus = 'expired';
      }
      return { ...row, card_status: effectiveStatus };
    });

    const filtered = normalized.filter((item) => {
      if (!cardStatus || cardStatus === 'all') return true;
      if (cardStatus === 'unissued') return item.card_id === null;
      return item.card_status === cardStatus;
    });

    const activeCardsCount = normalized.filter((r) => r.card_status === 'active').length;
    const missingCardsCount = normalized.filter(
      (r) => r.student_status === 'active' && r.card_status !== 'active',
    ).length;

    res.json({
      items: filtered,
      summary: {
        totalStudents: normalized.length,
        activeCardsCount,
        missingCardsCount,
      },
    });
  },
);

// School Admin: Bulk Issue Digital ID Cards for all active students missing an active card
schoolIdCardsRouter.post(
  '/id-cards/bulk-issue',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = issueStudentIdCardSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid issuance payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;

    const eligibleStudents = db
      .prepare(`
        SELECT s.id
        FROM students s
        WHERE s.school_id = ? AND s.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM student_id_cards ic
            WHERE ic.school_id = s.school_id
              AND ic.student_id = s.id
              AND ic.status = 'active'
              AND datetime(ic.expires_at) > datetime('now')
          )
      `)
      .all(schoolId) as Array<{ id: string }>;

    if (eligibleStudents.length === 0) {
      res.json({ issuedCount: 0, message: 'All active students already have active Digital ID cards.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const stu of eligibleStudents) {
        issueCardInTransaction({
          schoolId,
          studentId: stu.id,
          actorUserId: req.auth!.id,
          validityDays: parsed.data.validityDays,
        });
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Bulk issue student ID cards failed:', err);
      res.status(500).json({ error: 'Unable to bulk issue Digital ID cards.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student_id_card.bulk_issued',
      resourceType: 'student_id_card',
      outcome: 'success',
      metadata: { issuedCount: eligibleStudents.length, validityDays: parsed.data.validityDays },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      issuedCount: eligibleStudents.length,
      message: `Issued Digital ID cards for ${eligibleStudents.length} active student(s).`,
    });
  },
);

// School Admin: Get single student's latest Digital ID card (with rendered QR DataURL)
schoolIdCardsRouter.get(
  '/students/:studentId/id-card',
  requirePermission('school.students.manage'),
  async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = getStudentForCard(schoolId, req.params.studentId);
    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    const card = db
      .prepare(`
        SELECT *
        FROM student_id_cards
        WHERE school_id = ? AND student_id = ?
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC, created_at DESC, rowid DESC
        LIMIT 1
      `)
      .get(schoolId, student.id) as IdCardDbRow | undefined;

    if (!card) {
      res.json({
        card: null,
        school: getSchoolCardMeta(schoolId),
        student,
      });
      return;
    }

    const formatted = await formatCardResponse(schoolId, card, student);
    res.json({ card: formatted });
  },
);

// School Admin: Issue or Rotate a student's Digital ID card
schoolIdCardsRouter.post(
  '/students/:studentId/id-card',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = issueStudentIdCardSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid issuance payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const student = getStudentForCard(schoolId, req.params.studentId);
    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }
    if (student.status !== 'active') {
      res.status(400).json({
        error: `Cannot issue a Digital ID Card for a ${student.status} student.`,
      });
      return;
    }

    let issued: { cardId: string; cardNumber: string; expiresAt: string };
    db.exec('BEGIN IMMEDIATE');
    try {
      issued = issueCardInTransaction({
        schoolId,
        studentId: student.id,
        actorUserId: req.auth!.id,
        validityDays: parsed.data.validityDays,
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Issue student ID card failed:', err);
      res.status(500).json({ error: 'Unable to issue student Digital ID card.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student_id_card.issued',
      resourceType: 'student_id_card',
      resourceId: issued.cardId,
      outcome: 'success',
      metadata: {
        studentId: student.id,
        admissionNumber: student.admission_number,
        cardNumber: issued.cardNumber,
      },
      ipAddress: getClientIp(req),
    });

    const card = db
      .prepare('SELECT * FROM student_id_cards WHERE id = ? AND school_id = ?')
      .get(issued.cardId, schoolId) as unknown as IdCardDbRow;

    const formatted = await formatCardResponse(schoolId, card, student);
    res.status(201).json({ card: formatted });
  },
);

// School Admin: Revoke an active Digital ID card
schoolIdCardsRouter.patch(
  '/id-cards/:cardId/revoke',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = revokeStudentIdCardSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid revoke payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const card = db
      .prepare('SELECT id, student_id, card_number, status FROM student_id_cards WHERE id = ? AND school_id = ?')
      .get(req.params.cardId, schoolId) as
      | { id: string; student_id: string; card_number: string; status: string }
      | undefined;

    if (!card) {
      res.status(404).json({ error: 'Digital ID card not found in your school.' });
      return;
    }
    if (card.status === 'revoked') {
      res.status(400).json({ error: 'This Digital ID card is already revoked.' });
      return;
    }

    db.prepare(`
      UPDATE student_id_cards
      SET status = 'revoked',
          revoked_by_user_id = ?,
          revoked_reason = ?,
          revoked_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(req.auth!.id, parsed.data.reason, card.id, schoolId);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student_id_card.revoked',
      resourceType: 'student_id_card',
      resourceId: card.id,
      outcome: 'success',
      metadata: {
        studentId: card.student_id,
        cardNumber: card.card_number,
        reason: parsed.data.reason,
      },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, id: card.id, status: 'revoked' });
  },
);

// Student Portal: Fetch ONLY the authenticated student's own active Digital ID card
schoolIdCardsRouter.get(
  '/student/id-card',
  requirePermission('student.workspace.read'),
  async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;

    const student = db
      .prepare(`
        SELECT
          s.id, s.school_id, s.user_id, s.admission_number,
          s.first_name, s.middle_name, s.last_name, s.gender, s.date_of_birth,
          s.photo_file_id, s.status,
          c.name AS class_name, a.name AS arm_name,
          u.is_active AS user_active, sm.status AS membership_status
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN school_memberships sm ON sm.user_id = s.user_id AND sm.school_id = s.school_id
        WHERE s.school_id = ? AND s.user_id = ?
        LIMIT 1
      `)
      .get(schoolId, req.auth!.id) as StudentProfileForCard | undefined;

    if (!student) {
      res.json({ card: null, school: getSchoolCardMeta(schoolId), student: null });
      return;
    }

    const card = db
      .prepare(`
        SELECT *
        FROM student_id_cards
        WHERE school_id = ? AND student_id = ?
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC, created_at DESC, rowid DESC
        LIMIT 1
      `)
      .get(schoolId, student.id) as IdCardDbRow | undefined;

    if (!card) {
      res.json({ card: null, school: getSchoolCardMeta(schoolId), student });
      return;
    }

    const formatted = await formatCardResponse(schoolId, card, student);
    res.json({ card: formatted });
  },
);
