import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { getDb } from '../db/client.ts';
import { recordAuditLog } from './audit.ts';
import { saveValidatedFile } from './file-storage.ts';
import {
  allocateNextCardNumber,
  decryptIdCardToken,
  evaluateIdCardValidity,
  extractIdCardTokenFromScan,
  getOrCreateIdCardMasterSecret,
  issueDigitalIdCard,
} from './id-card-helpers.ts';
import { renderStudentIdCardPngBuffer } from './id-card-renderer.ts';
import { allocateUniqueAdmissionNumber } from './school-helpers.ts';
import { generateOpaqueToken, hashPassword, sha256Hex, verifyPassword } from './security.ts';
import type { AuthEnvironment, RoleCode } from './types.ts';

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramSendOptions {
  parseMode?: 'Markdown' | 'HTML';
  inlineKeyboard?: TelegramInlineButton[][];
}

export interface TelegramLinkRow {
  telegram_chat_id: string;
  user_id: string;
  school_id: string | null;
  profile_id: string | null;
  auth_environment: AuthEnvironment;
  role: RoleCode;
  username: string | null;
  linked_at: string;
  school_name?: string | null;
  school_code?: string | null;
  user_full_name?: string | null;
  user_email?: string | null;
}

interface VerifiedPortalAccount {
  userId: string;
  fullName: string;
  email: string;
  schoolId: string | null;
  schoolName: string | null;
  profileId: string | null;
  authEnvironment: AuthEnvironment;
  role: RoleCode;
  summaryLabel: string;
}

export function getBotToken(): string | null {
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }
  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT value_json FROM platform_settings WHERE key = 'telegram_bot_token'`)
      .get() as { value_json?: string } | undefined;
    if (row?.value_json) {
      try {
        const parsed = JSON.parse(row.value_json);
        return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
      } catch {
        return row.value_json.trim() || null;
      }
    }
  } catch {
    // ignore before migration/init
  }
  return null;
}

export function getBotUsername(): string | null {
  if (process.env.TELEGRAM_BOT_USERNAME?.trim()) {
    return process.env.TELEGRAM_BOT_USERNAME.trim().replace(/^@/, '');
  }
  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT value_json FROM platform_settings WHERE key = 'telegram_bot_username'`)
      .get() as { value_json?: string } | undefined;
    if (row?.value_json) {
      try {
        const parsed = JSON.parse(row.value_json);
        return typeof parsed === 'string' && parsed.trim() ? parsed.trim().replace(/^@/, '') : null;
      } catch {
        return row.value_json.trim().replace(/^@/, '') || null;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function resolveBotUsername(): Promise<string | null> {
  const existing = getBotUsername();
  if (existing) return existing;

  const token = getBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    const username = data.ok && data.result?.username ? data.result.username.trim().replace(/^@/, '') : null;
    if (username) {
      const db = getDb();
      db.prepare(`
        INSERT INTO platform_settings (key, value_json, updated_by, updated_at)
        VALUES ('telegram_bot_username', ?, 'system', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = datetime('now')
      `).run(JSON.stringify(username));
      return username;
    }
  } catch {
    // ignore network failure
  }
  return null;
}

export function getDashboardPathForRole(role: string): string {
  switch (role) {
    case 'platform_owner':
    case 'workforce_admin':
    case 'workforce_support':
      return '/dashboard/owner';
    case 'school_admin':
      return '/dashboard/school-admin';
    case 'teacher':
      return '/dashboard/teacher';
    case 'student':
      return '/dashboard/student';
    case 'parent':
      return '/dashboard/parent';
    default:
      return '/dashboard/school-admin';
  }
}

export function getPortalBaseUrl(overrideBaseUrl?: string): string {
  const raw = (overrideBaseUrl || process.env.APP_URL || 'http://localhost:3000').trim();
  return raw.replace(/\/$/, '');
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: TelegramSendOptions = {},
): Promise<boolean> {
  const token = getBotToken();
  if (!token) {
    return true;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode ?? 'Markdown',
    };
    if (options.inlineKeyboard && options.inlineKeyboard.length > 0) {
      body.reply_markup = {
        inline_keyboard: options.inlineKeyboard,
      };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean };
    return Boolean(data.ok);
  } catch (err) {
    console.error('[TelegramBot] Failed to send message:', err);
    return false;
  }
}

export async function sendTelegramPhoto(
  chatId: string | number,
  pngBuffer: Buffer,
  caption: string,
  options: TelegramSendOptions & { filename?: string } = {},
): Promise<boolean> {
  const token = getBotToken();
  if (!token) {
    return true;
  }
  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', caption);
    formData.append('parse_mode', options.parseMode ?? 'Markdown');
    if (options.inlineKeyboard && options.inlineKeyboard.length > 0) {
      formData.append(
        'reply_markup',
        JSON.stringify({ inline_keyboard: options.inlineKeyboard }),
      );
    }
    const filename = options.filename || 'student-id-qr.png';
    const mimeType = filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    const blob = new Blob([new Uint8Array(pngBuffer)], { type: mimeType });
    formData.append('photo', blob, filename);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });
    const data = (await res.json()) as { ok: boolean };
    return Boolean(data.ok);
  } catch (err) {
    console.error('[TelegramBot] Failed to send photo:', err);
    return false;
  }
}

export async function downloadTelegramFile(fileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  originalName: string;
} | null> {
  const token = getBotToken();
  if (!token) return null;
  try {
    const metaRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const meta = (await metaRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };
    if (!meta.ok || !meta.result?.file_path) return null;

    const filePath = meta.result.file_path;
    const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!downloadRes.ok) return null;

    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const originalName = filePath.split('/').pop() || `telegram_${fileId}.${ext}`;
    return { buffer, mimeType, originalName };
  } catch (err) {
    console.error('[TelegramBot] Failed to download file from Telegram:', err);
    return null;
  }
}

export function extractPhotoOrImageDocument(message: any): { fileId: string; fileName?: string } | null {
  if (Array.isArray(message?.photo) && message.photo.length > 0) {
    const best = message.photo[message.photo.length - 1];
    if (best?.file_id) {
      return { fileId: String(best.file_id) };
    }
  }
  if (message?.document?.file_id) {
    const doc = message.document;
    const mime = String(doc.mime_type || '').toLowerCase();
    const name = String(doc.file_name || '').toLowerCase();
    if (
      mime.startsWith('image/') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.webp')
    ) {
      return { fileId: String(doc.file_id), fileName: doc.file_name };
    }
  }
  return null;
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const token = getBotToken();
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      }),
    });
  } catch {
    // ignore
  }
}

function escapeTelegramMarkdown(value: string): string {
  return value.replace(/([_*`\[])/g, '\\$1');
}

export async function dispatchTelegramNotification(params: {
  schoolId: string | null;
  scope: 'platform' | 'school' | 'teacher' | 'student' | 'parent' | 'direct';
  targetRoleCode?: string | null;
  targetUserId?: string | null;
  title: string;
  body: string;
  severity: 'info' | 'notice' | 'urgent';
  createdByName: string;
}): Promise<{ dispatched: number }> {
  if (!getBotToken()) {
    return { dispatched: 0 };
  }

  const db = getDb();
  let chatRows: Array<{ telegram_chat_id: string }> = [];

  try {
    if (params.scope === 'platform') {
      chatRows = db.prepare('SELECT DISTINCT telegram_chat_id FROM telegram_links').all() as Array<{
        telegram_chat_id: string;
      }>;
    } else if (params.scope === 'direct' && params.targetUserId) {
      if (params.schoolId) {
        chatRows = db
          .prepare(
            'SELECT DISTINCT telegram_chat_id FROM telegram_links WHERE user_id = ? AND school_id = ?',
          )
          .all(params.targetUserId, params.schoolId) as Array<{ telegram_chat_id: string }>;
      } else {
        chatRows = db
          .prepare('SELECT DISTINCT telegram_chat_id FROM telegram_links WHERE user_id = ?')
          .all(params.targetUserId) as Array<{ telegram_chat_id: string }>;
      }
    } else if (params.scope === 'school' && params.schoolId) {
      chatRows = db
        .prepare('SELECT DISTINCT telegram_chat_id FROM telegram_links WHERE school_id = ?')
        .all(params.schoolId) as Array<{ telegram_chat_id: string }>;
    } else if (
      (params.scope === 'teacher' || params.scope === 'student' || params.scope === 'parent') &&
      params.schoolId
    ) {
      if (params.targetUserId) {
        chatRows = db
          .prepare(
            'SELECT DISTINCT telegram_chat_id FROM telegram_links WHERE school_id = ? AND user_id = ?',
          )
          .all(params.schoolId, params.targetUserId) as Array<{ telegram_chat_id: string }>;
      } else {
        const roleFilter = params.targetRoleCode || params.scope;
        chatRows = db
          .prepare(
            'SELECT DISTINCT telegram_chat_id FROM telegram_links WHERE school_id = ? AND role = ?',
          )
          .all(params.schoolId, roleFilter) as Array<{ telegram_chat_id: string }>;
      }
    }
  } catch (err) {
    console.error('[TelegramBot] Notification recipient lookup failed:', err);
    return { dispatched: 0 };
  }

  if (chatRows.length === 0) {
    return { dispatched: 0 };
  }

  const icon = params.severity === 'urgent' ? '🚨' : params.severity === 'notice' ? '📢' : '🔔';
  const severityLabel = params.severity.toUpperCase();
  const safeTitle = escapeTelegramMarkdown(params.title.trim());
  const safeBody = escapeTelegramMarkdown(params.body.trim());
  const safeSender = escapeTelegramMarkdown(params.createdByName.trim() || 'Portal Administration');
  const message =
    `${icon} *${severityLabel}: ${safeTitle}*\n\n` +
    `${safeBody}\n\n` +
    `_From: ${safeSender}_`;

  let dispatched = 0;
  // Cap concurrent outbound dispatches in small batches to stay well within Telegram rate limits
  for (let i = 0; i < chatRows.length; i += 10) {
    const batch = chatRows.slice(i, i + 10);
    const results = await Promise.all(
      batch.map((row) => sendTelegramMessage(row.telegram_chat_id, message).catch(() => false)),
    );
    dispatched += results.filter(Boolean).length;
  }

  return { dispatched };
}

export function createTelegramToken(params: {
  purpose: 'magic_login' | 'connect_link';
  userId: string;
  schoolId: string | null;
  profileId: string | null;
  authEnvironment: AuthEnvironment;
  role: RoleCode;
  ttlMinutes?: number;
}): string {
  const db = getDb();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(
    Date.now() + (params.ttlMinutes ?? 15) * 60 * 1000,
  ).toISOString();

  db.prepare(`
    INSERT INTO telegram_login_tokens (
      id, token_hash, purpose, user_id, school_id, profile_id,
      auth_environment, role, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `tgl_${crypto.randomUUID()}`,
    tokenHash,
    params.purpose,
    params.userId,
    params.schoolId,
    params.profileId,
    params.authEnvironment,
    params.role,
    expiresAt,
  );

  return rawToken;
}

export function consumeTelegramToken(
  rawToken: string,
  expectedPurpose: 'magic_login' | 'connect_link',
): {
  id: string;
  user_id: string;
  school_id: string | null;
  profile_id: string | null;
  auth_environment: AuthEnvironment;
  role: RoleCode;
} | null {
  const db = getDb();
  const tokenHash = sha256Hex(rawToken.trim());
  const row = db
    .prepare(`
      SELECT id, user_id, school_id, profile_id, auth_environment, role, expires_at, used_at
      FROM telegram_login_tokens
      WHERE token_hash = ? AND purpose = ?
    `)
    .get(tokenHash, expectedPurpose) as
    | {
        id: string;
        user_id: string;
        school_id: string | null;
        profile_id: string | null;
        auth_environment: AuthEnvironment;
        role: RoleCode;
        expires_at: string;
        used_at: string | null;
      }
    | undefined;

  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  const res = db
    .prepare(
      `UPDATE telegram_login_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL`,
    )
    .run(row.id);

  if (Number(res.changes ?? 0) === 0) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    school_id: row.school_id,
    profile_id: row.profile_id,
    auth_environment: row.auth_environment,
    role: row.role,
  };
}

export function resolveUserAccountContext(userId: string): Omit<VerifiedPortalAccount, 'email'> & { email: string } | null {
  const db = getDb();
  const user = db
    .prepare(`SELECT id, email, full_name, user_type, is_active FROM users WHERE id = ?`)
    .get(userId) as
    | { id: string; email: string; full_name: string; user_type: string; is_active: number }
    | undefined;

  if (!user || user.is_active !== 1) return null;

  if (user.user_type === 'workforce') {
    const wa = db
      .prepare(`
        SELECT r.code AS role_code
        FROM workforce_assignments wa
        INNER JOIN roles r ON r.id = wa.role_id
        WHERE wa.user_id = ?
      `)
      .get(user.id) as { role_code: RoleCode } | undefined;

    if (!wa) return null;
    return {
      userId: user.id,
      fullName: user.full_name,
      email: user.email,
      schoolId: null,
      schoolName: 'Dave Timi EdTech Platform',
      profileId: null,
      authEnvironment: 'workers',
      role: wa.role_code,
      summaryLabel: wa.role_code.replace(/_/g, ' ').toUpperCase(),
    };
  }

  const membership = db
    .prepare(`
      SELECT sm.school_id, sm.status AS membership_status, r.code AS role_code, sc.name AS school_name, sc.status AS school_status
      FROM school_memberships sm
      INNER JOIN roles r ON r.id = sm.role_id
      INNER JOIN schools sc ON sc.id = sm.school_id
      WHERE sm.user_id = ? AND sm.status = 'active'
      ORDER BY sm.created_at ASC
      LIMIT 1
    `)
    .get(user.id) as
    | {
        school_id: string;
        membership_status: string;
        role_code: RoleCode;
        school_name: string;
        school_status: string;
      }
    | undefined;

  if (!membership || membership.school_status === 'suspended') return null;

  let profileId: string | null = null;
  let summaryLabel = membership.role_code.replace(/_/g, ' ').toUpperCase();

  if (membership.role_code === 'student') {
    const stu = db
      .prepare(`SELECT id, admission_number FROM students WHERE user_id = ? AND school_id = ? LIMIT 1`)
      .get(user.id, membership.school_id) as { id: string; admission_number: string } | undefined;
    if (stu) {
      profileId = stu.id;
      summaryLabel = `Student (${stu.admission_number})`;
    }
  } else if (membership.role_code === 'teacher') {
    const tch = db
      .prepare(`SELECT id, staff_id_number FROM teachers WHERE user_id = ? AND school_id = ? LIMIT 1`)
      .get(user.id, membership.school_id) as { id: string; staff_id_number: string } | undefined;
    if (tch) {
      profileId = tch.id;
      summaryLabel = `Teacher (${tch.staff_id_number})`;
    }
  } else if (membership.role_code === 'parent') {
    const par = db
      .prepare(`SELECT id FROM parents WHERE user_id = ? AND school_id = ? LIMIT 1`)
      .get(user.id, membership.school_id) as { id: string } | undefined;
    if (par) {
      profileId = par.id;
      summaryLabel = 'Parent / Guardian';
    }
  } else if (membership.role_code === 'school_admin') {
    summaryLabel = 'School Administrator';
  }

  return {
    userId: user.id,
    fullName: user.full_name,
    email: user.email,
    schoolId: membership.school_id,
    schoolName: membership.school_name,
    profileId,
    authEnvironment: 'school',
    role: membership.role_code,
    summaryLabel,
  };
}

export function verifyCredentialsForTelegramLink(
  identifierRaw: string,
  passwordRaw: string,
): { ok: true; account: VerifiedPortalAccount } | { ok: false; error: string } {
  const identifier = identifierRaw.trim();
  const password = passwordRaw;
  if (!identifier || !password) {
    return { ok: false, error: 'Please provide both your email/ID and password.' };
  }

  const db = getDb();
  let targetUserId: string | null = null;

  const byEmail = db
    .prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`)
    .get(identifier) as { id: string } | undefined;
  if (byEmail) {
    targetUserId = byEmail.id;
  }

  if (!targetUserId) {
    const byAdm = db
      .prepare(`SELECT user_id FROM students WHERE UPPER(admission_number) = UPPER(?) AND user_id IS NOT NULL LIMIT 1`)
      .get(identifier) as { user_id: string } | undefined;
    if (byAdm) targetUserId = byAdm.user_id;
  }

  if (!targetUserId) {
    const byStaff = db
      .prepare(`SELECT user_id FROM teachers WHERE UPPER(staff_id_number) = UPPER(?) AND user_id IS NOT NULL LIMIT 1`)
      .get(identifier) as { user_id: string } | undefined;
    if (byStaff) targetUserId = byStaff.user_id;
  }

  if (!targetUserId) {
    return {
      ok: false,
      error: 'No portal account matched that email, admission number, or staff ID.',
    };
  }

  const user = db
    .prepare(`SELECT id, password_hash, is_active FROM users WHERE id = ?`)
    .get(targetUserId) as { id: string; password_hash: string; is_active: number } | undefined;

  if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
    return { ok: false, error: 'Invalid password. Please verify your portal credentials and try again.' };
  }

  const ctx = resolveUserAccountContext(user.id);
  if (!ctx) {
    return {
      ok: false,
      error: 'Your account is suspended or does not have an active school/platform role.',
    };
  }

  return { ok: true, account: ctx };
}

export function authenticateIdCardForTelegramLink(
  rawQrText: string,
): { ok: true; account: VerifiedPortalAccount } | { ok: false; error: string } {
  const qrToken = extractIdCardTokenFromScan(rawQrText);
  if (!qrToken) {
    return { ok: false, error: 'No Digital ID Card QR token detected.' };
  }

  const db = getDb();
  const tokenHash = sha256Hex(qrToken);
  const card = db
    .prepare(`
      SELECT id, school_id, student_id, status, expires_at, revoked_at
      FROM student_id_cards
      WHERE qr_token_hash = ?
      LIMIT 1
    `)
    .get(tokenHash) as
    | {
        id: string;
        school_id: string;
        student_id: string;
        status: string;
        expires_at: string;
        revoked_at: string | null;
      }
    | undefined;

  if (!card) {
    return { ok: false, error: 'Unrecognized Digital ID Card QR token.' };
  }

  const validity = evaluateIdCardValidity(card);
  if (!validity.valid) {
    return { ok: false, error: validity.reason };
  }

  const student = db
    .prepare(`SELECT user_id FROM students WHERE id = ? AND school_id = ?`)
    .get(card.student_id, card.school_id) as { user_id: string | null } | undefined;

  if (!student?.user_id) {
    return { ok: false, error: 'Student portal login is not enabled for this ID card yet.' };
  }

  const ctx = resolveUserAccountContext(student.user_id);
  if (!ctx) {
    return { ok: false, error: 'This student account is inactive or suspended.' };
  }

  db.prepare(`UPDATE student_id_cards SET last_used_login_at = datetime('now') WHERE id = ?`).run(card.id);
  return { ok: true, account: ctx };
}

function saveTelegramLink(
  chatId: string,
  telegramUsername: string,
  account: {
    userId: string;
    schoolId: string | null;
    profileId: string | null;
    authEnvironment: AuthEnvironment;
    role: RoleCode;
  },
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO telegram_links (
      telegram_chat_id, user_id, school_id, profile_id, auth_environment, role, username, linked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(telegram_chat_id) DO UPDATE SET
      user_id = excluded.user_id,
      school_id = excluded.school_id,
      profile_id = excluded.profile_id,
      auth_environment = excluded.auth_environment,
      role = excluded.role,
      username = excluded.username,
      linked_at = datetime('now')
  `).run(
    chatId,
    account.userId,
    account.schoolId,
    account.profileId,
    account.authEnvironment,
    account.role,
    telegramUsername,
  );
}

function getTelegramLink(chatId: string): TelegramLinkRow | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT
        tl.*,
        sc.name AS school_name,
        sc.code AS school_code,
        u.full_name AS user_full_name,
        u.email AS user_email
      FROM telegram_links tl
      INNER JOIN users u ON u.id = tl.user_id
      LEFT JOIN schools sc ON sc.id = tl.school_id
      WHERE tl.telegram_chat_id = ?
    `)
    .get(chatId) as TelegramLinkRow | undefined;

  return row ?? null;
}

function setChatState(chatId: string, step: string, payload: Record<string, unknown> = {}): void {
  const db = getDb();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO telegram_chat_states (telegram_chat_id, step, payload_json, expires_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(telegram_chat_id) DO UPDATE SET
      step = excluded.step,
      payload_json = excluded.payload_json,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(chatId, step, JSON.stringify(payload), expiresAt);
}

function getChatState(chatId: string): { step: string; payload: Record<string, unknown> } | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT step, payload_json, expires_at FROM telegram_chat_states WHERE telegram_chat_id = ?`)
    .get(chatId) as { step: string; payload_json: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM telegram_chat_states WHERE telegram_chat_id = ?`).run(chatId);
    return null;
  }
  try {
    return { step: row.step, payload: JSON.parse(row.payload_json) };
  } catch {
    return { step: row.step, payload: {} };
  }
}

function clearChatState(chatId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM telegram_chat_states WHERE telegram_chat_id = ?`).run(chatId);
}

