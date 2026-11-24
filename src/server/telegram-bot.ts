import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { getDb } from '../db/client.ts';
import {
  decryptIdCardToken,
  evaluateIdCardValidity,
  extractIdCardTokenFromScan,
  getOrCreateIdCardMasterSecret,
} from './id-card-helpers.ts';
import { generateOpaqueToken, sha256Hex, verifyPassword } from './security.ts';
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
  options: TelegramSendOptions = {},
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
    const blob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' });
    formData.append('photo', blob, 'student-id-qr.png');

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
          { text: '📈 School Snapshot', callback_data: 'menu:overview' },
          { text: '📝 Pending Admissions', callback_data: 'menu:admissions' },
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
  if (link.role !== 'student' || !link.profile_id) {
    await sendTelegramMessage(chatId, `🆔 Digital Student ID cards are issued for enrolled students.`, {
      inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
    });
    return;
  }

  const db = getDb();
  const card = db
    .prepare(`
      SELECT id, card_number, qr_token_encrypted, status, expires_at
      FROM student_id_cards
      WHERE student_id = ?
      ORDER BY created_at DESC
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
    .prepare(`SELECT first_name, last_name, admission_number FROM students WHERE id = ?`)
    .get(link.profile_id) as
    | { first_name: string; last_name: string; admission_number: string }
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

  if (rawQrToken) {
    try {
      const pngBuffer = await QRCode.toBuffer(rawQrToken, {
        width: 360,
        margin: 2,
      });
      const sentPhoto = await sendTelegramPhoto(chatId, pngBuffer, caption, {
        inlineKeyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:home' }]],
      });
      if (sentPhoto) return;
    } catch {
      // fallback to text message
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
          `3️⃣ Check *Attendance*, *Results*, *Fees*, *Digital ID Card QR*, *Admissions*, or *Mark Check-ins* right inside Telegram!`,
        { inlineKeyboard: buildUnlinkedKeyboard() },
      );
      return;
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

  // 2. Handle Text Messages & Slash Commands
  const message = update?.message || update?.edited_message;
  if (!message || !message.text) return;

  const chatId = String(message.chat.id);
  const text = String(message.text).trim();
  const username = message.from?.username || message.from?.first_name || 'User';

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

  // Handle multi-step conversational state if not starting a slash command
  if (!text.startsWith('/')) {
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
    }
  }

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1);

  switch (command) {
    case '/start': {
      clearChatState(chatId);
      const startParam = args[0]?.trim() || '';

      // Support 1-click portal deep link: /start link_<token>
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
          `• \`/link <email_or_id> <password>\` — Verify & connect any portal account\n` +
          `• \`/idlogin <DTID-...>\` — Student Digital ID login\n` +
          `• \`/login\` — 1-click sign-in link to your web portal\n` +
          `• \`/attendance\`, \`/results\`, \`/fees\`, \`/idcard\`, \`/wards\`, \`/classes\`, \`/overview\`\n` +
          `• \`/status\` & \`/unlink\``,
        { inlineKeyboard: buildUnlinkedKeyboard() },
      );
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
