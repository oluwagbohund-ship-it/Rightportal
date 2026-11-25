import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-edtech-telegram-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.SQLITE_BACKUP_DIR = path.join(tmpDir, 'backups');
process.env.FILE_STORAGE_DIR = path.join(tmpDir, 'storage');

const { closeDb, getDb, verifyDatabaseIntegrity } = await import('../db/client.ts');
const { securityHeadersMiddleware } = await import('./middleware.ts');
const { hashPassword, sha256Hex } = await import('./security.ts');
const {
  encryptIdCardToken,
  generateIdCardQrToken,
  getOrCreateIdCardMasterSecret,
} = await import('./id-card-helpers.ts');
const { renderStudentIdCardPngBuffer, renderSvgToPngBuffer } = await import('./id-card-renderer.ts');
const { authRouter } = await import('./routes/auth.ts');
const { ownerRouter } = await import('./routes/owner.ts');
const telegramRouter = (await import('./routes/telegram.ts')).default;
const {
  getBotToken,
  getBotUsername,
  handleTelegramUpdate,
  normalizeLoginIdentifier,
} = await import('./telegram-bot.ts');
const { createNotificationRecord } = await import('./notifications/service.ts');

let simulateSetWebhook429 = false;

interface SentTelegramCall {
  method: string;
  chatId: string;
  text: string;
  inlineKeyboard?: unknown;
  isPhoto?: boolean;
  photoFilename?: string;
  photoBuffer?: Buffer;
}

const sentCalls: SentTelegramCall[] = [];
const originalFetch = globalThis.fetch;

let server: http.Server;
let baseUrl: string;

const ids = {
  ownerUser: `usr_owner_${crypto.randomUUID()}`,
  adminUser: `usr_admin_${crypto.randomUUID()}`,
  teacherUser: `usr_tch_${crypto.randomUUID()}`,
  teacherProfile: `tch_${crypto.randomUUID()}`,
  studentUser: `usr_stu_${crypto.randomUUID()}`,
  studentProfile: `stu_${crypto.randomUUID()}`,
  parentUser: `usr_par_${crypto.randomUUID()}`,
  parentProfile: `par_${crypto.randomUUID()}`,
  schoolId: `sch_${crypto.randomUUID()}`,
  classId: `cls_${crypto.randomUUID()}`,
  subjectId: `sub_${crypto.randomUUID()}`,
  sessionId: `ses_${crypto.randomUUID()}`,
  termId: `trm_${crypto.randomUUID()}`,
  studentQrToken: generateIdCardQrToken(),
};

function extractSessionCookie(res: Response): string | null {
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')!]
        : [];
  for (const header of setCookies) {
    const firstPart = header.split(';')[0];
    if (firstPart?.startsWith('dt_edtech_session=')) {
      const val = firstPart.slice('dt_edtech_session='.length);
      return val.length > 0 ? firstPart : '';
    }
  }
  return null;
}