export function buildUnlinkedKeyboard(): TelegramInlineButton[][] {
  return [
    [{ text: '🔐 Sign In / Link Portal Account', callback_data: 'auth:start_link' }],
    [{ text: '🆔 Student Digital ID Card Login', callback_data: 'auth:start_id_login' }],
    [{ text: '❓ How It Works', callback_data: 'action:help' }],
  ];
}

export function buildRoleMenuKeyboard(role: RoleCode): TelegramInlineButton[][] {
  switch (role) {
    case 'student':
      return [
        [{ text: '🔑 Open Student Portal (1-Click Login)', callback_data: 'menu:login' }],
        [
          { text: '📊 My Attendance', callback_data: 'menu:attendance' },
          { text: '📚 My Results', callback_data: 'menu:results' },
        ],
        [
          { text: '💳 My Fees', callback_data: 'menu:fees' },
          { text: '🆔 Digital ID Card', callback_data: 'menu:idcard' },
        ],
        [
          { text: '🔔 Notifications', callback_data: 'menu:notices' },
          { text: '🔌 Unlink', callback_data: 'menu:unlink' },
        ],
      ];

    case 'parent':
      return [
        [{ text: '🔑 Open Parent Portal (1-Click Login)', callback_data: 'menu:login' }],
        [
          { text: '👶 My Wards', callback_data: 'menu:wards' },
          { text: '📊 Ward Attendance', callback_data: 'menu:attendance' },
        ],
        [
          { text: '📚 Ward Results', callback_data: 'menu:results' },
          { text: '💳 Ward Fees', callback_data: 'menu:fees' },
        ],
        [
          { text: '🔔 School Notices', callback_data: 'menu:notices' },
          { text: '🔌 Unlink', callback_data: 'menu:unlink' },
        ],
      ];

    case 'teacher':
      return [
        [{ text: '🔑 Open Teacher Workspace', callback_data: 'menu:login' }],
        [
          { text: '🏫 My Classes & Subjects', callback_data: 'menu:classes' },
          { text: '📊 Today Attendance', callback_data: 'menu:attendance' },
        ],
        [
          { text: '🆔 ID Card Check-In', callback_data: 'menu:checkin_prompt' },
          { text: '🔔 Notices', callback_data: 'menu:notices' },
        ],
        [{ text: '🔌 Unlink', callback_data: 'menu:unlink' }],
      ];

    case 'school_admin':
      return [
        [{ text: '🔑 Open School Admin Portal', callback_data: 'menu:login' }],
        [
          { text: '➕ Register Student', callback_data: 'menu:reg_student' },
          { text: '👨‍🏫 Register Teacher', callback_data: 'menu:reg_teacher' },
        ],
        [
          { text: '👪 Register Parent', callback_data: 'menu:reg_parent' },
          { text: '📸 Upload Photo', callback_data: 'menu:upload_photo' },
        ],
        [
          { text: '🎓 Students', callback_data: 'menu:students' },
          { text: '👨‍🏫 Teachers', callback_data: 'menu:teachers' },
        ],
        [
          { text: '📈 School Snapshot', callback_data: 'menu:overview' },
          { text: '📝 Admissions', callback_data: 'menu:admissions' },
        ],
        [
          { text: '💳 Finance Summary', callback_data: 'menu:finance' },
          { text: '🔔 Notices', callback_data: 'menu:notices' },
        ],
        [{ text: '🔌 Unlink', callback_data: 'menu:unlink' }],
      ];

    case 'platform_owner':
    case 'workforce_admin':
    case 'workforce_support':
      return [
        [{ text: '🔑 Open Owner Console', callback_data: 'menu:login' }],
        [
          { text: '➕ Register Student', callback_data: 'menu:reg_student' },
          { text: '👨‍🏫 Register Teacher', callback_data: 'menu:reg_teacher' },
        ],
        [
          { text: '🌐 Platform Overview', callback_data: 'menu:overview' },
          { text: '🏫 Schools Directory', callback_data: 'menu:schools' },
        ],
        [
          { text: '🔔 Platform Notices', callback_data: 'menu:notices' },
          { text: '🔌 Unlink', callback_data: 'menu:unlink' },
        ],
      ];
  }
}

async function sendRoleDashboardWelcome(chatId: string, link: TelegramLinkRow): Promise<void> {
  const roleTitle = link.role.replace(/_/g, ' ').toUpperCase();
  const schoolLine = link.school_name ? `🏫 *School:* ${link.school_name}\n` : '';
  await sendTelegramMessage(
    chatId,
    `👋 *${link.user_full_name || 'Portal User'}*\n` +
      `${schoolLine}` +
      `🛡 *Role:* ${roleTitle}\n\n` +
      `Use the quick menu buttons below to sign in or manage your portal directly from Telegram:`,
    { inlineKeyboard: buildRoleMenuKeyboard(link.role) },
  );
}

