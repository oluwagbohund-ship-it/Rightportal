import { Router } from 'express';
import { getDb } from '../../db/client.ts';
import { recordAuditLog } from '../audit.ts';
import { getClientIp, isRequestHttps } from '../middleware.ts';
import { buildSessionCookieHeader } from '../security.ts';
import { createAuthSession } from '../session-service.ts';
import {
  consumeTelegramToken,
  getBotToken,
  getBotUsername,
  getDashboardPathForRole,
  handleTelegramUpdate,
  resolveBotUsername,
  resolveUserAccountContext,
} from '../telegram-bot.ts';

const router = Router();

function deriveBaseUrl(req: import('express').Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL' && configured.startsWith('http')) {
    return configured.replace(/\/$/, '');
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string' && forwardedProto.trim()
      ? forwardedProto.split(',')[0].trim()
      : req.protocol || 'http';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    typeof forwardedHost === 'string' && forwardedHost.trim()
      ? forwardedHost.split(',')[0].trim()
      : req.get('host') || 'localhost:3000';
  return `${proto}://${host}`.replace(/\/$/, '');
}

// Telegram Webhook endpoint (called directly by Telegram servers)
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    await handleTelegramUpdate(update, deriveBaseUrl(req));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Telegram] Webhook error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// Public metadata for login pages & portal discovery (never exposes tokens)
router.get('/public-info', async (_req, res) => {
  try {
    const botConfigured = Boolean(getBotToken());
    const botUsername = botConfigured ? await resolveBotUsername() : null;
    res.json({
      enabled: botConfigured,
      botUsername,
      botUrl: botUsername ? `https://t.me/${botUsername}` : null,
    });
  } catch {
    res.json({
      enabled: false,
      botUsername: null,
      botUrl: null,
    });
  }
});

// Telegram 1-Click Magic Login Callback (/auth/telegram-callback?token=...)
router.get('/telegram-callback', (req, res) => {
  const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!rawToken || rawToken.length < 16) {
    res
      .status(400)
      .type('html')
      .send(
        '<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:520px;margin:auto"><h2>Invalid Telegram Login Link</h2><p>This sign-in link is missing a valid token. Open the portal bot in Telegram and tap <strong>Open Portal (/login)</strong> to generate a fresh link.</p><p><a href="/login/school">Go to School Login</a> · <a href="/login/workers">Workforce Login</a></p></body></html>',
      );
    return;
  }

  const consumed = consumeTelegramToken(rawToken, 'magic_login');
  if (!consumed) {
    res
      .status(401)
      .type('html')
      .send(
        '<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:520px;margin:auto"><h2>Sign-In Link Expired or Already Used</h2><p>For security, Telegram magic sign-in links expire after 15 minutes and work only once. Return to Telegram and tap <strong>/login</strong> for a fresh link.</p><p><a href="/login/school">Go to School Login</a> · <a href="/login/workers">Workforce Login</a></p></body></html>',
      );
    return;
  }

  const account = resolveUserAccountContext(consumed.user_id);
  if (!account) {
    res
      .status(403)
      .type('html')
      .send(
        '<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:520px;margin:auto"><h2>Account Unavailable</h2><p>Your portal account or school tenant is currently inactive or suspended. Contact your administrator.</p><p><a href="/login/school">Go to School Login</a></p></body></html>',
      );
    return;
  }

  const ip = getClientIp(req) || 'unknown';
  const { rawToken: sessionToken, maxAgeSeconds } = createAuthSession({
    userId: account.userId,
    authEnvironment: account.authEnvironment,
    activeSchoolId: account.schoolId,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? '',
  });

  recordAuditLog({
    actorUserId: account.userId,
    actorEmail: account.email,
    actorRole: account.role,
    schoolId: account.schoolId,
    authEnvironment: account.authEnvironment,
    action: 'auth.telegram.magic_login_success',
    resourceType: 'session',
    outcome: 'success',
    ipAddress: ip,
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(sessionToken, {
      maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );

  res.redirect(getDashboardPathForRole(account.role));
});

// Summary status (without secrets)
router.get('/status', (_req, res) => {
  try {
    const db = getDb();
    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM telegram_links`).get() as {
      cnt: number;
    };
    const botConfigured = Boolean(getBotToken());
    const botUsername = getBotUsername();

    res.json({
      success: true,
      bot_configured: botConfigured,
      linked_accounts_count: countRow?.cnt || 0,
      bot_username: botUsername,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