async function api(
  routePath: string,
  options: { method?: string; cookie?: string; body?: unknown; redirect?: RequestRedirect } = {},
) {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await originalFetch(`${baseUrl}${routePath}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: options.redirect ?? 'manual',
  });
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    json = { raw: text };
  }
  return { res, status: res.status, json, cookie: extractSessionCookie(res) };
}

before(async () => {
  // Intercept outbound Telegram Bot API requests in tests while leaving local HTTP untouched
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://api.telegram.org/')) {
      if (url.includes('/file/bot')) {
        const samplePng = await renderSvgToPngBuffer(
          `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200">
            <rect width="160" height="200" fill="#DBEAFE"/>
            <circle cx="80" cy="72" r="34" fill="#1E3A8A"/>
            <path d="M22,190 A58,58 0 0,1 138,190 Z" fill="#1E3A8A"/>
          </svg>`,
        );
        return new Response(new Uint8Array(samplePng), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      const methodMatch = url.match(/\/bot[^/]+\/([^?]+)/);
      const method = methodMatch?.[1] || 'unknown';
      if (method === 'getMe') {
        return new Response(
          JSON.stringify({
            ok: true,
            result: { id: 998877, is_bot: true, first_name: 'DaveTimiBot', username: 'DaveTimiPortalBot' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'getWebhookInfo') {
        return new Response(
          JSON.stringify({
            ok: true,
            result: { url: `${baseUrl}/api/telegram/webhook`, has_custom_certificate: false, pending_update_count: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'setWebhook') {
        if (simulateSetWebhook429) {
          return new Response(
            JSON.stringify({
              ok: false,
              error_code: 429,
              description: 'Too Many Requests: retry after 32',
              parameters: { retry_after: 32 },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'deleteWebhook' || method === 'answerCallbackQuery' || method === 'sendChatAction') {
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'getFile') {
        const u = new URL(url);
        const fileId = u.searchParams.get('file_id') || 'sample_file_id';
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              file_id: fileId,
              file_unique_id: `uniq_${fileId}`,
              file_size: 150,
              file_path: `photos/${fileId}.png`,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if ((method === 'sendMessage' || method === 'editMessageText') && init?.body && typeof init.body === 'string') {
        const payload = JSON.parse(init.body) as any;
        sentCalls.push({
          method,
          chatId: String(payload.chat_id),
          text: String(payload.text || ''),
          inlineKeyboard: payload.reply_markup?.inline_keyboard,
        });
      } else if (method === 'sendPhoto' && init?.body instanceof FormData) {
        const kbRaw = init.body.get('reply_markup');
        const photoField = init.body.get('photo');
        let photoFilename: string | undefined;
        let photoBuffer: Buffer | undefined;
        if (photoField && typeof photoField === 'object' && 'arrayBuffer' in photoField) {
          photoFilename = (photoField as File).name;
          photoBuffer = Buffer.from(await (photoField as Blob).arrayBuffer());
        }
        sentCalls.push({
          method,
          chatId: String(init.body.get('chat_id') || ''),
          text: String(init.body.get('caption') || ''),
          inlineKeyboard: typeof kbRaw === 'string' ? JSON.parse(kbRaw)?.inline_keyboard : undefined,
          isPhoto: true,
          photoFilename,
          photoBuffer,
        });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: sentCalls.length } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  getDb();
  const app = express();
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', authRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/telegram', telegramRouter);
  app.use('/auth', telegramRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });

  // Seed representative accounts across all 5 portal groups
  const db = getDb();
  const pwHash = hashPassword('PortalPass123!');

  db.prepare(
    `INSERT INTO users (id, email, full_name, password_hash, user_type, is_active) VALUES (?, ?, ?, ?, 'workforce', 1)`,
  ).run(ids.ownerUser, 'owner@davetimi.test', 'David Owner', pwHash);
  db.prepare(
    `INSERT INTO workforce_assignments (id, user_id, role_id, department, clearance_level) VALUES (?, ?, 'role_platform_owner', 'Executive', 'owner')`,
  ).run(`wrk_${crypto.randomUUID()}`, ids.ownerUser);

  db.prepare(
    `INSERT INTO schools (id, name, slug, code, country, city, contact_email, status) VALUES (?, 'Alpha Crest College', 'alpha-crest', 'DT-ALPH01', 'Nigeria', 'Lagos', 'admin@alphacrest.test', 'active')`,
  ).run(ids.schoolId);

  const rolesSeed: Array<{ userId: string; email: string; name: string; roleId: string }> = [
    { userId: ids.adminUser, email: 'principal@alphacrest.test', name: 'Principal Ada', roleId: 'role_school_admin' },
    { userId: ids.teacherUser, email: 'teacher@alphacrest.test', name: 'Mr. Tunde Math', roleId: 'role_teacher' },
    { userId: ids.studentUser, email: 'student@alphacrest.test', name: 'Chidi Okeke', roleId: 'role_student' },
    { userId: ids.parentUser, email: 'parent@alphacrest.test', name: 'Mrs. Ngozi Okeke', roleId: 'role_parent' },
  ];
  for (const r of rolesSeed) {
    db.prepare(
      `INSERT INTO users (id, email, full_name, password_hash, user_type, is_active) VALUES (?, ?, ?, ?, 'school_member', 1)`,
    ).run(r.userId, r.email, r.name, pwHash);
    db.prepare(
      `INSERT INTO school_memberships (id, school_id, user_id, role_id, status) VALUES (?, ?, ?, ?, 'active')`,
    ).run(`mem_${crypto.randomUUID()}`, ids.schoolId, r.userId, r.roleId);
  }

  db.prepare(
    `INSERT INTO school_classes (id, school_id, name, code, level_order) VALUES (?, ?, 'JSS 1', 'JSS1', 1)`,
  ).run(ids.classId, ids.schoolId);

  db.prepare(
    `INSERT INTO subjects (id, school_id, name, code) VALUES (?, ?, 'Mathematics', 'MTH101')`,
  ).run(ids.subjectId, ids.schoolId);

  db.prepare(
    `INSERT INTO academic_sessions (id, school_id, name, term, start_date, end_date, is_current) VALUES (?, ?, '2026/2027', 'First Term', '2026-09-01', '2026-12-15', 1)`,
  ).run(ids.sessionId, ids.schoolId);

  db.prepare(
    `INSERT INTO academic_terms (id, school_id, academic_session_id, name, term_order, start_date, end_date, is_current, status) VALUES (?, ?, ?, 'First Term', 1, '2026-09-01', '2026-12-15', 1, 'active')`,
  ).run(ids.termId, ids.schoolId, ids.sessionId);

  db.prepare(`
    INSERT INTO students (id, school_id, user_id, admission_number, admission_date, first_name, last_name, date_of_birth, gender, student_email, current_class_id, status)
    VALUES (?, ?, ?, 'ALPH/2026/001', '2026-09-01', 'Chidi', 'Okeke', '2012-04-10', 'Male', 'student@alphacrest.test', ?, 'active')
  `).run(ids.studentProfile, ids.schoolId, ids.studentUser, ids.classId);

  db.prepare(`
    INSERT INTO teachers (id, school_id, user_id, staff_id_number, first_name, last_name, gender, email, employment_date, specialization)
    VALUES (?, ?, ?, 'STF-2026-01', 'Tunde', 'Balogun', 'Male', 'teacher@alphacrest.test', '2025-01-10', 'Mathematics')
  `).run(ids.teacherProfile, ids.schoolId, ids.teacherUser);

  db.prepare(`
    INSERT INTO teacher_subject_assignments (id, school_id, teacher_id, subject_id, class_id, academic_session_id, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(`tsa_${crypto.randomUUID()}`, ids.schoolId, ids.teacherProfile, ids.subjectId, ids.classId, ids.sessionId);

  db.prepare(`
    INSERT INTO parents (id, school_id, user_id, full_name, email, phone)
    VALUES (?, ?, ?, 'Mrs. Ngozi Okeke', 'parent@alphacrest.test', '+2348011122233')
  `).run(ids.parentProfile, ids.schoolId, ids.parentUser);

  db.prepare(`
    INSERT INTO student_guardians (id, school_id, student_id, parent_id, relationship, is_primary_guardian, can_view_academic_records)
    VALUES (?, ?, ?, ?, 'Mother', 1, 1)
  `).run(`sg_${crypto.randomUUID()}`, ids.schoolId, ids.studentProfile, ids.parentProfile);

  const secret = getOrCreateIdCardMasterSecret();
  db.prepare(`
    INSERT INTO student_id_cards (id, school_id, student_id, card_number, qr_token_hash, qr_token_encrypted, status, expires_at)
    VALUES (?, ?, ?, 'DT-IDC-2026-0001', ?, ?, 'active', '2030-01-01T00:00:00.000Z')
  `).run(
    `idc_${crypto.randomUUID()}`,
    ids.schoolId,
    ids.studentProfile,
    sha256Hex(ids.studentQrToken),
    encryptIdCardToken(ids.studentQrToken, secret),
  );

  const gradingId = `grd_${crypto.randomUUID()}`;
  db.prepare(`INSERT INTO grading_systems (id, school_id, name, is_default) VALUES (?, ?, 'Standard', 1)`).run(
    gradingId,
    ids.schoolId,
  );

  db.prepare(`
    INSERT INTO result_publications (id, school_id, academic_session_id, academic_term_id, class_id, student_id, grading_system_id, subjects_count, subjects_passed, total_score_obtained, total_max_possible, average_score, overall_grade, overall_remark, class_position, class_size, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 88, 100, 88.0, 'A', 'Excellent', 1, 20, 'published', datetime('now'))
  `).run(`pub_${crypto.randomUUID()}`, ids.schoolId, ids.sessionId, ids.termId, ids.classId, ids.studentProfile, gradingId);

  db.prepare(`
    INSERT INTO computed_results (id, school_id, academic_session_id, academic_term_id, class_id, student_id, subject_id, grading_system_id, ca_score, exam_score, total_score, percentage_score, grade, remark, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 34, 54, 88, 88, 'A', 'Excellent', 'published', datetime('now'))
  `).run(`cr_${crypto.randomUUID()}`, ids.schoolId, ids.sessionId, ids.termId, ids.classId, ids.studentProfile, ids.subjectId, gradingId);

  const feeCatId = `fcat_${crypto.randomUUID()}`;
  db.prepare(`INSERT INTO fee_categories (id, school_id, name, code) VALUES (?, ?, 'Tuition', 'TUI')`).run(
    feeCatId,
    ids.schoolId,
  );

  const feeStructId = `fs_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO fee_structures (id, school_id, fee_category_id, academic_session_id, academic_term_id, name, amount)
    VALUES (?, ?, ?, ?, ?, 'First Term Tuition', 150000)
  `).run(feeStructId, ids.schoolId, feeCatId, ids.sessionId, ids.termId);

  db.prepare(`
    INSERT INTO student_fee_assignments (id, school_id, student_id, fee_structure_id, base_amount, net_amount, amount_paid, balance_due, status)
    VALUES (?, ?, ?, ?, 150000, 150000, 100000, 50000, 'partial')
  `).run(`sfa_${crypto.randomUUID()}`, ids.schoolId, ids.studentProfile, feeStructId);
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Migration 013 integrity passes and Owner can configure universal bot token & username', async () => {
  const integrity = verifyDatabaseIntegrity();
  assert.equal(integrity.ok, true);

  const login = await api('/api/auth/workers/login', {
    method: 'POST',
    body: { email: 'owner@davetimi.test', password: 'PortalPass123!' },
  });
  assert.equal(login.status, 200);
  const ownerCookie = login.cookie!;

  const cfg = await api('/api/owner/telegram/configure', {
    method: 'POST',
    cookie: ownerCookie,
    body: { botToken: '998877:TEST_UNIVERSAL_TOKEN' },
  });
  assert.equal(cfg.status, 200);
  assert.equal(getBotToken(), '998877:TEST_UNIVERSAL_TOKEN');
  assert.equal(getBotUsername(), 'DaveTimiPortalBot');

  const pub = await api('/api/telegram/public-info');
  assert.equal(pub.status, 200);
  assert.equal(pub.json.enabled, true);
  assert.equal(pub.json.botUsername, 'DaveTimiPortalBot');
  assert.equal(pub.json.botUrl, 'https://t.me/DaveTimiPortalBot');
});