async function handleMagicLogin(chatId: string, link: TelegramLinkRow, baseUrl?: string): Promise<void> {
  const token = createTelegramToken({
    purpose: 'magic_login',
    userId: link.user_id,
    schoolId: link.school_id,
    profileId: link.profile_id,
    authEnvironment: link.auth_environment,
    role: link.role,
    ttlMinutes: 15,
  });
  const portalUrl = getPortalBaseUrl(baseUrl);
  const loginUrl = `${portalUrl}/auth/telegram-callback?token=${encodeURIComponent(token)}`;
  const isHttps = loginUrl.startsWith('https://');

  await sendTelegramMessage(
    chatId,
    `🔑 *One-Click Portal Login*\n\n` +
      `Account: *${link.user_full_name}* (${link.role.replace(/_/g, ' ').toUpperCase()})\n` +
      `Valid for *15 minutes* (single use).\n\n` +
      `Tap here to open your dashboard:\n${loginUrl}`,
    {
      inlineKeyboard: isHttps
        ? [
            [{ text: '🚀 Open My Portal Dashboard', url: loginUrl }],
            [{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }],
          ]
        : [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    },
  );
}

async function handleAttendanceAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  const db = getDb();

  if (link.role === 'student' && link.profile_id) {
    const records = db
      .prepare(`
        SELECT attendance_date, status, remarks, source
        FROM attendance_records
        WHERE student_id = ?
        ORDER BY attendance_date DESC
        LIMIT 7
      `)
      .all(link.profile_id) as Array<{
      attendance_date: string;
      status: string;
      remarks: string;
      source: string;
    }>;

    const stats = db
      .prepare(`
        SELECT status, COUNT(*) AS cnt
        FROM attendance_records
        WHERE student_id = ?
        GROUP BY status
      `)
      .all(link.profile_id) as Array<{ status: string; cnt: number }>;

    let msg = `📊 *My Attendance Summary*\n\n`;
    if (stats.length === 0) {
      msg += `No attendance records found yet.`;
    } else {
      for (const s of stats) {
        msg += `• *${s.status.toUpperCase()}*: ${s.cnt} day(s)\n`;
      }
      msg += `\n*Recent Records:*\n`;
      for (const r of records) {
        msg += `• \`${r.attendance_date}\`: *${r.status.toUpperCase()}*${r.remarks ? ` (${r.remarks})` : ''}\n`;
      }
    }
    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  if (link.role === 'parent' && link.profile_id) {
    const wards = db
      .prepare(`
        SELECT s.id, s.first_name, s.last_name, s.admission_number
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id
        WHERE sg.parent_id = ?
      `)
      .all(link.profile_id) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
    }>;

    if (wards.length === 0) {
      await sendTelegramMessage(chatId, `👶 No wards are currently linked to your parent profile.`, {
        inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
      });
      return;
    }

    let msg = `📊 *Ward Attendance Overview*\n\n`;
    for (const w of wards) {
      const stats = db
        .prepare(`SELECT status, COUNT(*) AS cnt FROM attendance_records WHERE student_id = ? GROUP BY status`)
        .all(w.id) as Array<{ status: string; cnt: number }>;
      const recent = db
        .prepare(`SELECT attendance_date, status FROM attendance_records WHERE student_id = ? ORDER BY attendance_date DESC LIMIT 1`)
        .get(w.id) as { attendance_date: string; status: string } | undefined;

      msg += `👤 *${w.first_name} ${w.last_name}* (\`${w.admission_number}\`)\n`;
      if (stats.length === 0) {
        msg += `   _No attendance records yet._\n\n`;
      } else {
        const line = stats.map((s) => `${s.status}: ${s.cnt}`).join(' · ');
        msg += `   Summary: ${line}\n`;
        if (recent) {
          msg += `   Latest: \`${recent.attendance_date}\` — *${recent.status.toUpperCase()}*\n`;
        }
        msg += `\n`;
      }
    }

    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  if (link.role === 'teacher' && link.school_id) {
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = db
      .prepare(`
        SELECT status, COUNT(*) AS cnt
        FROM attendance_records
        WHERE school_id = ? AND attendance_date = ?
        GROUP BY status
      `)
      .all(link.school_id, today) as Array<{ status: string; cnt: number }>;

    let msg = `📊 *School Attendance Today (${today})*\n\n`;
    if (todayStats.length === 0) {
      msg += `No attendance marked yet today.\n\nUse *ID Card Check-In* or \`/checkin <DTID-...>\` to mark a student present right from Telegram.`;
    } else {
      for (const s of todayStats) {
        msg += `• *${s.status.toUpperCase()}*: ${s.cnt}\n`;
      }
      msg += `\nUse \`/checkin <DTID-...>\` to mark a student via Digital ID Card.`;
    }
    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [
        [{ text: '🆔 ID Card Check-In', callback_data: 'menu:checkin_prompt' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }],
      ],
    });
    return;
  }

  await sendTelegramMessage(chatId, `📊 Open the web portal via \`/login\` for detailed attendance registers.`, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleResultsAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  const db = getDb();

  if (link.role === 'student' && link.profile_id) {
    const pubs = db
      .prepare(`
        SELECT rp.average_score, rp.overall_grade, rp.class_position, rp.class_size, rp.overall_remark, at.name AS term_name
        FROM result_publications rp
        INNER JOIN academic_terms at ON at.id = rp.academic_term_id
        WHERE rp.student_id = ? AND rp.status = 'published'
        ORDER BY rp.published_at DESC
        LIMIT 2
      `)
      .all(link.profile_id) as Array<{
      average_score: number;
      overall_grade: string;
      class_position: number | null;
      class_size: number;
      overall_remark: string;
      term_name: string;
    }>;

    const subjects = db
      .prepare(`
        SELECT sub.name AS subject_name, cr.ca_score, cr.exam_score, cr.total_score, cr.grade, cr.remark
        FROM computed_results cr
        INNER JOIN subjects sub ON sub.id = cr.subject_id
        WHERE cr.student_id = ? AND cr.status = 'published'
        ORDER BY cr.published_at DESC
        LIMIT 12
      `)
      .all(link.profile_id) as Array<{
      subject_name: string;
      ca_score: number;
      exam_score: number;
      total_score: number;
      grade: string;
      remark: string;
    }>;

    if (pubs.length === 0 && subjects.length === 0) {
      await sendTelegramMessage(chatId, `📚 No published results are available for your account yet.`, {
        inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
      });
      return;
    }

    let msg = `📚 *Published Academic Results*\n\n`;
    for (const p of pubs) {
      msg += `🏆 *${p.term_name}*\n`;
      msg += `• Average: *${Number(p.average_score).toFixed(1)}%* | Grade: *${p.overall_grade}*\n`;
      if (p.class_position) {
        msg += `• Position: *${p.class_position} / ${p.class_size}*\n`;
      }
      msg += `\n`;
    }
    if (subjects.length > 0) {
      msg += `*Subject Breakdown:*\n`;
      for (const s of subjects) {
        msg += `• *${s.subject_name}*: ${s.total_score} (CA ${s.ca_score} + Exam ${s.exam_score}) — *${s.grade}*\n`;
      }
    }

    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  if (link.role === 'parent' && link.profile_id) {
    const wards = db
      .prepare(`
        SELECT s.id, s.first_name, s.last_name, sg.can_view_academic_records
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id
        WHERE sg.parent_id = ?
      `)
      .all(link.profile_id) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      can_view_academic_records: number;
    }>;

    if (wards.length === 0) {
      await sendTelegramMessage(chatId, `👶 No wards are linked to your account.`, {
        inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
      });
      return;
    }

    let msg = `📚 *Ward Published Results*\n\n`;
    for (const w of wards) {
      msg += `👤 *${w.first_name} ${w.last_name}*\n`;
      if (!w.can_view_academic_records) {
        msg += `   _Academic result access disabled by school._\n\n`;
        continue;
      }
      const pub = db
        .prepare(`
          SELECT rp.average_score, rp.overall_grade, rp.class_position, rp.class_size, at.name AS term_name
          FROM result_publications rp
          INNER JOIN academic_terms at ON at.id = rp.academic_term_id
          WHERE rp.student_id = ? AND rp.status = 'published'
          ORDER BY rp.published_at DESC
          LIMIT 1
        `)
        .get(w.id) as
        | {
            average_score: number;
            overall_grade: string;
            class_position: number | null;
            class_size: number;
            term_name: string;
          }
        | undefined;
      if (!pub) {
        msg += `   _No published term results yet._\n\n`;
      } else {
        msg += `   ${pub.term_name}: *${Number(pub.average_score).toFixed(1)}%* (*${pub.overall_grade}*)${pub.class_position ? ` · Pos ${pub.class_position}/${pub.class_size}` : ''}\n\n`;
      }
    }

    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  await sendTelegramMessage(chatId, `📚 Use \`/login\` to access full score entry and broadsheet tools.`, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleFeesAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  const db = getDb();

  if (link.role === 'student' && link.profile_id) {
    const assignments = db
      .prepare(`
        SELECT fs.name AS fee_name, sfa.net_amount, sfa.amount_paid, sfa.balance_due, sfa.status, sfa.due_date
        FROM student_fee_assignments sfa
        INNER JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE sfa.student_id = ?
        ORDER BY sfa.created_at DESC
        LIMIT 8
      `)
      .all(link.profile_id) as Array<{
      fee_name: string;
      net_amount: number;
      amount_paid: number;
      balance_due: number;
      status: string;
      due_date: string | null;
    }>;

    const payments = db
      .prepare(`
        SELECT receipt_number, amount_paid, payment_date, status
        FROM fee_payments
        WHERE student_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `)
      .all(link.profile_id) as Array<{
      receipt_number: string;
      amount_paid: number;
      payment_date: string;
      status: string;
    }>;

    let msg = `💳 *Fee Statement & Receipts*\n\n`;
    if (assignments.length === 0) {
      msg += `• No fee bills currently assigned.\n`;
    } else {
      let totalDue = 0;
      for (const a of assignments) {
        totalDue += Number(a.balance_due || 0);
        msg += `• *${a.fee_name}*: Paid ${a.amount_paid} / ${a.net_amount} | Bal: *${a.balance_due}* (${a.status})\n`;
      }
      msg += `\n*Total Outstanding Balance:* *${totalDue.toLocaleString()}*\n`;
    }

    if (payments.length > 0) {
      msg += `\n*Recent Receipts:*\n`;
      for (const p of payments) {
        msg += `• \`${p.receipt_number}\`: *${p.amount_paid}* on ${p.payment_date} (${p.status})\n`;
      }
    }

    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  if (link.role === 'parent' && link.profile_id) {
    const wards = db
      .prepare(`
        SELECT s.id, s.first_name, s.last_name
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id
        WHERE sg.parent_id = ?
      `)
      .all(link.profile_id) as Array<{ id: string; first_name: string; last_name: string }>;

    let msg = `💳 *Ward Fee Balances*\n\n`;
    if (wards.length === 0) {
      msg += `No wards linked.`;
    } else {
      for (const w of wards) {
        const totals = db
          .prepare(`
            SELECT COALESCE(SUM(net_amount), 0) AS total_net,
                   COALESCE(SUM(amount_paid), 0) AS total_paid,
                   COALESCE(SUM(balance_due), 0) AS total_due
            FROM student_fee_assignments
            WHERE student_id = ?
          `)
          .get(w.id) as { total_net: number; total_paid: number; total_due: number };
        msg += `👤 *${w.first_name} ${w.last_name}*\n   Billed: ${totals.total_net} | Paid: ${totals.total_paid} | Balance: *${totals.total_due}*\n\n`;
      }
    }

    await sendTelegramMessage(chatId, msg, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  await sendTelegramMessage(chatId, `💳 Open the Finance module via \`/login\` to manage school fee invoices.`, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleIdCardAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  const db = getDb();

  if (link.role === 'parent' && link.profile_id) {
    const wards = db
      .prepare(`
        SELECT s.id, s.school_id, s.first_name, s.last_name, s.admission_number
        FROM student_guardians sg
        INNER JOIN students s ON s.id = sg.student_id
        WHERE sg.parent_id = ?
        ORDER BY s.first_name ASC
      `)
      .all(link.profile_id) as Array<{
      id: string;
      school_id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
    }>;

    if (wards.length === 0) {
      await sendTelegramMessage(chatId, `🆔 No wards are linked to your parent profile yet.`, {
        inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
      });
      return;
    }

    if (wards.length === 1) {
      await sendStudentIdCardPhotoById(chatId, wards[0].id, wards[0].school_id, false);
      return;
    }

    const keyboard: TelegramInlineButton[][] = wards.slice(0, 8).map((w) => [
      {
        text: `🆔 ${w.first_name} ${w.last_name} (${w.admission_number})`,
        callback_data: `menu:view_id:${w.id}`,
      },
    ]);
    keyboard.push([{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]);

    await sendTelegramMessage(chatId, `🆔 *Ward Digital ID Cards*\n\nSelect a ward to receive their Digital Student ID Card:`, {
      inlineKeyboard: keyboard,
    });
    return;
  }

  if (link.role !== 'student' || !link.profile_id) {
    await sendTelegramMessage(chatId, `🆔 Digital Student ID cards are issued for enrolled students.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  const card = db
    .prepare(`
      SELECT id, card_number, qr_token_encrypted, status, expires_at
      FROM student_id_cards
      WHERE student_id = ?
      ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC, created_at DESC, rowid DESC
      LIMIT 1
    `)
    .get(link.profile_id) as
    | {
        id: string;
        card_number: string;
        qr_token_encrypted: string;
        status: string;
        expires_at: string;
      }
    | undefined;

  const student = db
    .prepare(`SELECT id, school_id, first_name, last_name, admission_number, photo_file_id FROM students WHERE id = ?`)
    .get(link.profile_id) as
    | {
        id: string;
        school_id: string;
        first_name: string;
        last_name: string;
        admission_number: string;
        photo_file_id: string | null;
      }
    | undefined;

  if (!card || !student) {
    await sendTelegramMessage(chatId, `🆔 No Digital ID Card has been issued for you yet. Please contact your school administrator.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  const secret = getOrCreateIdCardMasterSecret();
  const rawQrToken = decryptIdCardToken(card.qr_token_encrypted, secret);

  const caption =
    `🆔 *Digital Student ID Card*\n\n` +
    `👤 *Name:* ${student.first_name} ${student.last_name}\n` +
    `🎓 *Admission No:* \`${student.admission_number}\`\n` +
    `💳 *Card Serial:* \`${card.card_number}\`\n` +
    `✅ *Status:* ${card.status.toUpperCase()}\n` +
    `📅 *Expires:* \`${card.expires_at.slice(0, 10)}\``;

  if (card.status === 'active') {
    const cardBuffer = await renderStudentIdCardPngBuffer(student.id, student.school_id);
    if (cardBuffer) {
      const sentCard = await sendTelegramPhoto(chatId, cardBuffer, caption, {
        inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
        filename: 'student-id-card.png',
      });
      if (sentCard) return;
    }

    if (rawQrToken) {
      try {
        const pngBuffer = await QRCode.toBuffer(rawQrToken, {
          width: 360,
          margin: 2,
        });
        const sentPhoto = await sendTelegramPhoto(chatId, pngBuffer, caption, {
          inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
          filename: 'student-id-qr.png',
        });
        if (sentPhoto) return;
      } catch {
        // fallback to text message
      }
    }
  }

  await sendTelegramMessage(chatId, caption, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleWardsAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (link.role !== 'parent' || !link.profile_id) {
    await sendTelegramMessage(chatId, `👶 Ward records are available for parent accounts.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  const db = getDb();
  const wards = db
    .prepare(`
      SELECT s.admission_number, s.first_name, s.last_name, s.status, sc.name AS class_name, ca.name AS arm_name, sg.relationship
      FROM student_guardians sg
      INNER JOIN students s ON s.id = sg.student_id
      LEFT JOIN school_classes sc ON sc.id = s.current_class_id
      LEFT JOIN class_arms ca ON ca.id = s.current_arm_id
      WHERE sg.parent_id = ?
    `)
    .all(link.profile_id) as Array<{
    admission_number: string;
    first_name: string;
    last_name: string;
    status: string;
    class_name: string | null;
    arm_name: string | null;
    relationship: string;
  }>;

  if (wards.length === 0) {
    await sendTelegramMessage(chatId, `👶 No wards are linked to your guardian profile yet.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  let msg = `👶 *My Linked Wards (${wards.length})*\n\n`;
  for (const w of wards) {
    const classLabel = w.class_name ? `${w.class_name}${w.arm_name ? ` (${w.arm_name})` : ''}` : 'Unassigned';
    msg += `• *${w.first_name} ${w.last_name}* (${w.relationship})\n  Adm No: \`${w.admission_number}\` · Class: *${classLabel}* · Status: ${w.status}\n\n`;
  }

  await sendTelegramMessage(chatId, msg, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleTeacherClassesAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (link.role !== 'teacher' || !link.profile_id) {
    await sendTelegramMessage(chatId, `🏫 Class & subject assignments are for teacher accounts.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  const db = getDb();
  const classes = db
    .prepare(`
      SELECT sc.name AS class_name, ca.name AS arm_name, cta.role_label
      FROM class_teacher_assignments cta
      INNER JOIN school_classes sc ON sc.id = cta.class_id
      LEFT JOIN class_arms ca ON ca.id = cta.arm_id
      WHERE cta.teacher_id = ? AND cta.is_active = 1
    `)
    .all(link.profile_id) as Array<{ class_name: string; arm_name: string | null; role_label: string }>;

  const subjects = db
    .prepare(`
      SELECT sub.name AS subject_name, sc.name AS class_name
      FROM teacher_subject_assignments tsa
      INNER JOIN subjects sub ON sub.id = tsa.subject_id
      INNER JOIN school_classes sc ON sc.id = tsa.class_id
      WHERE tsa.teacher_id = ? AND tsa.is_active = 1
    `)
    .all(link.profile_id) as Array<{ subject_name: string; class_name: string }>;

  let msg = `🏫 *My Assigned Classes & Subjects*\n\n`;
  msg += `*Form / Class Assignments:*\n`;
  if (classes.length === 0) msg += `• None assigned.\n`;
  for (const c of classes) {
    msg += `• *${c.class_name}${c.arm_name ? ` (${c.arm_name})` : ''}* — ${c.role_label}\n`;
  }
  msg += `\n*Subject Assignments:*\n`;
  if (subjects.length === 0) msg += `• None assigned.\n`;
  for (const s of subjects) {
    msg += `• *${s.subject_name}* (${s.class_name})\n`;
  }

  await sendTelegramMessage(chatId, msg, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleTeacherCheckin(
  chatId: string,
  link: TelegramLinkRow,
  rawQrText: string,
): Promise<void> {
  if (link.role !== 'teacher' && link.role !== 'school_admin') {
    await sendTelegramMessage(chatId, `⛔ Only teachers or school admins can mark student ID card attendance.`);
    return;
  }
  if (!link.school_id) return;

  const qrToken = extractIdCardTokenFromScan(rawQrText);
  if (!qrToken) {
    await sendTelegramMessage(chatId, `⚠️ Invalid Digital ID QR token. Send \`/checkin DTID-...\`.`);
    return;
  }

  const db = getDb();
  const card = db
    .prepare(`
      SELECT id, school_id, student_id, status, expires_at, revoked_at
      FROM student_id_cards
      WHERE qr_token_hash = ? AND school_id = ?
      LIMIT 1
    `)
    .get(sha256Hex(qrToken), link.school_id) as
    | {
        id: string;
        school_id: string;
        student_id: string;
        status: string;
        expires_at: string;
        revoked_at: string | null;
      }
    | undefined;

  if (!card) {
    await sendTelegramMessage(chatId, `❌ Digital ID Card not found for your school.`);
    return;
  }

  const validity = evaluateIdCardValidity(card);
  if (!validity.valid) {
    await sendTelegramMessage(chatId, `❌ ${validity.reason}`);
    return;
  }

  const student = db
    .prepare(`SELECT id, first_name, last_name, admission_number, current_class_id, current_arm_id FROM students WHERE id = ? AND school_id = ?`)
    .get(card.student_id, link.school_id) as
    | {
        id: string;
        first_name: string;
        last_name: string;
        admission_number: string;
        current_class_id: string | null;
        current_arm_id: string | null;
      }
    | undefined;

  if (!student || !student.current_class_id) {
    await sendTelegramMessage(chatId, `⚠️ Student is not enrolled in an active class.`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const armScopeKey = student.current_arm_id ?? '__ALL__';

  let session = db
    .prepare(`
      SELECT id FROM attendance_sessions
      WHERE school_id = ? AND class_id = ? AND arm_scope_key = ? AND attendance_date = ? AND session_label = 'Morning Roll Call'
      LIMIT 1
    `)
    .get(link.school_id, student.current_class_id, armScopeKey, today) as { id: string } | undefined;

  if (!session) {
    const newSessionId = `attses_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO attendance_sessions (
        id, school_id, class_id, arm_id, arm_scope_key, attendance_date, session_label, marked_by_user_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'Morning Roll Call', ?, 'open')
    `).run(newSessionId, link.school_id, student.current_class_id, student.current_arm_id, armScopeKey, today, link.user_id);
    session = { id: newSessionId };
  }

  db.prepare(`
    INSERT INTO attendance_records (
      id, school_id, attendance_session_id, student_id, class_id, arm_id, attendance_date, status, remarks, source, marked_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'present', 'Telegram Bot ID Card Check-in', 'qr', ?)
    ON CONFLICT(attendance_session_id, student_id) DO UPDATE SET
      status = 'present',
      remarks = 'Telegram Bot ID Card Check-in',
      source = 'qr',
      marked_by_user_id = excluded.marked_by_user_id,
      updated_at = datetime('now')
  `).run(
    `attrec_${crypto.randomUUID()}`,
    link.school_id,
    session.id,
    student.id,
    student.current_class_id,
    student.current_arm_id,
    today,
    link.user_id,
  );

  db.prepare(`UPDATE student_id_cards SET last_used_attendance_at = datetime('now') WHERE id = ?`).run(card.id);

  await sendTelegramMessage(
    chatId,
    `✅ *Attendance Marked Present*\n\nStudent: *${student.first_name} ${student.last_name}* (\`${student.admission_number}\`)\nDate: \`${today}\`\nSource: Digital ID QR via Telegram`,
    { inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]] },
  );
}

async function handleOverviewAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  const db = getDb();

  if (link.auth_environment === 'workers') {
    const schools = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
        FROM schools
      `)
      .get() as { total: number; active: number | null; pending: number | null; suspended: number | null };
    const usersCount = (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c;
    const linksCount = (db.prepare(`SELECT COUNT(*) AS c FROM telegram_links`).get() as { c: number }).c;

    await sendTelegramMessage(
      chatId,
      `🌐 *Platform Executive Overview*\n\n` +
        `🏫 *Schools:* ${schools.total} total (${schools.active || 0} active, ${schools.pending || 0} pending, ${schools.suspended || 0} suspended)\n` +
        `👥 *Total Users:* ${usersCount}\n` +
        `🤖 *Telegram Linked Users:* ${linksCount}`,
      { inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]] },
    );
    return;
  }

  if (link.role === 'school_admin' && link.school_id) {
    const stuCount = (db.prepare(`SELECT COUNT(*) AS c FROM students WHERE school_id = ?`).get(link.school_id) as { c: number }).c;
    const tchCount = (db.prepare(`SELECT COUNT(*) AS c FROM teachers WHERE school_id = ?`).get(link.school_id) as { c: number }).c;
    const clsCount = (db.prepare(`SELECT COUNT(*) AS c FROM school_classes WHERE school_id = ?`).get(link.school_id) as { c: number }).c;
    const admCount = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM admission_applications WHERE school_id = ? AND status = 'pending'`)
        .get(link.school_id) as { c: number }
    ).c;

    await sendTelegramMessage(
      chatId,
      `📈 *School Snapshot — ${link.school_name}*\n\n` +
        `🎓 *Students:* ${stuCount}\n` +
        `👨‍🏫 *Teachers:* ${tchCount}\n` +
        `🏫 *Classes:* ${clsCount}\n` +
        `📝 *Pending Admissions:* ${admCount}`,
      { inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]] },
    );
    return;
  }

  await sendRoleDashboardWelcome(chatId, link);
}

async function handleAdminAdmissionsAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (link.role !== 'school_admin' || !link.school_id) {
    await sendTelegramMessage(chatId, `⛔ School Administrator role required.`);
    return;
  }
  const db = getDb();
  const apps = db
    .prepare(`
      SELECT application_reference, applicant_first_name, applicant_last_name, status
      FROM admission_applications
      WHERE school_id = ? AND status IN ('pending', 'under_review')
      ORDER BY created_at DESC
      LIMIT 8
    `)
    .all(link.school_id) as Array<{
    application_reference: string;
    applicant_first_name: string;
    applicant_last_name: string;
    status: string;
  }>;

  let msg = `📝 *Pending Admission Applications (${apps.length})*\n\n`;
  if (apps.length === 0) {
    msg += `No pending admission applications right now.`;
  } else {
    for (const a of apps) {
      msg += `• \`${a.application_reference}\`: *${a.applicant_first_name} ${a.applicant_last_name}* (${a.status})\n`;
    }
  }
  await sendTelegramMessage(chatId, msg, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleAdminFinanceAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (link.role !== 'school_admin' || !link.school_id) {
    await sendTelegramMessage(chatId, `⛔ School Administrator role required.`);
    return;
  }
  const db = getDb();
  const summary = db
    .prepare(`
      SELECT COALESCE(SUM(net_amount), 0) AS total_billed,
             COALESCE(SUM(amount_paid), 0) AS total_paid,
             COALESCE(SUM(balance_due), 0) AS total_due
      FROM student_fee_assignments
      WHERE school_id = ?
    `)
    .get(link.school_id) as { total_billed: number; total_paid: number; total_due: number };

  await sendTelegramMessage(
    chatId,
    `💳 *School Finance Summary*\n\n` +
      `• *Total Billed:* ${Number(summary.total_billed).toLocaleString()}\n` +
      `• *Total Collected:* ${Number(summary.total_paid).toLocaleString()}\n` +
      `• *Outstanding Balance:* ${Number(summary.total_due).toLocaleString()}`,
    { inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]] },
  );
}

async function handleOwnerSchoolsAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (link.auth_environment !== 'workers') {
    await sendTelegramMessage(chatId, `⛔ Platform workforce access required.`);
    return;
  }
  const db = getDb();
  const schools = db
    .prepare(`SELECT name, code, status, city, country FROM schools ORDER BY created_at DESC LIMIT 10`)
    .all() as Array<{ name: string; code: string; status: string; city: string; country: string }>;

  let msg = `🏫 *Recent School Tenants (${schools.length})*\n\n`;
  for (const s of schools) {
    msg += `• *${s.name}* (\`${s.code}\`) — *${s.status}*\n  ${s.city}, ${s.country}\n`;
  }
  await sendTelegramMessage(chatId, msg, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

async function handleNoticesAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  const db = getDb();
  const rows = link.school_id
    ? (db
        .prepare(`
          SELECT title, body, created_at
          FROM notifications
          WHERE (school_id = ? OR scope = 'global')
            AND (target_user_id IS NULL OR target_user_id = ?)
          ORDER BY created_at DESC
          LIMIT 5
        `)
        .all(link.school_id, link.user_id) as Array<{ title: string; body: string; created_at: string }>)
    : (db
        .prepare(`SELECT title, body, created_at FROM notifications ORDER BY created_at DESC LIMIT 5`)
        .all() as Array<{ title: string; body: string; created_at: string }>);

  let msg = `🔔 *Latest Notifications*\n\n`;
  if (rows.length === 0) {
    msg += `No recent notifications.`;
  } else {
    for (const n of rows) {
      msg += `📌 *${n.title}*\n${n.body.slice(0, 140)}\n\n`;
    }
  }

  await sendTelegramMessage(chatId, msg, {
    inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
  });
}

function canManageSchoolMembers(link: TelegramLinkRow): boolean {
  return (
    link.role === 'school_admin' ||
    link.role === 'platform_owner' ||
    link.role === 'workforce_admin'
  );
}

function resolveTargetSchool(link: TelegramLinkRow): { id: string; name: string; slug: string; code: string } | null {
  const db = getDb();
  if (link.school_id) {
    const s = db
      .prepare('SELECT id, name, slug, code FROM schools WHERE id = ?')
      .get(link.school_id) as { id: string; name: string; slug: string; code: string } | undefined;
    if (s) return s;
  }
  if (link.role === 'platform_owner' || link.role === 'workforce_admin') {
    const s = db
      .prepare("SELECT id, name, slug, code FROM schools WHERE status != 'suspended' ORDER BY created_at ASC LIMIT 1")
      .get() as { id: string; name: string; slug: string; code: string } | undefined;
    if (s) return s;
  }
  return null;
}

function allocateStaffIdNumber(schoolId: string): string {
  const db = getDb();
  const prefix = 'TCH-';
  const rows = db
    .prepare('SELECT staff_id_number FROM teachers WHERE school_id = ? AND staff_id_number LIKE ?')
    .all(schoolId, `${prefix}%`) as Array<{ staff_id_number: string }>;
  let maxSeq = 0;
  for (const r of rows) {
    const num = parseInt(r.staff_id_number.replace(/\D/g, ''), 10);
    if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
  }
  return `TCH-${String(maxSeq + 1).padStart(4, '0')}`;
}

function generateSafeEmail(firstName: string, lastName: string, schoolSlug: string, prefix = 'stu'): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand = crypto.randomBytes(2).toString('hex');
  const safeDomain = schoolSlug.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'school';
  return `${cleanFirst || prefix}.${cleanLast || 'user'}.${rand}@${safeDomain}.edu`;
}

function generateSafePassword(role = 'Student'): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(1000, 9999);
  return `${role}#${year}${rand}`;
}

async function startStudentRegistration(
  chatId: string,
  link: TelegramLinkRow,
  prefillName?: string,
): Promise<void> {
  if (!canManageSchoolMembers(link)) {
    await sendTelegramMessage(
      chatId,
      `⚠️ *Permission Denied*: Only School Administrators can register students.`,
      { inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]] },
    );
    return;
  }
  const school = resolveTargetSchool(link);
  if (!school) {
    await sendTelegramMessage(chatId, `⚠️ No active school tenant found to register students.`);
    return;
  }

  if (prefillName?.trim()) {
    await promptStudentClassSelection(chatId, link, school, prefillName.trim());
    return;
  }

  setChatState(chatId, 'reg_stu_name', {
    schoolId: school.id,
    schoolName: school.name,
    schoolSlug: school.slug,
    actorUserId: link.user_id,
  });
  await sendTelegramMessage(
    chatId,
    `🎓 *Register New Student — ${school.name}* (Step 1/5)\n\n` +
      `Please enter the student's *Full Name* (e.g. \`Adaeze Chidinma Okafor\` or \`John Doe\`):\n` +
      `_(Reply with /cancel at any time to abort.)_`,
  );
}

async function promptStudentClassSelection(
  chatId: string,
  link: TelegramLinkRow,
  school: { id: string; name: string; slug: string; code: string },
  fullName: string,
): Promise<void> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Student';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : null;

  const db = getDb();
  const classes = db
    .prepare("SELECT id, name FROM school_classes WHERE school_id = ? AND status = 'active' ORDER BY name ASC")
    .all(school.id) as Array<{ id: string; name: string }>;

  const payloadBase = {
    schoolId: school.id,
    schoolName: school.name,
    schoolSlug: school.slug,
    actorUserId: link.user_id,
    fullName,
    firstName,
    middleName,
    lastName,
  };

  if (classes.length === 0) {
    setChatState(chatId, 'reg_stu_gender', {
      ...payloadBase,
      classId: null,
      className: 'Unassigned',
      armId: null,
    });
    await promptStudentGenderSelection(chatId, fullName);
    return;
  }

  setChatState(chatId, 'reg_stu_class', payloadBase);

  const keyboard: TelegramInlineButton[][] = [];
  let currentRow: TelegramInlineButton[] = [];
  for (const c of classes) {
    currentRow.push({ text: `🏫 ${c.name}`, callback_data: `reg_stu_cls:${c.id}` });
    if (currentRow.length === 2) {
      keyboard.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) {
    keyboard.push(currentRow);
  }
  keyboard.push([{ text: '🚫 Skip / Assign Class Later', callback_data: 'reg_stu_cls:skip' }]);
  keyboard.push([{ text: '❌ Cancel Registration', callback_data: 'reg_action:cancel' }]);

  await sendTelegramMessage(
    chatId,
    `🎓 *Register Student: ${fullName}* (Step 2/5)\n\n` +
      `Select the assigned class level for this student:`,
    { inlineKeyboard: keyboard },
  );
}

async function promptStudentGenderSelection(chatId: string, fullName: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `🎓 *Register Student: ${fullName}* (Step 3/5)\n\nSelect the student's *gender*:`,
    {
      inlineKeyboard: [
        [
          { text: '👦 Male', callback_data: 'reg_stu_gen:male' },
          { text: '👧 Female', callback_data: 'reg_stu_gen:female' },
        ],
        [{ text: '⚧ Other / Unspecified', callback_data: 'reg_stu_gen:other' }],
        [{ text: '❌ Cancel Registration', callback_data: 'reg_action:cancel' }],
      ],
    },
  );
}

async function promptStudentAccountSelection(chatId: string, fullName: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `🔐 *Portal Account & Credentials* (Step 4/5)\n\n` +
      `Would you like to provision an active web portal account for *${fullName}*?\n` +
      `Students use their credentials to check term results, CBT tests, and timetable.`,
    {
      inlineKeyboard: [
        [{ text: '⚡ Auto-Generate Email & Password', callback_data: 'reg_stu_acc:auto' }],
        [{ text: '✉️ Enter Custom Email', callback_data: 'reg_stu_acc:custom' }],
        [{ text: '🚫 No Portal Account (Record Only)', callback_data: 'reg_stu_acc:none' }],
        [{ text: '❌ Cancel Registration', callback_data: 'reg_action:cancel' }],
      ],
    },
  );
}

async function promptStudentPhotoUpload(chatId: string, fullName: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `📷 *Student Passport / Profile Photo* (Step 5/5)\n\n` +
      `📸 *Please send or upload the passport photo for ${fullName} now!*\n` +
      `You can take a photo with your mobile camera or attach an image file.\n\n` +
      `Or tap *Skip Photo* below to finalize registration immediately without a passport image.`,
    {
      inlineKeyboard: [
        [{ text: '⏭️ Skip Photo & Finalize', callback_data: 'reg_stu_photo:skip' }],
        [{ text: '❌ Cancel Registration', callback_data: 'reg_action:cancel' }],
      ],
    },
  );
}