test('Unlinked /link enforces password verification before binding any chat ID', async () => {
  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      message: {
        chat: { id: 10001 },
        text: '/link student@alphacrest.test WrongPass!',
        from: { username: 'bad_actor' },
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '10001' && c.text.includes('Invalid password')));
  const db = getDb();
  const row = db.prepare(`SELECT * FROM telegram_links WHERE telegram_chat_id = '10001'`).get();
  assert.equal(row, undefined);
});

test('All 5 user groups can link, view role actions, and sign in via 1-click /auth/telegram-callback', async () => {
  // 1. Student links via /idlogin with DTID QR token and inspects /results, /fees, /idcard
  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      message: {
        chat: { id: 20001 },
        text: `/idlogin ${ids.studentQrToken}`,
        from: { username: 'chidi_stu' },
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20001' && c.text.includes('Chidi Okeke')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20001 }, text: '/results', from: { username: 'chidi_stu' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20001' && c.text.includes('Mathematics') && c.text.includes('88')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20001 }, text: '/fees', from: { username: 'chidi_stu' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20001' && c.text.includes('First Term Tuition') && c.text.includes('50000')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20001 }, text: '/idcard', from: { username: 'chidi_stu' } } },
    baseUrl,
  );
  const studentIdCardCall = sentCalls.find(
    (c) => c.chatId === '20001' && c.isPhoto && c.text.includes('DT-IDC-2026-0001'),
  );
  assert.ok(studentIdCardCall);
  assert.equal(studentIdCardCall.photoFilename, 'student-id-card.png');
  assert.ok(studentIdCardCall.photoBuffer && studentIdCardCall.photoBuffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  assert.equal(studentIdCardCall.photoBuffer.readUInt32BE(16), 856);
  assert.equal(studentIdCardCall.photoBuffer.readUInt32BE(20), 540);

  // 2. Student triggers /login and exchanges magic link for real auth_sessions cookie + redirect
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20001 }, text: '/login', from: { username: 'chidi_stu' } } },
    baseUrl,
  );
  const loginMsg = sentCalls.find((c) => c.chatId === '20001' && c.text.includes('/auth/telegram-callback?token='));
  assert.ok(loginMsg, 'Magic login message should contain callback URL');
  const tokenMatch = loginMsg.text.match(/token=([^\s\n]+)/);
  assert.ok(tokenMatch?.[1]);

  const cbRes = await api(`/auth/telegram-callback?token=${tokenMatch[1]}`);
  assert.equal(cbRes.status, 302);
  assert.equal(cbRes.res.headers.get('location'), '/dashboard/student');
  assert.ok(cbRes.cookie, 'Callback must set dt_edtech_session HTTP-only cookie');

  // Reusing same magic token must be rejected
  const replay = await api(`/auth/telegram-callback?token=${tokenMatch[1]}`);
  assert.equal(replay.status, 401);

  // Student session works on /api/auth/session
  const sessCheck = await api('/api/auth/session', { cookie: cbRes.cookie! });
  assert.equal(sessCheck.json.authenticated, true);
  assert.equal(sessCheck.json.user.roleCode, 'student');

  // 3. Parent links via /link and views /wards + /results
  await handleTelegramUpdate(
    { message: { chat: { id: 20002 }, text: '/link parent@alphacrest.test PortalPass123!', from: { username: 'ngozi_mom' } } },
    baseUrl,
  );
  await handleTelegramUpdate(
    { message: { chat: { id: 20002 }, text: '/wards', from: { username: 'ngozi_mom' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20002' && c.text.includes('Chidi Okeke') && c.text.includes('Mother')));

  // 4. Teacher links by Staff ID and marks student Present via /checkin <DTID-...>
  await handleTelegramUpdate(
    { message: { chat: { id: 20003 }, text: '/link STF-2026-01 PortalPass123!', from: { username: 'tunde_tch' } } },
    baseUrl,
  );
  await handleTelegramUpdate(
    { message: { chat: { id: 20003 }, text: '/classes', from: { username: 'tunde_tch' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20003' && c.text.includes('Mathematics')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20003 }, text: `/checkin ${ids.studentQrToken}`, from: { username: 'tunde_tch' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20003' && c.text.includes('Attendance Marked Present')));
  const attCount = (getDb().prepare(`SELECT COUNT(*) AS c FROM attendance_records WHERE student_id = ?`).get(ids.studentProfile) as { c: number }).c;
  assert.equal(attCount, 1);

  // 5. School Admin links and views /overview + /finance
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/link principal@alphacrest.test PortalPass123!', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/finance', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Total Billed') && c.text.includes('50,000')));

  // 6. Platform Owner generates 1-click connect token via POST /api/auth/telegram-connect-token & activates via /start link_<token>
  const ownerLogin = await api('/api/auth/workers/login', {
    method: 'POST',
    body: { email: 'owner@davetimi.test', password: 'PortalPass123!' },
  });
  const ownerCookie = ownerLogin.cookie!;
  const connectRes = await api('/api/auth/telegram-connect-token', {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(connectRes.status, 201);
  assert.ok(String(connectRes.json.command).startsWith('/start link_'));
  assert.ok(String(connectRes.json.deepLinkUrl).includes('https://t.me/DaveTimiPortalBot?start=link_'));

  await handleTelegramUpdate(
    { message: { chat: { id: 20005 }, text: connectRes.json.command, from: { username: 'david_owner' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20005' && c.text.includes('David Owner')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20005 }, text: '/schools', from: { username: 'david_owner' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20005' && c.text.includes('Alpha Crest College')));

  // 7. Verify Owner Telegram Management API lists all 5 roles accurately
  const statusRes = await api('/api/owner/telegram/status', { cookie: ownerCookie });
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.json.stats.totalLinks, 5);
  assert.equal(statusRes.json.stats.studentLinks, 1);
  assert.equal(statusRes.json.stats.parentLinks, 1);
  assert.equal(statusRes.json.stats.teacherLinks, 1);
  assert.equal(statusRes.json.stats.adminLinks, 1);
  assert.equal(statusRes.json.stats.workforceLinks, 1);

  const linksRes = await api('/api/owner/telegram/links', { cookie: ownerCookie });
  assert.equal(linksRes.status, 200);
  assert.equal(linksRes.json.links.length, 5);
  assert.ok(linksRes.json.links.every((row: any) => Boolean(row.user_full_name) && Boolean(row.identifier)));
});

test('Portal notifications forward to matching linked Telegram users without cross-tenant leaks', async () => {
  const db = getDb();
  const otherSchoolId = `sch_other_${crypto.randomUUID()}`;
  const otherUserId = `usr_other_${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO schools (id, name, slug, code, country, city, contact_email, status) VALUES (?, 'Beta Academy', 'beta-academy', 'DT-BETA01', 'Nigeria', 'Abuja', 'admin@beta.test', 'active')`,
  ).run(otherSchoolId);
  db.prepare(
    `INSERT INTO users (id, email, full_name, password_hash, user_type, is_active) VALUES (?, 'other@beta.test', 'Beta Admin', ?, 'school_member', 1)`,
  ).run(otherUserId, hashPassword('PortalPass123!'));
  db.prepare(
    `INSERT INTO telegram_links (telegram_chat_id, user_id, school_id, profile_id, auth_environment, role, username) VALUES ('29999', ?, ?, NULL, 'school', 'school_admin', 'beta_admin')`,
  ).run(otherUserId, otherSchoolId);

  sentCalls.length = 0;
  await createNotificationRecord({
    schoolId: ids.schoolId,
    scope: 'teacher',
    targetRoleCode: 'teacher',
    createdByUserId: ids.adminUser,
    createdByName: 'Principal Ada',
    title: 'Staff Meeting_Notice',
    body: 'Submit term CA scores before Friday.',
    severity: 'notice',
  });

  // Only Alpha Crest teacher (20003) should receive the teacher-scoped alert
  assert.equal(sentCalls.filter((c) => c.chatId === '20003' && c.text.includes('Staff Meeting')).length, 1);
  assert.equal(sentCalls.filter((c) => c.chatId === '20001').length, 0);
  assert.equal(sentCalls.filter((c) => c.chatId === '29999').length, 0);

  // Platform broadcast reaches everyone including Beta Academy
  sentCalls.length = 0;
  await createNotificationRecord({
    schoolId: null,
    scope: 'platform',
    createdByUserId: ids.ownerUser,
    createdByName: 'David Owner',
    title: 'Scheduled Maintenance',
    body: 'Brief maintenance window tonight.',
    severity: 'urgent',
  });
  assert.ok(sentCalls.some((c) => c.chatId === '20001' && c.text.includes('Scheduled Maintenance')));
  assert.ok(sentCalls.some((c) => c.chatId === '29999' && c.text.includes('Scheduled Maintenance')));
});

test('Users can inspect GET /api/auth/telegram-status and disconnect via DELETE /api/auth/telegram-link', async () => {
  const stuLogin = await api('/api/auth/school/login', {
    method: 'POST',
    body: { email: 'student@alphacrest.test', password: 'PortalPass123!', schoolCode: 'DT-ALPH01' },
  });
  assert.equal(stuLogin.status, 200);
  const stuCookie = stuLogin.cookie!;

  const statusBefore = await api('/api/auth/telegram-status', { cookie: stuCookie });
  assert.equal(statusBefore.status, 200);
  assert.equal(statusBefore.json.linked, true);
  assert.equal(statusBefore.json.links[0].chatId, '20001');
  assert.equal(statusBefore.json.links[0].username, 'chidi_stu');

  const delRes = await api('/api/auth/telegram-link', {
    method: 'DELETE',
    cookie: stuCookie,
  });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.json.ok, true);
  assert.equal(delRes.json.removedCount, 1);

  const statusAfter = await api('/api/auth/telegram-status', { cookie: stuCookie });
  assert.equal(statusAfter.status, 200);
  assert.equal(statusAfter.json.linked, false);
  assert.equal(statusAfter.json.links.length, 0);
});

test('POST /api/owner/telegram/configure saves valid token even when Telegram setWebhook returns 429', async () => {
  const login = await api('/api/auth/workers/login', {
    method: 'POST',
    body: { email: 'owner@davetimi.test', password: 'PortalPass123!' },
  });
  const ownerCookie = login.cookie!;

  try {
    simulateSetWebhook429 = true;
    const cfg = await api('/api/owner/telegram/configure', {
      method: 'POST',
      cookie: ownerCookie,
      body: { botToken: '998877:RATE_LIMITED_TOKEN_SAVE' },
    });
    assert.equal(cfg.status, 200);
    assert.equal(cfg.json.success, true);
    assert.equal(cfg.json.webhookRegistered, false);
    assert.equal(cfg.json.retryAfterSeconds, 32);
    assert.equal(getBotToken(), '998877:RATE_LIMITED_TOKEN_SAVE');
  } finally {
    simulateSetWebhook429 = false;
  }
});

test('School Admin can register students (with photo & auto account), teachers, parents, and upload photos via Telegram Bot', async () => {
  const db = getDb();
  sentCalls.length = 0;

  // 1. Register student with full name, class selection, gender, auto-credentials, and passport photo
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/regstudent', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes("student's *Full Name*")));

  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: 'Amaka Okon', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('class level') && c.inlineKeyboard));

  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_cls_1',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 101, chat: { id: 20004 } },
        data: `reg_stu_cls:${ids.classId}`,
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('gender')));

  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_gen_1',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 102, chat: { id: 20004 } },
        data: 'reg_stu_gen:female',
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Portal Account')));

  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_acc_1',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 103, chat: { id: 20004 } },
        data: 'reg_stu_acc:auto',
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Passport / Profile Photo')));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      message: {
        chat: { id: 20004 },
        from: { username: 'ada_admin' },
        photo: [
          { file_id: 'thumb_amaka', file_size: 50, width: 90, height: 90 },
          { file_id: 'passport_amaka_hi_res', file_size: 150, width: 300, height: 300 },
        ],
      },
    },
    baseUrl,
  );

  const regPhotoCall = sentCalls.find((c) => c.chatId === '20004' && c.isPhoto && c.text.includes('Amaka Okon'));
  assert.ok(regPhotoCall, 'Telegram Bot must send Digital ID card pass with confirmation caption');
  assert.equal(regPhotoCall.photoFilename, 'student-id-card.png');
  assert.ok(regPhotoCall.photoBuffer && regPhotoCall.photoBuffer.readUInt32BE(16) === 856 && regPhotoCall.photoBuffer.readUInt32BE(20) === 540);
  assert.ok(regPhotoCall.text.includes('Student Successfully Registered & Provisioned'));
  assert.ok(regPhotoCall.text.includes('Uploaded & Verified'));
  assert.ok(regPhotoCall.text.includes('Portal Login:'));
  assert.ok(regPhotoCall.text.includes('Temporary Password:'));

  const amakaRow = db.prepare(`SELECT * FROM students WHERE first_name = 'Amaka' AND last_name = 'Okon'`).get() as any;
  assert.ok(amakaRow);
  assert.ok(amakaRow.admission_number);
  assert.equal(amakaRow.gender, 'Female');
  assert.equal(amakaRow.current_class_id, ids.classId);
  assert.ok(amakaRow.photo_file_id, 'Student photo_file_id should be populated from Telegram upload');
  assert.ok(amakaRow.user_id, 'User account should be provisioned');

  const amakaUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(amakaRow.user_id) as any;
  assert.ok(amakaUser);
  assert.equal(amakaUser.full_name, 'Amaka Okon');
  assert.equal(amakaUser.is_active, 1);

  const amakaMembership = db
    .prepare(`SELECT * FROM school_memberships WHERE school_id = ? AND user_id = ?`)
    .get(ids.schoolId, amakaRow.user_id) as any;
  assert.ok(amakaMembership);
  assert.equal(amakaMembership.role_id, 'role_student');

  const amakaIdCard = db
    .prepare(`SELECT * FROM student_id_cards WHERE student_id = ? AND status = 'active'`)
    .get(amakaRow.id) as any;
  assert.ok(amakaIdCard);
  assert.ok(amakaIdCard.card_number);

  const amakaEnrollment = db
    .prepare(`SELECT * FROM class_enrollments WHERE student_id = ? AND class_id = ?`)
    .get(amakaRow.id, ids.classId) as any;
  assert.ok(amakaEnrollment);

  const amakaAudit = db
    .prepare(`SELECT * FROM audit_logs WHERE action = 'school.student.created' AND resource_id = ?`)
    .get(amakaRow.id) as any;
  assert.ok(amakaAudit);

  // 2. Register student with name passed as command argument and photo skipped
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/regstudent David Adeleke', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('David Adeleke') && c.text.includes('class level')));

  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_cls_2',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 104, chat: { id: 20004 } },
        data: `reg_stu_cls:${ids.classId}`,
      },
    },
    baseUrl,
  );
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_gen_2',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 105, chat: { id: 20004 } },
        data: 'reg_stu_gen:male',
      },
    },
    baseUrl,
  );
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_acc_2',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 106, chat: { id: 20004 } },
        data: 'reg_stu_acc:none',
      },
    },
    baseUrl,
  );
  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_stu_photo_skip',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 107, chat: { id: 20004 } },
        data: 'reg_stu_photo:skip',
      },
    },
    baseUrl,
  );

  const davidRow = db.prepare(`SELECT * FROM students WHERE first_name = 'David' AND last_name = 'Adeleke'`).get() as any;
  assert.ok(davidRow);
  assert.equal(davidRow.photo_file_id, null, 'Skipped photo must result in null photo_file_id');
  assert.equal(davidRow.user_id, null, 'Skipped portal account must result in null user_id');

  // 3. Register teacher with auto staff ID and portal account
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/regteacher Grace Danjuma', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Subject Specialization')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: 'Physics & Chemistry', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Teacher Portal Credentials')));

  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_tch_acc_1',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 108, chat: { id: 20004 } },
        data: 'reg_tch_acc:auto',
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Teacher Profile Photo')));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_tch_skip_photo',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 109, chat: { id: 20004 } },
        data: 'reg_tch_photo:skip',
      },
    },
    baseUrl,
  );

  const tchMsg = sentCalls.find((c) => c.chatId === '20004' && c.text.includes('Faculty Teacher Registered & Provisioned'));
  assert.ok(tchMsg);
  assert.ok(tchMsg.text.includes('Grace Danjuma'));
  assert.ok(tchMsg.text.includes('Staff ID:'));
  assert.ok(tchMsg.text.includes('Temporary Password:'));

  const graceRow = db.prepare(`SELECT * FROM teachers WHERE first_name = 'Grace' AND last_name = 'Danjuma'`).get() as any;
  assert.ok(graceRow);
  assert.equal(graceRow.specialization, 'Physics & Chemistry');
  assert.ok(graceRow.staff_id_number.startsWith('TCH-'));

  const graceMembership = db
    .prepare(`SELECT * FROM school_memberships WHERE school_id = ? AND user_id = ?`)
    .get(ids.schoolId, graceRow.user_id) as any;
  assert.ok(graceMembership);
  assert.equal(graceMembership.role_id, 'role_teacher');

  // 4. Register parent and link student ward
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/regparent', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Register New Parent / Guardian')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: 'Chief Obi Okon', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Email')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '+2348022233445, obi.okon@family.test', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Link Student Ward')));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: amakaRow.admission_number, from: { username: 'ada_admin' } } },
    baseUrl,
  );

  const parMsg = sentCalls.find((c) => c.chatId === '20004' && c.text.includes('Parent / Guardian Registered Successfully'));
  assert.ok(parMsg);
  assert.ok(parMsg.text.includes('Chief Obi Okon'));
  assert.ok(parMsg.text.includes('Amaka Okon'));

  const parentRow = db.prepare(`SELECT * FROM parents WHERE full_name = 'Chief Obi Okon'`).get() as any;
  assert.ok(parentRow);
  assert.equal(parentRow.phone, '+2348022233445');
  assert.equal(parentRow.email, 'obi.okon@family.test');

  const guardianRow = db
    .prepare(`SELECT * FROM student_guardians WHERE student_id = ? AND parent_id = ?`)
    .get(amakaRow.id, parentRow.id) as any;
  assert.ok(guardianRow);

  // 5. Upload passport photo for existing member (David Adeleke) via /uploadphoto
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/uploadphoto', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Upload Passport / Profile Photo')));

  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: davidRow.admission_number, from: { username: 'ada_admin' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '20004' && c.text.includes('Found Student:')));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      message: {
        chat: { id: 20004 },
        from: { username: 'ada_admin' },
        document: {
          file_id: 'doc_david_passport',
          file_name: 'david_passport.jpg',
          mime_type: 'image/jpeg',
          file_size: 150,
        },
      },
    },
    baseUrl,
  );

  const photoUploadedMsg = sentCalls.find((c) => c.chatId === '20004' && c.text.includes('Passport Photo Updated'));
  assert.ok(photoUploadedMsg);
  assert.ok(photoUploadedMsg.text.includes('David Adeleke'));

  const updatedDavid = db.prepare(`SELECT photo_file_id FROM students WHERE id = ?`).get(davidRow.id) as any;
  assert.ok(updatedDavid.photo_file_id, 'Photo file ID must now be populated for David');

  // 6. Directory listings & Digital ID Card QR inspection
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/students', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  const studentsListMsg = sentCalls.find((c) => c.chatId === '20004' && c.text.includes('Recent Students —'));
  assert.ok(studentsListMsg);
  assert.ok(studentsListMsg.text.includes('Amaka Okon'));
  assert.ok(studentsListMsg.text.includes('David Adeleke'));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20004 }, text: '/teachers', from: { username: 'ada_admin' } } },
    baseUrl,
  );
  const teachersListMsg = sentCalls.find((c) => c.chatId === '20004' && c.text.includes('Faculty Teachers —'));
  assert.ok(teachersListMsg);
  assert.ok(teachersListMsg.text.includes('Grace Danjuma'));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_view_id_amaka',
        from: { id: 20004, username: 'ada_admin' },
        message: { message_id: 110, chat: { id: 20004 } },
        data: `menu:view_id:${amakaRow.id}`,
      },
    },
    baseUrl,
  );
  const viewIdPhotoCall = sentCalls.find((c) => c.chatId === '20004' && c.isPhoto && c.text.includes('Amaka Okon'));
  assert.ok(viewIdPhotoCall, 'Admin can view and retrieve any student Digital ID Card photo');
  assert.equal(viewIdPhotoCall.photoFilename, 'student-id-card.png');
  assert.ok(viewIdPhotoCall.photoBuffer && viewIdPhotoCall.photoBuffer.readUInt32BE(16) === 856 && viewIdPhotoCall.photoBuffer.readUInt32BE(20) === 540);
  assert.ok(viewIdPhotoCall.text.includes(amakaRow.admission_number));

  // 7. Direct renderer verification with & without photo
  const amakaCardPng = await renderStudentIdCardPngBuffer(amakaRow.id, ids.schoolId);
  assert.ok(amakaCardPng && amakaCardPng.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  assert.equal(amakaCardPng.readUInt32BE(16), 856);
  assert.equal(amakaCardPng.readUInt32BE(20), 540);

  // David also received a photo via /uploadphoto above; verify his full ID card renders cleanly
  const davidCardPng = await renderStudentIdCardPngBuffer(davidRow.id, ids.schoolId);
  assert.ok(davidCardPng && davidCardPng.readUInt32BE(16) === 856 && davidCardPng.readUInt32BE(20) === 540);

  // Parent (/idcard) receives ward ID card selector or direct card
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 20002 }, text: '/idcard', from: { username: 'ngozi_par' } } },
    baseUrl,
  );
  const parentCardCall = sentCalls.find((c) => c.chatId === '20002' && c.isPhoto && c.photoFilename === 'student-id-card.png');
  assert.ok(parentCardCall, 'Linked parent receives full Digital Student ID Card PNG for their single ward');
});