async function executeStudentRegistration(
  chatId: string,
  link: TelegramLinkRow,
  payload: Record<string, unknown>,
  photoDownload?: { buffer: Buffer; mimeType: string; originalName: string } | null,
): Promise<void> {
  const db = getDb();
  const schoolId = String(payload.schoolId || link.school_id || '');
  if (!schoolId) {
    await sendTelegramMessage(chatId, `❌ Missing school tenant context.`);
    clearChatState(chatId);
    return;
  }

  const fullName = String(payload.fullName || 'Student');
  const firstName = String(payload.firstName || 'Student');
  const middleName = payload.middleName ? String(payload.middleName) : null;
  const lastName = String(payload.lastName || 'Student');
  const gender = String(payload.gender || 'other');
  const classId = payload.classId ? String(payload.classId) : null;
  const armId = payload.armId ? String(payload.armId) : null;
  const className = String(payload.className || (classId ? 'Assigned' : 'Unassigned'));
  const createLogin = Boolean(payload.createLogin);
  const studentEmail = payload.studentEmail ? String(payload.studentEmail).toLowerCase().trim() : '';
  const tempPassword = payload.tempPassword ? String(payload.tempPassword) : '';

  const studentId = `stu_${crypto.randomUUID()}`;
  const todayIso = new Date().toISOString().slice(0, 10);

  let photoFileId: string | null = null;
  if (photoDownload && photoDownload.buffer.length > 0) {
    try {
      const stored = saveValidatedFile({
        schoolId,
        uploadedByUserId: link.user_id,
        category: 'student_profile_picture',
        originalName: photoDownload.originalName || `${firstName}_${lastName}_passport.jpg`,
        claimedMimeType: photoDownload.mimeType || 'image/jpeg',
        contentBase64: photoDownload.buffer.toString('base64'),
        visibility: 'private_tenant',
      });
      photoFileId = stored.id;
    } catch (err) {
      console.warn('[TelegramBot] Passport photo validation warning:', err);
    }
  }

  let assignedAdmissionNumber = '';
  let linkedUserId: string | null = null;

  db.exec('BEGIN IMMEDIATE');
  try {
    assignedAdmissionNumber = allocateUniqueAdmissionNumber(schoolId, todayIso);

    if (createLogin && studentEmail && tempPassword) {
      linkedUserId = `usr_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
        VALUES (?, ?, ?, ?, 'school_member', 1)
      `).run(linkedUserId, studentEmail, fullName, hashPassword(tempPassword));

      db.prepare(`
        INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
        VALUES (?, ?, ?, 'role_student', ?, 'active')
      `).run(`mem_${crypto.randomUUID()}`, schoolId, linkedUserId, assignedAdmissionNumber);
    }

    const middleNameStr = middleName || '';
    const rawGender = String(payload.gender || 'other').toLowerCase();
    const formattedGender = rawGender === 'female' ? 'Female' : rawGender === 'male' ? 'Male' : 'Other';
    const defaultDob = String(payload.dateOfBirth || '2012-01-01');

    db.prepare(`
      INSERT INTO students (
        id, school_id, user_id, admission_number, admission_date,
        first_name, middle_name, last_name, date_of_birth, gender, student_email,
        current_class_id, current_arm_id, photo_file_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      studentId,
      schoolId,
      linkedUserId,
      assignedAdmissionNumber,
      todayIso,
      firstName,
      middleNameStr,
      lastName,
      defaultDob,
      formattedGender,
      studentEmail,
      classId,
      armId,
      photoFileId,
    );

    const currentSession = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(schoolId) as { id: string } | undefined;

    if (classId) {
      db.prepare(`
        INSERT INTO class_enrollments (id, school_id, student_id, class_id, arm_id, academic_session_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(`enr_${crypto.randomUUID()}`, schoolId, studentId, classId, armId, currentSession?.id ?? null);

      db.prepare(`
        INSERT INTO student_class_history (
          id, school_id, student_id, academic_session_id,
          from_class_id, from_arm_id, to_class_id, to_arm_id,
          action_type, effective_date, notes, recorded_by_user_id
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'initial_placement', ?, 'Registered via Telegram Bot', ?)
      `).run(
        `sch_${crypto.randomUUID()}`,
        schoolId,
        studentId,
        currentSession?.id ?? null,
        classId,
        armId,
        todayIso,
        link.user_id,
      );
    }

    const idCard = issueDigitalIdCard({
      schoolId,
      studentId,
      actorUserId: link.user_id,
    });

    db.exec('COMMIT');

    recordAuditLog({
      actorUserId: link.user_id,
      actorEmail: link.user_email || 'telegram_user',
      actorRole: link.role,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student.created',
      resourceType: 'student',
      resourceId: studentId,
      outcome: 'success',
      metadata: {
        admissionNumber: assignedAdmissionNumber,
        source: 'telegram_bot',
        hasPhoto: Boolean(photoFileId),
        hasLogin: Boolean(linkedUserId),
      },
    });

    clearChatState(chatId);

    const photoStatus = photoFileId ? '✅ Uploaded & Verified' : 'None (send /uploadphoto anytime)';
    const loginText =
      createLogin && studentEmail
        ? `📧 *Portal Login:* \`${studentEmail}\`\n🔑 *Temporary Password:* \`${tempPassword}\`\n`
        : `📧 *Portal Login:* None provisioned\n`;

    const caption =
      `🎉 *Student Successfully Registered & Provisioned!*\n\n` +
      `👤 *Student:* *${fullName}*\n` +
      `🎓 *Admission No:* \`${assignedAdmissionNumber}\`\n` +
      `🏫 *Class:* ${className}\n` +
      `⚧ *Gender:* ${gender.toUpperCase()}\n` +
      `🆔 *Digital ID Card:* \`${idCard.cardNumber}\`\n` +
      `${loginText}` +
      `📸 *Passport Photo:* ${photoStatus}\n\n` +
      `The Digital ID QR Pass below is active immediately for QR check-ins and 1-click portal sign in.`;

    const inlineKeyboard: TelegramInlineButton[][] = [
      [{ text: '🆔 View Digital ID Card', callback_data: `menu:view_id:${studentId}` }],
      [
        { text: '➕ Register Another Student', callback_data: 'menu:reg_student' },
        { text: '🎓 All Students', callback_data: 'menu:students' },
      ],
      [{ text: '⬅️ Admin Menu', callback_data: 'menu:home' }],
    ];

    try {
      const cardBuffer = await renderStudentIdCardPngBuffer(studentId, schoolId);
      if (cardBuffer) {
        await sendTelegramPhoto(chatId, cardBuffer, caption, {
          inlineKeyboard,
          filename: 'student-id-card.png',
        });
      } else {
        const qrPngBuffer = await QRCode.toBuffer(idCard.rawQrToken, { width: 360, margin: 2 });
        await sendTelegramPhoto(chatId, qrPngBuffer, caption, {
          inlineKeyboard,
          filename: 'student-id-qr.png',
        });
      }
    } catch {
      await sendTelegramMessage(chatId, caption, { inlineKeyboard });
    }
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[TelegramBot] Failed to execute student registration:', err);
    clearChatState(chatId);
    await sendTelegramMessage(chatId, `❌ Failed to register student. Please check school settings and retry.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
  }
}

async function startTeacherRegistration(
  chatId: string,
  link: TelegramLinkRow,
  prefillName?: string,
): Promise<void> {
  if (!canManageSchoolMembers(link)) {
    await sendTelegramMessage(chatId, `⚠️ Only School Administrators can register teachers.`);
    return;
  }
  const school = resolveTargetSchool(link);
  if (!school) {
    await sendTelegramMessage(chatId, `⚠️ No active school tenant found.`);
    return;
  }

  const payloadBase = {
    schoolId: school.id,
    schoolName: school.name,
    schoolSlug: school.slug,
    actorUserId: link.user_id,
  };

  if (prefillName?.trim()) {
    const fullName = prefillName.trim();
    setChatState(chatId, 'reg_tch_spec', { ...payloadBase, fullName });
    await promptTeacherSpecialization(chatId, fullName);
    return;
  }

  setChatState(chatId, 'reg_tch_name', payloadBase);
  await sendTelegramMessage(
    chatId,
    `👨‍🏫 *Register New Faculty Teacher* (Step 1/4)\n\n` +
      `Enter the teacher's *Full Name* (e.g. \`Mr. Babatunde Fashola\` or \`Dr. Grace Adeyemi\`):\n` +
      `_(Reply with /cancel at any time to abort.)_`,
  );
}

async function promptTeacherSpecialization(chatId: string, fullName: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `👨‍🏫 *Register Teacher: ${fullName}* (Step 2/4)\n\n` +
      `Enter their *Subject Specialization* or *Academic Role* (e.g. \`Mathematics Lead\` or \`Physics Teacher\`):`,
  );
}

async function promptTeacherAccountSelection(chatId: string, fullName: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `🔐 *Teacher Portal Credentials* (Step 3/4)\n\n` +
      `Configure portal login access for *${fullName}*:`,
    {
      inlineKeyboard: [
        [{ text: '⚡ Auto-Generate Staff ID, Email & Password', callback_data: 'reg_tch_acc:auto' }],
        [{ text: '✉️ Enter Custom Email', callback_data: 'reg_tch_acc:custom' }],
        [{ text: '❌ Cancel Registration', callback_data: 'reg_action:cancel' }],
      ],
    },
  );
}

async function promptTeacherPhotoUpload(chatId: string, fullName: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `📷 *Teacher Profile Photo* (Step 4/4)\n\n` +
      `📸 *Please send or upload a profile photo for ${fullName} now!*\n\n` +
      `Or tap *Skip Photo* below to finalize registration immediately.`,
    {
      inlineKeyboard: [
        [{ text: '⏭️ Skip Photo & Finalize', callback_data: 'reg_tch_photo:skip' }],
        [{ text: '❌ Cancel Registration', callback_data: 'reg_action:cancel' }],
      ],
    },
  );
}

async function executeTeacherRegistration(
  chatId: string,
  link: TelegramLinkRow,
  payload: Record<string, unknown>,
  photoDownload?: { buffer: Buffer; mimeType: string; originalName: string } | null,
): Promise<void> {
  const db = getDb();
  const schoolId = String(payload.schoolId || link.school_id || '');
  const fullName = String(payload.fullName || 'Teacher');
  const specialization = String(payload.specialization || 'Faculty Teacher');
  const staffIdNumber = String(payload.staffIdNumber || allocateStaffIdNumber(schoolId));
  const email = String(
    payload.email ||
      generateSafeEmail(
        fullName.split(' ')[0] || 'Teacher',
        fullName.split(' ').pop() || 'Faculty',
        String(payload.schoolSlug || 'school'),
        'tch',
      ),
  );
  const tempPassword = String(payload.tempPassword || generateSafePassword('Teach'));

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Teacher';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : null;

  let photoFileId: string | null = null;
  if (photoDownload && photoDownload.buffer.length > 0) {
    try {
      const stored = saveValidatedFile({
        schoolId,
        uploadedByUserId: link.user_id,
        category: 'teacher_profile_picture',
        originalName: photoDownload.originalName || `${staffIdNumber}_passport.jpg`,
        claimedMimeType: photoDownload.mimeType || 'image/jpeg',
        contentBase64: photoDownload.buffer.toString('base64'),
        visibility: 'private_tenant',
      });
      photoFileId = stored.id;
    } catch (err) {
      console.warn('[TelegramBot] Teacher photo validation warning:', err);
    }
  }

  const teacherId = `tch_${crypto.randomUUID()}`;
  const userId = `usr_${crypto.randomUUID()}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
      VALUES (?, ?, ?, ?, 'school_member', 1)
    `).run(userId, email.toLowerCase(), fullName, hashPassword(tempPassword));

    db.prepare(`
      INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
      VALUES (?, ?, ?, 'role_teacher', ?, 'active')
    `).run(`mem_${crypto.randomUUID()}`, schoolId, userId, specialization);

    const middleNameStr = middleName || '';
    const todayIso = new Date().toISOString().slice(0, 10);
    const teacherGender = 'Other';

    db.prepare(`
      INSERT INTO teachers (
        id, school_id, user_id, staff_id_number, first_name, middle_name, last_name,
        gender, employment_date, email, specialization, photo_file_id, employment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      teacherId,
      schoolId,
      userId,
      staffIdNumber,
      firstName,
      middleNameStr,
      lastName,
      teacherGender,
      todayIso,
      email.toLowerCase(),
      specialization,
      photoFileId,
    );

    db.exec('COMMIT');

    recordAuditLog({
      actorUserId: link.user_id,
      actorEmail: link.user_email || 'telegram_user',
      actorRole: link.role,
      schoolId,
      authEnvironment: 'school',
      action: 'school.teacher.created',
      resourceType: 'teacher',
      resourceId: teacherId,
      outcome: 'success',
      metadata: { staffIdNumber, source: 'telegram_bot' },
    });

    clearChatState(chatId);

    const photoStatus = photoFileId ? '✅ Uploaded & Verified' : 'None (can upload anytime)';

    await sendTelegramMessage(
      chatId,
      `🎉 *Faculty Teacher Registered & Provisioned!*\n\n` +
        `👤 *Teacher:* *${fullName}*\n` +
        `🆔 *Staff ID:* \`${staffIdNumber}\`\n` +
        `📚 *Specialization:* ${specialization}\n` +
        `📧 *Portal Email:* \`${email}\`\n` +
        `🔑 *Temporary Password:* \`${tempPassword}\`\n` +
        `📸 *Staff Photo:* ${photoStatus}\n\n` +
        `The teacher can log in immediately at the School Portal or link their account on Telegram.`,
      {
        inlineKeyboard: [
          [
            { text: '➕ Register Another Teacher', callback_data: 'menu:reg_teacher' },
            { text: '👨‍🏫 All Teachers', callback_data: 'menu:teachers' },
          ],
          [{ text: '⬅️ Admin Menu', callback_data: 'menu:home' }],
        ],
      },
    );
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[TelegramBot] Failed to execute teacher registration:', err);
    clearChatState(chatId);
    await sendTelegramMessage(chatId, `❌ Failed to register teacher. Please verify details and retry.`);
  }
}

async function startParentRegistration(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (!canManageSchoolMembers(link)) {
    await sendTelegramMessage(chatId, `⚠️ Only School Administrators can register parents.`);
    return;
  }
  const school = resolveTargetSchool(link);
  if (!school) {
    await sendTelegramMessage(chatId, `⚠️ No active school tenant found.`);
    return;
  }
  setChatState(chatId, 'reg_par_name', {
    schoolId: school.id,
    schoolSlug: school.slug,
    actorUserId: link.user_id,
  });
  await sendTelegramMessage(
    chatId,
    `👪 *Register New Parent / Guardian* (Step 1/3)\n\n` +
      `Enter the parent's *Full Name* (e.g. \`Mrs. Folake Bello\` or \`Dr. Charles Obi\`):\n` +
      `_(Reply with /cancel at any time to abort.)_`,
  );
}

async function executeParentRegistration(
  chatId: string,
  link: TelegramLinkRow,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const schoolId = String(payload.schoolId || link.school_id || '');
  const fullName = String(payload.fullName || 'Parent');
  const email = String(
    payload.email ||
      generateSafeEmail(
        fullName.split(' ')[0] || 'Parent',
        fullName.split(' ').pop() || 'Guardian',
        String(payload.schoolSlug || 'school'),
        'par',
      ),
  );
  const phone = String(payload.phone || '');
  const tempPassword = String(payload.tempPassword || generateSafePassword('Parent'));
  const wardAdmissionNumber = payload.wardAdmissionNumber ? String(payload.wardAdmissionNumber).trim() : '';

  const parentId = `par_${crypto.randomUUID()}`;
  const userId = `usr_${crypto.randomUUID()}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
      VALUES (?, ?, ?, ?, 'school_member', 1)
    `).run(userId, email.toLowerCase(), fullName, hashPassword(tempPassword));

    db.prepare(`
      INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
      VALUES (?, ?, ?, 'role_parent', 'Guardian', 'active')
    `).run(`mem_${crypto.randomUUID()}`, schoolId, userId);

    db.prepare(`
      INSERT INTO parents (id, school_id, user_id, full_name, email, phone, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(parentId, schoolId, userId, fullName, email.toLowerCase(), phone);

    let linkedWardName: string | null = null;
    if (wardAdmissionNumber) {
      const student = db
        .prepare('SELECT id, first_name, last_name FROM students WHERE school_id = ? AND UPPER(admission_number) = UPPER(?)')
        .get(schoolId, wardAdmissionNumber) as { id: string; first_name: string; last_name: string } | undefined;

      if (student) {
        db.prepare(`
          INSERT INTO student_guardians (id, school_id, student_id, parent_id, relationship, is_primary_guardian)
          VALUES (?, ?, ?, ?, 'Guardian', 1)
        `).run(`grd_${crypto.randomUUID()}`, schoolId, student.id, parentId);
        linkedWardName = `${student.first_name} ${student.last_name}`;
      }
    }

    db.exec('COMMIT');

    clearChatState(chatId);

    const wardText = linkedWardName
      ? `👶 *Linked Ward:* ${linkedWardName} (\`${wardAdmissionNumber}\`)\n`
      : `👶 *Linked Ward:* None (can link in portal)\n`;

    await sendTelegramMessage(
      chatId,
      `🎉 *Parent / Guardian Registered Successfully!*\n\n` +
        `👤 *Parent:* *${fullName}*\n` +
        `📧 *Portal Email:* \`${email}\`\n` +
        `🔑 *Temporary Password:* \`${tempPassword}\`\n` +
        `${phone ? `📞 *Phone:* \`${phone}\`\n` : ''}` +
        `${wardText}\n` +
        `The parent can log in immediately to monitor attendance, fees, and published terminal results.`,
      {
        inlineKeyboard: [
          [{ text: '➕ Register Another Parent', callback_data: 'menu:reg_parent' }],
          [{ text: '⬅️ Admin Menu', callback_data: 'menu:home' }],
        ],
      },
    );
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[TelegramBot] Failed to execute parent registration:', err);
    clearChatState(chatId);
    await sendTelegramMessage(chatId, `❌ Failed to register parent. Please verify and retry.`);
  }
}

async function startPhotoUploadWizard(
  chatId: string,
  link: TelegramLinkRow,
  identifier?: string,
): Promise<void> {
  if (!canManageSchoolMembers(link)) {
    await sendTelegramMessage(chatId, `⚠️ Only School Administrators can upload member photos.`);
    return;
  }
  const school = resolveTargetSchool(link);
  if (!school) {
    await sendTelegramMessage(chatId, `⚠️ No active school tenant found.`);
    return;
  }

  const db = getDb();
  if (identifier?.trim()) {
    const query = identifier.trim();
    const student = db
      .prepare(`
        SELECT id, first_name, last_name, admission_number
        FROM students
        WHERE school_id = ?
          AND (UPPER(admission_number) = UPPER(?) OR LOWER(first_name || ' ' || last_name) LIKE LOWER(?))
        LIMIT 1
      `)
      .get(school.id, query, `%${query}%`) as
      | { id: string; first_name: string; last_name: string; admission_number: string }
      | undefined;

    if (student) {
      setChatState(chatId, 'upload_target_photo', {
        schoolId: school.id,
        targetType: 'student',
        targetId: student.id,
        targetName: `${student.first_name} ${student.last_name}`,
        targetCode: student.admission_number,
      });
      await sendTelegramMessage(
        chatId,
        `📸 *Found Student:* *${student.first_name} ${student.last_name}* (\`${student.admission_number}\`)\n\n` +
          `Please *send or upload their new passport photo* now:\n_(Send /cancel to abort)_`,
      );
      return;
    }

    const teacher = db
      .prepare(`
        SELECT id, first_name, last_name, staff_id_number
        FROM teachers
        WHERE school_id = ?
          AND (UPPER(staff_id_number) = UPPER(?) OR LOWER(first_name || ' ' || last_name) LIKE LOWER(?))
        LIMIT 1
      `)
      .get(school.id, query, `%${query}%`) as
      | { id: string; first_name: string; last_name: string; staff_id_number: string }
      | undefined;

    if (teacher) {
      setChatState(chatId, 'upload_target_photo', {
        schoolId: school.id,
        targetType: 'teacher',
        targetId: teacher.id,
        targetName: `${teacher.first_name} ${teacher.last_name}`,
        targetCode: teacher.staff_id_number,
      });
      await sendTelegramMessage(
        chatId,
        `📸 *Found Teacher:* *${teacher.first_name} ${teacher.last_name}* (\`${teacher.staff_id_number}\`)\n\n` +
          `Please *send or upload their new profile photo* now:\n_(Send /cancel to abort)_`,
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      `❌ No student or teacher found matching \`${query}\`. Please verify the admission number or staff ID.`,
    );
    return;
  }

  setChatState(chatId, 'upload_photo_search', { schoolId: school.id });
  await sendTelegramMessage(
    chatId,
    `📸 *Upload Passport / Profile Photo*\n\n` +
      `Please reply with the student's *Admission Number* (e.g. \`DT-AF038E-2026-0001\`) or teacher's *Staff ID* (e.g. \`TCH-0001\`):\n` +
      `_(Send /cancel at any time to abort)_`,
  );
}

async function executePhotoUpload(
  chatId: string,
  link: TelegramLinkRow,
  targetType: 'student' | 'teacher',
  targetId: string,
  targetName: string,
  photoDownload: { buffer: Buffer; mimeType: string; originalName: string },
): Promise<void> {
  const db = getDb();
  const schoolId = String(link.school_id || '');
  try {
    const category = targetType === 'student' ? 'student_profile_picture' : 'teacher_profile_picture';
    const stored = saveValidatedFile({
      schoolId: schoolId || null,
      uploadedByUserId: link.user_id,
      category,
      originalName: photoDownload.originalName || `${targetType}_passport.jpg`,
      claimedMimeType: photoDownload.mimeType || 'image/jpeg',
      contentBase64: photoDownload.buffer.toString('base64'),
      visibility: 'private_tenant',
    });

    if (targetType === 'student') {
      db.prepare(`UPDATE students SET photo_file_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
        stored.id,
        targetId,
      );
    } else {
      db.prepare(`UPDATE teachers SET photo_file_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
        stored.id,
        targetId,
      );
    }

    clearChatState(chatId);

    await sendTelegramMessage(
      chatId,
      `✅ *Passport Photo Updated Successfully!*\n\n` +
        `Official photo has been verified and attached to *${targetName}*.\n` +
        `This will appear on their Digital ID Card, broadsheets, and portal profile immediately.`,
      {
        inlineKeyboard: [
          [
            { text: '🎓 Students List', callback_data: 'menu:students' },
            { text: '📸 Upload Another Photo', callback_data: 'menu:upload_photo' },
          ],
          [{ text: '⬅️ Admin Menu', callback_data: 'menu:home' }],
        ],
      },
    );
  } catch (err) {
    console.error('[TelegramBot] Failed to upload photo:', err);
    await sendTelegramMessage(
      chatId,
      `❌ Failed to store photo: ${err instanceof Error ? err.message : 'Invalid image file.'}\n` +
        `Please send a standard JPEG or PNG photo.`,
    );
  }
}

async function handleListStudentsAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (!canManageSchoolMembers(link)) {
    await sendTelegramMessage(chatId, `⚠️ Access restricted to school administrators.`);
    return;
  }
  const school = resolveTargetSchool(link);
  if (!school) {
    await sendTelegramMessage(chatId, `⚠️ No school tenant found.`);
    return;
  }
  const db = getDb();
  const students = db
    .prepare(`
      SELECT s.id, s.first_name, s.last_name, s.admission_number, s.photo_file_id, c.name AS class_name
      FROM students s
      LEFT JOIN school_classes c ON c.id = s.current_class_id
      WHERE s.school_id = ? AND s.status = 'active'
      ORDER BY s.created_at DESC
      LIMIT 8
    `)
    .all(school.id) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
      photo_file_id: string | null;
      class_name: string | null;
    }>;

  if (students.length === 0) {
    await sendTelegramMessage(
      chatId,
      `🎓 *School Students — ${school.name}*\n\nNo students registered yet.`,
      {
        inlineKeyboard: [
          [{ text: '➕ Register First Student', callback_data: 'menu:reg_student' }],
          [{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }],
        ],
      },
    );
    return;
  }

  let text = `🎓 *Recent Students — ${school.name} (${students.length})*\n\n`;
  const keyboard: TelegramInlineButton[][] = [];
  for (const s of students) {
    const photoIcon = s.photo_file_id ? '📸' : '⚪';
    text += `• ${photoIcon} *${s.first_name} ${s.last_name}* (\`${s.admission_number}\`)\n  Class: ${s.class_name || 'Unassigned'}\n`;
    keyboard.push([{ text: `🆔 ID: ${s.first_name} (${s.admission_number})`, callback_data: `menu:view_id:${s.id}` }]);
  }

  keyboard.push([
    { text: '➕ Register Student', callback_data: 'menu:reg_student' },
    { text: '📸 Upload Photo', callback_data: 'menu:upload_photo' },
  ]);
  keyboard.push([{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]);

  await sendTelegramMessage(chatId, text, { inlineKeyboard: keyboard });
}

async function handleListTeachersAction(chatId: string, link: TelegramLinkRow): Promise<void> {
  if (!canManageSchoolMembers(link)) {
    await sendTelegramMessage(chatId, `⚠️ Access restricted to school administrators.`);
    return;
  }
  const school = resolveTargetSchool(link);
  if (!school) {
    await sendTelegramMessage(chatId, `⚠️ No school tenant found.`);
    return;
  }
  const db = getDb();
  const teachers = db
    .prepare(`
      SELECT id, first_name, last_name, staff_id_number, specialization, email, photo_file_id
      FROM teachers
      WHERE school_id = ? AND employment_status = 'active'
      ORDER BY created_at DESC
      LIMIT 8
    `)
    .all(school.id) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      staff_id_number: string;
      specialization: string;
      email: string;
      photo_file_id: string | null;
    }>;

  if (teachers.length === 0) {
    await sendTelegramMessage(
      chatId,
      `👨‍🏫 *Faculty Teachers — ${school.name}*\n\nNo faculty teachers registered yet.`,
      {
        inlineKeyboard: [
          [{ text: '➕ Register First Teacher', callback_data: 'menu:reg_teacher' }],
          [{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }],
        ],
      },
    );
    return;
  }

  let text = `👨‍🏫 *Faculty Teachers — ${school.name} (${teachers.length})*\n\n`;
  for (const t of teachers) {
    const photoIcon = t.photo_file_id ? '📸' : '⚪';
    text += `• ${photoIcon} *${t.first_name} ${t.last_name}* (\`${t.staff_id_number}\`)\n  Role: ${t.specialization} · \`${t.email}\`\n`;
  }

  await sendTelegramMessage(chatId, text, {
    inlineKeyboard: [
      [{ text: '➕ Register Teacher', callback_data: 'menu:reg_teacher' }],
      [{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }],
    ],
  });
}

async function sendStudentIdCardPhotoById(
  chatId: string,
  studentId: string,
  schoolId: string,
  includeAdminControls = true,
): Promise<void> {
  const db = getDb();
  const student = db
    .prepare('SELECT first_name, last_name, admission_number, photo_file_id FROM students WHERE id = ? AND school_id = ?')
    .get(studentId, schoolId) as
    | { first_name: string; last_name: string; admission_number: string; photo_file_id: string | null }
    | undefined;

  if (!student) {
    await sendTelegramMessage(chatId, `❌ Student not found.`);
    return;
  }

  let card = db
    .prepare(
      "SELECT id, card_number, qr_token_encrypted, status, expires_at FROM student_id_cards WHERE student_id = ? AND status = 'active' ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .get(studentId) as
    | { id: string; card_number: string; qr_token_encrypted: string; status: string; expires_at: string }
    | undefined;

  if (!card) {
    const issued = issueDigitalIdCard({
      schoolId,
      studentId,
      actorUserId: studentId,
    });
    card = db
      .prepare('SELECT id, card_number, qr_token_encrypted, status, expires_at FROM student_id_cards WHERE id = ?')
      .get(issued.cardId) as any;
  }

  if (!card) {
    await sendTelegramMessage(chatId, `❌ Unable to issue Digital ID Card for this student.`);
    return;
  }

  const secret = getOrCreateIdCardMasterSecret();
  const rawQrToken = decryptIdCardToken(card.qr_token_encrypted, secret);
  if (!rawQrToken) {
    await sendTelegramMessage(chatId, `❌ Failed to decrypt card token.`);
    return;
  }

  const caption =
    `🆔 *Digital Student ID Card*\n\n` +
    `👤 *Student:* *${student.first_name} ${student.last_name}*\n` +
    `🎓 *Admission No:* \`${student.admission_number}\`\n` +
    `💳 *Card Serial:* \`${card.card_number}\`\n` +
    `✅ *Status:* ${card.status.toUpperCase()}\n` +
    `📅 *Valid Until:* \`${card.expires_at.slice(0, 10)}\`\n` +
    `📸 *Passport:* ${student.photo_file_id ? '✅ Attached' : 'None'}`;

  const inlineKeyboard: TelegramInlineButton[][] = includeAdminControls
    ? [
        [
          { text: '➕ Register Student', callback_data: 'menu:reg_student' },
          { text: '🎓 All Students', callback_data: 'menu:students' },
        ],
        [{ text: '⬅️ Admin Menu', callback_data: 'menu:home' }],
      ]
    : [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]];

  const cardBuffer = await renderStudentIdCardPngBuffer(studentId, schoolId);
  if (cardBuffer) {
    await sendTelegramPhoto(chatId, cardBuffer, caption, {
      inlineKeyboard,
      filename: 'student-id-card.png',
    });
  } else {
    const pngBuffer = await QRCode.toBuffer(rawQrToken, { width: 360, margin: 2 });
    await sendTelegramPhoto(chatId, pngBuffer, caption, {
      inlineKeyboard,
      filename: 'student-id-qr.png',
    });
  }
}