test('Interactive Telegram login supports formatted emails, card serials, single-message credentials, password retries, and helpful errors', async () => {
  const db = getDb();

  // 1. Unlinked user tapping Sign In -> school code gives specific hint & keeps awaiting_identifier
  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_start_link_edge',
        from: { id: 30001, username: 'edge_user' },
        message: { message_id: 201, chat: { id: 30001 } },
        data: 'auth:start_link',
      },
    },
    baseUrl,
  );
  await handleTelegramUpdate(
    { message: { chat: { id: 30001 }, text: 'DT-ALPH01', from: { username: 'edge_user' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30001' && c.text.includes('School Code')));

  // 2. Unprovisioned student admission number gives clear portal-login-not-enabled hint
  const davidRow = db.prepare(`SELECT admission_number FROM students WHERE first_name = 'David' AND last_name = 'Adeleke'`).get() as any;
  assert.ok(davidRow);
  await handleTelegramUpdate(
    { message: { chat: { id: 30001 }, text: davidRow.admission_number, from: { username: 'edge_user' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30001' && c.text.includes('portal login is not enabled')));

  // 3. Formatted mailto:<email> + wrong password retries without losing state, then succeeds on retry
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 30001 }, text: '<mailto:principal@alphacrest.test>', from: { username: 'edge_user' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30001' && c.text.includes('Now enter your *portal password*')));

  await handleTelegramUpdate(
    { message: { chat: { id: 30001 }, text: 'WrongPass1', from: { username: 'edge_user' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30001' && c.text.includes('Try entering your password again')));

  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 30001 }, text: 'PortalPass123!', from: { username: 'edge_user' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30001' && c.text.includes('Verified & Linked')));
  const linked30001 = db.prepare(`SELECT role FROM telegram_links WHERE telegram_chat_id = '30001'`).get() as any;
  assert.equal(linked30001?.role, 'school_admin');

  // 4. Single-message "identifier password" directly from awaiting_identifier or unlinked prompt works cleanly
  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_start_link_pair',
        from: { id: 30002, username: 'pair_user' },
        message: { message_id: 202, chat: { id: 30002 } },
        data: 'auth:start_link',
      },
    },
    baseUrl,
  );
  await handleTelegramUpdate(
    { message: { chat: { id: 30002 }, text: 'DT-IDC-2026-0001 PortalPass123!', from: { username: 'pair_user' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30002' && c.text.includes('Verified & Linked')));
  const linked30002 = db.prepare(`SELECT role FROM telegram_links WHERE telegram_chat_id = '30002'`).get() as any;
  assert.equal(linked30002?.role, 'student');

  // 5. Unlinked user typing their email directly without clicking Sign In first transitions cleanly to password step
  sentCalls.length = 0;
  await handleTelegramUpdate(
    { message: { chat: { id: 30003 }, text: 'teacher@alphacrest.test', from: { username: 'tch_direct' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30003' && c.text.includes('Enter your *portal password*')));
  await handleTelegramUpdate(
    { message: { chat: { id: 30003 }, text: 'PortalPass123!', from: { username: 'tch_direct' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30003' && c.text.includes('Verified & Linked')));
  const linked30003 = db.prepare(`SELECT role FROM telegram_links WHERE telegram_chat_id = '30003'`).get() as any;
  assert.equal(linked30003?.role, 'teacher');
});

test('Platform Owner interactive login supports formatted emails and detects unclaimed owner state when schools exist', async () => {
  assert.equal(normalizeLoginIdentifier('<mailto:owner@davetimi.test>'), 'owner@davetimi.test');
  assert.equal(normalizeLoginIdentifier('[Owner](mailto:owner@davetimi.test)'), 'owner@davetimi.test');
  assert.equal(normalizeLoginIdentifier('Email: "owner@davetimi.test."'), 'owner@davetimi.test');

  const db = getDb();

  // 1. Platform Owner logs in interactively using "Email: <email>" formatting
  sentCalls.length = 0;
  await handleTelegramUpdate(
    {
      callback_query: {
        id: 'cb_owner_login_1',
        from: { id: 30004, username: 'owner_interactive' },
        message: { message_id: 301, chat: { id: 30004 } },
        data: 'auth:start_link',
      },
    },
    baseUrl,
  );
  await handleTelegramUpdate(
    {
      message: {
        chat: { id: 30004 },
        text: 'Email: [owner@davetimi.test](mailto:owner@davetimi.test)',
        from: { username: 'owner_interactive' },
      },
    },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30004' && c.text.includes('owner@davetimi.test')));

  await handleTelegramUpdate(
    { message: { chat: { id: 30004 }, text: 'PortalPass123!', from: { username: 'owner_interactive' } } },
    baseUrl,
  );
  assert.ok(sentCalls.some((c) => c.chatId === '30004' && c.text.includes('Verified & Linked')));
  const linkedOwner = db.prepare(`SELECT role FROM telegram_links WHERE telegram_chat_id = '30004'`).get() as any;
  assert.equal(linkedOwner?.role, 'platform_owner');

  // 2. When school accounts exist (users > 0) but Platform Owner has not been claimed yet, bot clearly warns and points to /login/workers
  const savedAssignment = db
    .prepare(`SELECT * FROM workforce_assignments WHERE user_id = ?`)
    .get(ids.ownerUser) as any;
  assert.ok(savedAssignment);

  try {
    db.prepare(`DELETE FROM workforce_assignments WHERE role_id = 'role_platform_owner'`).run();
    sentCalls.length = 0;
    await handleTelegramUpdate(
      { message: { chat: { id: 30005 }, text: 'unclaimed.owner@school.org', from: { username: 'new_owner' } } },
      baseUrl,
    );
    const unclaimedMsg = sentCalls.find((c) => c.chatId === '30005');
    assert.ok(unclaimedMsg);
    assert.ok(unclaimedMsg.text.includes('No Platform Owner account is claimed in this database yet'));
    assert.ok(unclaimedMsg.text.includes(`${baseUrl}/login/workers`));
  } finally {
    db.prepare(`
      INSERT INTO workforce_assignments (id, user_id, role_id, department, clearance_level)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      savedAssignment.id,
      savedAssignment.user_id,
      savedAssignment.role_id,
      savedAssignment.department,
      savedAssignment.clearance_level,
    );
  }
});

test('Telegram /setupowner command initializes platform owner when none exists', async () => {
  const db = getDb();
  const savedAssignment = db
    .prepare(`SELECT * FROM workforce_assignments WHERE role_id = 'role_platform_owner'`)
    .get() as any;

  try {
    db.prepare(`DELETE FROM workforce_assignments WHERE role_id = 'role_platform_owner'`).run();
    sentCalls.length = 0;
    await handleTelegramUpdate(
      { message: { chat: { id: 30006 }, text: '/setupowner', from: { username: 'setup_owner' } } },
      baseUrl,
    );
    const setupMsg = sentCalls.find((c) => c.chatId === '30006');
    assert.ok(setupMsg);
    assert.ok(setupMsg.text.includes('Platform Owner Initial Setup'));

    await handleTelegramUpdate(
      { message: { chat: { id: 30006 }, text: 'new.owner@davetimi.test', from: { username: 'setup_owner' } } },
      baseUrl,
    );
    await handleTelegramUpdate(
      { message: { chat: { id: 30006 }, text: 'SecurePass123!', from: { username: 'setup_owner' } } },
      baseUrl,
    );
    await handleTelegramUpdate(
      { message: { chat: { id: 30006 }, text: 'New Owner Name', from: { username: 'setup_owner' } } },
      baseUrl,
    );

    const successMsg = sentCalls.find((c) => c.chatId === '30006' && c.text.includes('Successfully Initialized'));
    assert.ok(successMsg);

    const newOwnerLink = db.prepare(`SELECT role FROM telegram_links WHERE telegram_chat_id = '30006'`).get() as any;
    assert.equal(newOwnerLink?.role, 'platform_owner');
  } finally {
    db.prepare(`DELETE FROM workforce_assignments WHERE role_id = 'role_platform_owner'`).run();
    db.prepare(`
      INSERT INTO workforce_assignments (id, user_id, role_id, department, clearance_level)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      savedAssignment.id,
      savedAssignment.user_id,
      savedAssignment.role_id,
      savedAssignment.department,
      savedAssignment.clearance_level,
    );
  }
});