async function dispatchUserMenuAction(
  chatId: string,
  link: TelegramLinkRow,
  action: string,
  baseUrl?: string,
): Promise<void> {
  switch (action) {
    case 'home':
      await sendRoleDashboardWelcome(chatId, link);
      break;
    case 'login':
      await handleMagicLogin(chatId, link, baseUrl);
      break;
    case 'attendance':
      await handleAttendanceAction(chatId, link);
      break;
    case 'results':
      await handleResultsAction(chatId, link);
      break;
    case 'fees':
      await handleFeesAction(chatId, link);
      break;
    case 'idcard':
      await handleIdCardAction(chatId, link);
      break;
    case 'wards':
      await handleWardsAction(chatId, link);
      break;
    case 'classes':
      await handleTeacherClassesAction(chatId, link);
      break;
    case 'checkin_prompt':
      setChatState(chatId, 'awaiting_checkin_qr');
      await sendTelegramMessage(
        chatId,
        `🆔 *Digital ID Card Check-In*\n\nPaste or send the student's QR code text (\`DTID-...\`) to mark them *Present* today.`,
      );
      break;
    case 'reg_student':
      await startStudentRegistration(chatId, link);
      break;
    case 'reg_teacher':
      await startTeacherRegistration(chatId, link);
      break;
    case 'reg_parent':
      await startParentRegistration(chatId, link);
      break;
    case 'upload_photo':
      await startPhotoUploadWizard(chatId, link);
      break;
    case 'students':
      await handleListStudentsAction(chatId, link);
      break;
    case 'teachers':
      await handleListTeachersAction(chatId, link);
      break;
    case 'overview':
      await handleOverviewAction(chatId, link);
      break;
    case 'admissions':
      await handleAdminAdmissionsAction(chatId, link);
      break;
    case 'finance':
      await handleAdminFinanceAction(chatId, link);
      break;
    case 'schools':
      await handleOwnerSchoolsAction(chatId, link);
      break;
    case 'notices':
      await handleNoticesAction(chatId, link);
      break;
    case 'unlink': {
      const db = getDb();
      db.prepare(`DELETE FROM telegram_links WHERE telegram_chat_id = ?`).run(chatId);
      clearChatState(chatId);
      await sendTelegramMessage(
        chatId,
        `🔌 Unlinked successfully. Use the buttons below anytime to sign in again.`,
        { inlineKeyboard: buildUnlinkedKeyboard() },
      );
      break;
    }
    default:
      await sendRoleDashboardWelcome(chatId, link);
  }
}

export async function handleTelegramUpdate(update: any, requestBaseUrl?: string): Promise<void> {
  // 1. Handle Interactive Inline Button Callbacks
  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? '');
    const username = cq.from?.username || cq.from?.first_name || 'User';
    const data = String(cq.data || '');

    await answerCallbackQuery(String(cq.id));
    if (!chatId) return;

    if (data === 'auth:start_link') {
      setChatState(chatId, 'awaiting_identifier');
      await sendTelegramMessage(
        chatId,
        `🔐 *Sign In & Link Account*\n\nPlease enter your *Portal Email*, *Admission Number*, or *Staff ID*:\n_(Send /cancel at any time to stop.)_`,
      );
      return;
    }

    if (data === 'auth:start_id_login') {
      setChatState(chatId, 'awaiting_id_card');
      await sendTelegramMessage(
        chatId,
        `🆔 *Student Digital ID Card Login*\n\nPaste your Digital ID Card QR token (\`DTID-...\`) to link and sign in:`,
      );
      return;
    }

    if (data === 'action:help') {
      await sendTelegramMessage(
        chatId,
        `🤖 *How to Use the Portal Bot*\n\n` +
          `All Students, Parents, Teachers, School Admins, and Platform Staff share this bot:\n\n` +
          `1️⃣ Connect your account via *Sign In / Link Portal Account* (or \`/link email password\`)\n` +
          `2️⃣ Tap *Open Web Portal* (\`/login\`) for 1-click sign-in without typing passwords again\n` +
          `3️⃣ *Admins:* Register students (\`/regstudent\`), teachers (\`/regteacher\`), parents (\`/regparent\`), and upload passport photos (\`/uploadphoto\`)\n` +
          `4️⃣ Check *Attendance*, *Results*, *Fees*, *Digital ID Card QR*, *Admissions*, or *Mark Check-ins* right inside Telegram!`,
        { inlineKeyboard: buildUnlinkedKeyboard() },
      );
      return;
    }

    if (data.startsWith('menu:view_id:')) {
      const studentId = data.slice('menu:view_id:'.length);
      const link = getTelegramLink(chatId);
      if (link) {
        if (canManageSchoolMembers(link)) {
          const school = resolveTargetSchool(link);
          if (school) {
            await sendStudentIdCardPhotoById(chatId, studentId, school.id, true);
            return;
          }
        } else if (link.role === 'student' && link.profile_id === studentId && link.school_id) {
          await sendStudentIdCardPhotoById(chatId, studentId, link.school_id, false);
          return;
        } else if (link.role === 'parent' && link.profile_id) {
          const db = getDb();
          const ward = db
            .prepare(`
              SELECT s.id, s.school_id
              FROM student_guardians sg
              INNER JOIN students s ON s.id = sg.student_id
              WHERE sg.parent_id = ? AND sg.student_id = ?
              LIMIT 1
            `)
            .get(link.profile_id, studentId) as { id: string; school_id: string } | undefined;
          if (ward) {
            await sendStudentIdCardPhotoById(chatId, ward.id, ward.school_id, false);
            return;
          }
        }
      }
      await sendTelegramMessage(chatId, `⚠️ You are not authorized to view that Digital ID card.`);
      return;
    }

    if (data.startsWith('reg_stu_cls:')) {
      const classVal = data.slice('reg_stu_cls:'.length);
      const state = getChatState(chatId);
      const link = getTelegramLink(chatId);
      if (state && link) {
        const schoolId = String(state.payload.schoolId || link.school_id || '');
        if (classVal === 'skip') {
          setChatState(chatId, 'reg_stu_gender', {
            ...state.payload,
            classId: null,
            className: 'Unassigned',
            armId: null,
          });
          await promptStudentGenderSelection(chatId, String(state.payload.fullName || 'Student'));
          return;
        }
        const db = getDb();
        const classRow = db
          .prepare('SELECT id, name FROM school_classes WHERE id = ? AND school_id = ?')
          .get(classVal, schoolId) as { id: string; name: string } | undefined;
        if (classRow) {
          const arms = db
            .prepare("SELECT id, name FROM class_arms WHERE class_id = ? AND school_id = ? AND status = 'active' ORDER BY name ASC")
            .all(classVal, schoolId) as Array<{ id: string; name: string }>;
          if (arms.length > 0) {
            const keyboard: TelegramInlineButton[][] = [];
            let row: TelegramInlineButton[] = [];
            for (const a of arms) {
              row.push({ text: `🏷️ ${a.name}`, callback_data: `reg_stu_arm:${a.id}` });
              if (row.length === 2) {
                keyboard.push(row);
                row = [];
              }
            }
            if (row.length > 0) keyboard.push(row);
            keyboard.push([{ text: '🚫 No Arm / Default', callback_data: 'reg_stu_arm:skip' }]);
            setChatState(chatId, 'reg_stu_arm', {
              ...state.payload,
              classId: classRow.id,
              className: classRow.name,
            });
            await sendTelegramMessage(
              chatId,
              `🎓 *Class ${classRow.name} Selected*\n\nSelect an arm/section:`,
              { inlineKeyboard: keyboard },
            );
            return;
          }
          setChatState(chatId, 'reg_stu_gender', {
            ...state.payload,
            classId: classRow.id,
            className: classRow.name,
            armId: null,
          });
          await promptStudentGenderSelection(chatId, String(state.payload.fullName || 'Student'));
          return;
        }
      }
    }

    if (data.startsWith('reg_stu_arm:')) {
      const armVal = data.slice('reg_stu_arm:'.length);
      const state = getChatState(chatId);
      if (state) {
        const db = getDb();
        let armName = '';
        if (armVal !== 'skip') {
          const armRow = db
            .prepare('SELECT name FROM class_arms WHERE id = ?')
            .get(armVal) as { name: string } | undefined;
          armName = armRow?.name || '';
        }
        const fullClassName = armName
          ? `${state.payload.className} (${armName})`
          : String(state.payload.className);
        setChatState(chatId, 'reg_stu_gender', {
          ...state.payload,
          className: fullClassName,
          armId: armVal === 'skip' ? null : armVal,
        });
        await promptStudentGenderSelection(chatId, String(state.payload.fullName || 'Student'));
        return;
      }
    }

    if (data.startsWith('reg_stu_gen:')) {
      const gen = data.slice('reg_stu_gen:'.length);
      const state = getChatState(chatId);
      if (state) {
        setChatState(chatId, 'reg_stu_account', {
          ...state.payload,
          gender: gen,
        });
        await promptStudentAccountSelection(chatId, String(state.payload.fullName || 'Student'));
        return;
      }
    }

    if (data.startsWith('reg_stu_acc:')) {
      const accType = data.slice('reg_stu_acc:'.length);
      const state = getChatState(chatId);
      const link = getTelegramLink(chatId);
      if (state && link) {
        if (accType === 'auto') {
          const email = generateSafeEmail(
            String(state.payload.firstName || 'Student'),
            String(state.payload.lastName || 'Student'),
            String(state.payload.schoolSlug || 'school'),
            'stu',
          );
          const password = generateSafePassword('Student');
          setChatState(chatId, 'reg_stu_photo', {
            ...state.payload,
            createLogin: true,
            studentEmail: email,
            tempPassword: password,
          });
          await promptStudentPhotoUpload(chatId, String(state.payload.fullName || 'Student'));
          return;
        }
        if (accType === 'custom') {
          setChatState(chatId, 'reg_stu_await_email', state.payload);
          await sendTelegramMessage(chatId, `✉️ Please reply with the student's *email address*:`);
          return;
        }
        if (accType === 'none') {
          setChatState(chatId, 'reg_stu_photo', {
            ...state.payload,
            createLogin: false,
          });
          await promptStudentPhotoUpload(chatId, String(state.payload.fullName || 'Student'));
          return;
        }
      }
    }

    if (data === 'reg_stu_photo:skip') {
      const state = getChatState(chatId);
      const link = getTelegramLink(chatId);
      if (state && link) {
        await executeStudentRegistration(chatId, link, state.payload, null);
        return;
      }
    }

    if (data === 'reg_action:cancel') {
      clearChatState(chatId);
      const link = getTelegramLink(chatId);
      if (link) {
        await sendRoleDashboardWelcome(chatId, link);
      } else {
        await sendTelegramMessage(chatId, `Cancelled.`);
      }
      return;
    }

    if (data.startsWith('reg_tch_acc:')) {
      const acc = data.slice('reg_tch_acc:'.length);
      const state = getChatState(chatId);
      if (state) {
        if (acc === 'auto') {
          const staffId = allocateStaffIdNumber(String(state.payload.schoolId || ''));
          const email = generateSafeEmail(
            String(state.payload.fullName || 'Teacher').split(' ')[0] || 'Teacher',
            String(state.payload.fullName || 'Teacher').split(' ').pop() || 'Teacher',
            String(state.payload.schoolSlug || 'school'),
            'tch',
          );
          const password = generateSafePassword('Teach');
          setChatState(chatId, 'reg_tch_photo', {
            ...state.payload,
            staffIdNumber: staffId,
            email,
            tempPassword: password,
          });
          await promptTeacherPhotoUpload(chatId, String(state.payload.fullName || 'Teacher'));
          return;
        }
        if (acc === 'custom') {
          setChatState(chatId, 'reg_tch_email', state.payload);
          await sendTelegramMessage(chatId, `✉️ Please reply with the teacher's *email address*:`);
          return;
        }
      }
    }

    if (data === 'reg_tch_photo:skip') {
      const state = getChatState(chatId);
      const link = getTelegramLink(chatId);
      if (state && link) {
        await executeTeacherRegistration(chatId, link, state.payload, null);
        return;
      }
    }

    if (data.startsWith('menu:')) {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(
          chatId,
          `⚠️ Your Telegram chat is not linked yet. Choose an option below to connect:`,
          { inlineKeyboard: buildUnlinkedKeyboard() },
        );
        return;
      }
      await dispatchUserMenuAction(chatId, link, data.slice('menu:'.length), requestBaseUrl);
      return;
    }

    return;
  }

  // 2. Handle Text, Photos & Document Messages
  const message = update?.message || update?.edited_message;
  if (!message) return;

  const chatId = String(message.chat?.id || '');
  if (!chatId) return;

  const rawText = typeof message.text === 'string' ? message.text.trim() : '';
  const caption = typeof message.caption === 'string' ? message.caption.trim() : '';
  const text = rawText || caption;
  const username = message.from?.username || message.from?.first_name || 'User';
  const photoInfo = extractPhotoOrImageDocument(message);

  if (text.toLowerCase() === '/cancel') {
    clearChatState(chatId);
    const link = getTelegramLink(chatId);
    if (link) {
      await sendRoleDashboardWelcome(chatId, link);
    } else {
      await sendTelegramMessage(chatId, `Cancelled. Choose an option below:`, {
        inlineKeyboard: buildUnlinkedKeyboard(),
      });
    }
    return;
  }

  // Handle Photo / Passport Upload when in photo-expecting state
  if (photoInfo) {
    const state = getChatState(chatId);
    const link = getTelegramLink(chatId);
    if (link && state) {
      if (state.step === 'reg_stu_photo') {
        await sendTelegramMessage(chatId, `⏳ Processing student passport photo...`);
        const downloaded = await downloadTelegramFile(photoInfo.fileId);
        await executeStudentRegistration(chatId, link, state.payload, downloaded);
        return;
      }
      if (state.step === 'reg_tch_photo') {
        await sendTelegramMessage(chatId, `⏳ Processing teacher profile photo...`);
        const downloaded = await downloadTelegramFile(photoInfo.fileId);
        await executeTeacherRegistration(chatId, link, state.payload, downloaded);
        return;
      }
      if (state.step === 'upload_target_photo') {
        await sendTelegramMessage(chatId, `⏳ Storing passport photo...`);
        const downloaded = await downloadTelegramFile(photoInfo.fileId);
        if (downloaded) {
          await executePhotoUpload(
            chatId,
            link,
            state.payload.targetType as 'student' | 'teacher',
            String(state.payload.targetId),
            String(state.payload.targetName),
            downloaded,
          );
        } else {
          await sendTelegramMessage(chatId, `❌ Failed to download photo from Telegram. Please retry.`);
        }
        return;
      }
    }
    if (link && canManageSchoolMembers(link)) {
      await sendTelegramMessage(
        chatId,
        `📸 *Photo received!*\n\nWhat would you like to attach this photo to?`,
        {
          inlineKeyboard: [
            [{ text: '➕ Register Student with this Photo', callback_data: 'menu:reg_student' }],
            [{ text: '📸 Attach to Existing Student / Staff', callback_data: 'menu:upload_photo' }],
            [{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }],
          ],
        },
      );
      return;
    }
  }

  // Handle multi-step conversational text state if not starting a slash command
  if (text && !text.startsWith('/')) {
    const state = getChatState(chatId);
    if (state) {
      if (state.step === 'awaiting_identifier') {
        setChatState(chatId, 'awaiting_password', { identifier: text });
        await sendTelegramMessage(chatId, `🔑 Now enter your *portal password* for \`${text}\`:`);
        return;
      }

      if (state.step === 'awaiting_password') {
        const identifier = String(state.payload.identifier || '');
        clearChatState(chatId);
        const verified = verifyCredentialsForTelegramLink(identifier, text);
        if (!verified.ok) {
          await sendTelegramMessage(chatId, `❌ ${verified.error}`, {
            inlineKeyboard: buildUnlinkedKeyboard(),
          });
          return;
        }
        saveTelegramLink(chatId, username, verified.account);
        const link = getTelegramLink(chatId)!;
        await sendTelegramMessage(
          chatId,
          `✅ *Verified & Linked!*\nWelcome *${verified.account.fullName}* (${verified.account.summaryLabel}).`,
        );
        await sendRoleDashboardWelcome(chatId, link);
        return;
      }

      if (state.step === 'awaiting_id_card') {
        clearChatState(chatId);
        const verified = authenticateIdCardForTelegramLink(text);
        if (!verified.ok) {
          await sendTelegramMessage(chatId, `❌ ${verified.error}`, {
            inlineKeyboard: buildUnlinkedKeyboard(),
          });
          return;
        }
        saveTelegramLink(chatId, username, verified.account);
        const link = getTelegramLink(chatId)!;
        await sendTelegramMessage(
          chatId,
          `✅ *Digital ID Verified!*\nWelcome *${verified.account.fullName}*.`,
        );
        await sendRoleDashboardWelcome(chatId, link);
        return;
      }

      if (state.step === 'awaiting_checkin_qr') {
        clearChatState(chatId);
        const link = getTelegramLink(chatId);
        if (link) {
          await handleTeacherCheckin(chatId, link, text);
          return;
        }
      }

      if (state.step === 'reg_stu_name') {
        const link = getTelegramLink(chatId);
        if (link) {
          const school = resolveTargetSchool(link);
          if (school) {
            await promptStudentClassSelection(chatId, link, school, text);
            return;
          }
        }
      }

      if (state.step === 'reg_stu_await_email') {
        const email = text.trim().toLowerCase();
        if (!email.includes('@') || !email.includes('.')) {
          await sendTelegramMessage(chatId, `❌ Please enter a valid email address (e.g. \`student@school.edu\`):`);
          return;
        }
        const password = generateSafePassword('Student');
        setChatState(chatId, 'reg_stu_photo', {
          ...state.payload,
          createLogin: true,
          studentEmail: email,
          tempPassword: password,
        });
        await promptStudentPhotoUpload(chatId, String(state.payload.fullName || 'Student'));
        return;
      }

      if (state.step === 'reg_tch_name') {
        setChatState(chatId, 'reg_tch_spec', { ...state.payload, fullName: text });
        await promptTeacherSpecialization(chatId, text);
        return;
      }

      if (state.step === 'reg_tch_spec') {
        setChatState(chatId, 'reg_tch_acc', { ...state.payload, specialization: text });
        await promptTeacherAccountSelection(chatId, String(state.payload.fullName || 'Teacher'));
        return;
      }

      if (state.step === 'reg_tch_email') {
        const email = text.trim().toLowerCase();
        if (!email.includes('@') || !email.includes('.')) {
          await sendTelegramMessage(chatId, `❌ Please enter a valid email address:`);
          return;
        }
        const staffId = allocateStaffIdNumber(String(state.payload.schoolId || ''));
        const password = generateSafePassword('Teach');
        setChatState(chatId, 'reg_tch_photo', {
          ...state.payload,
          staffIdNumber: staffId,
          email,
          tempPassword: password,
        });
        await promptTeacherPhotoUpload(chatId, String(state.payload.fullName || 'Teacher'));
        return;
      }

      if (state.step === 'reg_par_name') {
        setChatState(chatId, 'reg_par_contact', { ...state.payload, fullName: text });
        await sendTelegramMessage(
          chatId,
          `👪 *Register Parent: ${text}* (Step 2/3)\n\n` +
            `Please reply with their *Email* and optional *Phone* (e.g. \`parent@gmail.com, 08012345678\`):`,
        );
        return;
      }

      if (state.step === 'reg_par_contact') {
        const parts = text.split(/[,;\s]+/).map((p: string) => p.trim()).filter(Boolean);
        const email = parts.find((p: string) => p.includes('@')) || '';
        const phone = parts.find((p: string) => /^\+?[0-9]{7,15}$/.test(p)) || '';
        if (!email) {
          await sendTelegramMessage(chatId, `❌ Please provide at least a valid email address for the parent:`);
          return;
        }
        setChatState(chatId, 'reg_par_ward', {
          ...state.payload,
          email,
          phone,
          tempPassword: generateSafePassword('Parent'),
        });
        await sendTelegramMessage(
          chatId,
          `👶 *Link Student Ward* (Step 3/3)\n\n` +
            `Enter the student ward's *Admission Number* to link them immediately, or send \`/skip\` to complete without linking:`,
        );
        return;
      }

      if (state.step === 'reg_par_ward') {
        const wardAdm = text.toLowerCase() === '/skip' ? '' : text.trim();
        const link = getTelegramLink(chatId);
        if (link) {
          await executeParentRegistration(chatId, link, {
            ...state.payload,
            wardAdmissionNumber: wardAdm,
          });
          return;
        }
      }

      if (state.step === 'upload_photo_search') {
        const link = getTelegramLink(chatId);
        if (link) {
          await startPhotoUploadWizard(chatId, link, text.trim());
          return;
        }
      }
    }
  }

  if (!text) return;

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1);

  switch (command) {
    case '/start': {
      clearChatState(chatId);
      const startParam = args[0]?.trim() || '';

      if (startParam.startsWith('link_')) {
        const rawConnectToken = startParam.slice('link_'.length);
        const consumed = consumeTelegramToken(rawConnectToken, 'connect_link');
        if (!consumed) {
          await sendTelegramMessage(
            chatId,
            `⚠️ That connection link has expired or was already used. Generate a fresh link from your portal profile or sign in below:`,
            { inlineKeyboard: buildUnlinkedKeyboard() },
          );
          return;
        }

        const ctx = resolveUserAccountContext(consumed.user_id);
        if (!ctx) {
          await sendTelegramMessage(chatId, `❌ Your portal account is inactive or suspended.`);
          return;
        }

        saveTelegramLink(chatId, username, ctx);
        const link = getTelegramLink(chatId)!;
        await sendTelegramMessage(
          chatId,
          `✅ *One-Click Portal Link Complete!*\nConnected as *${ctx.fullName}* (${ctx.summaryLabel}).`,
        );
        await sendRoleDashboardWelcome(chatId, link);
        return;
      }

      const existing = getTelegramLink(chatId);
      if (existing) {
        await sendRoleDashboardWelcome(chatId, existing);
        return;
      }

      await sendTelegramMessage(
        chatId,
        `🤖 *Dave Timi EdTech — Universal Portal Bot*\n\n` +
          `Welcome *${username}*!\n` +
          `Students, Parents, Teachers, School Admins, and Platform Staff can sign in and access everything right here.\n\n` +
          `Tap a button below to connect your account:`,
        { inlineKeyboard: buildUnlinkedKeyboard() },
      );
      return;
    }

    case '/menu':
    case '/help': {
      const existing = getTelegramLink(chatId);
      if (existing) {
        await sendRoleDashboardWelcome(chatId, existing);
        return;
      }
      await sendTelegramMessage(
        chatId,
        `🤖 *Portal Bot Commands*\n\n` +
          `• \`/link <email_or_id> <password>\` — Verify & connect portal account\n` +
          `• \`/idlogin <DTID-...>\` — Student Digital ID login\n` +
          `• \`/login\` — 1-click sign-in link to your web portal\n` +
          `• \`/regstudent [name]\` — Register student + passport photo + Digital ID\n` +
          `• \`/regteacher [name]\` — Register faculty teacher + staff credentials\n` +
          `• \`/regparent\` — Register parent/guardian + link student ward\n` +
          `• \`/uploadphoto [id]\` — Upload passport photo for student or staff\n` +
          `• \`/students\` & \`/teachers\` — Member directories\n` +
          `• \`/attendance\`, \`/results\`, \`/fees\`, \`/idcard\`, \`/wards\`, \`/classes\`, \`/overview\`\n` +
          `• \`/status\` & \`/unlink\``,
        { inlineKeyboard: buildUnlinkedKeyboard() },
      );
      return;
    }

    case '/regstudent': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Connect your school admin account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      const argName = args.join(' ').trim();
      await startStudentRegistration(chatId, link, argName || undefined);
      return;
    }

    case '/regteacher': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Connect your school admin account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      const argName = args.join(' ').trim();
      await startTeacherRegistration(chatId, link, argName || undefined);
      return;
    }

    case '/regparent': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Connect your school admin account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      await startParentRegistration(chatId, link);
      return;
    }

    case '/uploadphoto': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Connect your school admin account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      const identifier = args.join(' ').trim();
      await startPhotoUploadWizard(chatId, link, identifier || undefined);
      return;
    }

    case '/students': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Connect your school admin account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      await handleListStudentsAction(chatId, link);
      return;
    }

    case '/teachers': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Connect your school admin account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      await handleListTeachersAction(chatId, link);
      return;
    }

    case '/link': {
      if (args.length >= 2) {
        const identifier = args[0];
        const password = args.slice(1).join(' ');
        const verified = verifyCredentialsForTelegramLink(identifier, password);
        if (!verified.ok) {
          await sendTelegramMessage(chatId, `❌ ${verified.error}`);
          return;
        }
        saveTelegramLink(chatId, username, verified.account);
        const link = getTelegramLink(chatId)!;
        await sendTelegramMessage(
          chatId,
          `✅ *Account Linked!*\nWelcome *${verified.account.fullName}* (${verified.account.summaryLabel}).`,
        );
        await sendRoleDashboardWelcome(chatId, link);
        return;
      }

      if (args.length === 1) {
        setChatState(chatId, 'awaiting_password', { identifier: args[0] });
        await sendTelegramMessage(chatId, `🔑 Enter your *portal password* for \`${args[0]}\`:`);
        return;
      }

      setChatState(chatId, 'awaiting_identifier');
      await sendTelegramMessage(
        chatId,
        `🔐 Please reply with your *Portal Email*, *Admission Number*, or *Staff ID*:`,
      );
      return;
    }

    case '/idlogin': {
      const qrInput = args.join(' ').trim();
      if (!qrInput) {
        setChatState(chatId, 'awaiting_id_card');
        await sendTelegramMessage(chatId, `🆔 Reply with your Student Digital ID QR code (\`DTID-...\`) to sign in.`);
        return;
      }
      const verified = authenticateIdCardForTelegramLink(qrInput);
      if (!verified.ok) {
        await sendTelegramMessage(chatId, `❌ ${verified.error}`);
        return;
      }
      saveTelegramLink(chatId, username, verified.account);
      const link = getTelegramLink(chatId)!;
      await sendRoleDashboardWelcome(chatId, link);
      return;
    }

    case '/status': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Not linked yet. Tap below to connect:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      await sendTelegramMessage(
        chatId,
        `🔗 *Linked Account Status*\n\n` +
          `Name: *${link.user_full_name}*\n` +
          `Email: \`${link.user_email}\`\n` +
          `Role: *${link.role.replace(/_/g, ' ').toUpperCase()}*\n` +
          `${link.school_name ? `School: *${link.school_name}*\n` : ''}` +
          `Linked At: \`${link.linked_at}\``,
        { inlineKeyboard: buildRoleMenuKeyboard(link.role) },
      );
      return;
    }

    case '/unlink': {
      const db = getDb();
      db.prepare(`DELETE FROM telegram_links WHERE telegram_chat_id = ?`).run(chatId);
      clearChatState(chatId);
      await sendTelegramMessage(chatId, `🔌 Successfully unlinked your Telegram account.`, {
        inlineKeyboard: buildUnlinkedKeyboard(),
      });
      return;
    }

    case '/login': {
      const link = getTelegramLink(chatId);
      if (!link) {
        setChatState(chatId, 'awaiting_identifier');
        await sendTelegramMessage(
          chatId,
          `🔐 Let's sign you in first! Enter your *Portal Email*, *Admission Number*, or *Staff ID*:`,
        );
        return;
      }
      await dispatchUserMenuAction(chatId, link, 'login', requestBaseUrl);
      return;
    }

    case '/checkin': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Sign in first to mark attendance.`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      const qrInput = args.join(' ').trim();
      if (!qrInput) {
        await dispatchUserMenuAction(chatId, link, 'checkin_prompt', requestBaseUrl);
        return;
      }
      await handleTeacherCheckin(chatId, link, qrInput);
      return;
    }

    case '/attendance':
    case '/results':
    case '/fees':
    case '/idcard':
    case '/wards':
    case '/classes':
    case '/overview':
    case '/admissions':
    case '/finance':
    case '/schools':
    case '/notices': {
      const link = getTelegramLink(chatId);
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Please connect your portal account first:`, {
          inlineKeyboard: buildUnlinkedKeyboard(),
        });
        return;
      }
      await dispatchUserMenuAction(chatId, link, command.slice(1), requestBaseUrl);
      return;
    }

    default: {
      const link = getTelegramLink(chatId);
      if (link) {
        await sendTelegramMessage(
          chatId,
          `❓ Unknown command \`${command}\`. Tap any button below:`,
          { inlineKeyboard: buildRoleMenuKeyboard(link.role) },
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `❓ Unknown command \`${command}\`. Connect your portal account below:`,
          { inlineKeyboard: buildUnlinkedKeyboard() },
        );
      }
    }
  }
}
