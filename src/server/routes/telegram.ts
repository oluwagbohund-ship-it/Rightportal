import { Router } from 'express';
import { handleTelegramUpdate } from '../telegram-bot.ts';
import { getDb } from '../../db/client.ts';

const router = Router();

// Telegram Webhook endpoint
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    await handleTelegramUpdate(update);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Telegram] Webhook error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// Telegram Login Callback
router.get('/telegram-callback', (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    res.status(400).send('Invalid or missing Telegram login token.');
    return;
  }

  const db = getDb();
  const session = db.prepare(`SELECT * FROM session_tokens WHERE token = ? AND expires_at > datetime('now')`).get(token) as any;

  if (!session) {
    res.status(401).send('Telegram login token has expired or is invalid. Please request a new one using `/login` in Telegram.');
    return;
  }

  res.cookie('dt_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  const dashboardPath =
    session.role === 'student'
      ? '/student/overview'
      : session.role === 'teacher'
      ? '/teacher/workspace'
      : session.role === 'parent'
      ? '/parent/overview'
      : '/school/overview';

  res.redirect(dashboardPath);
});

// Get Telegram integration status & linked accounts count
router.get('/status', (req, res) => {
  try {
    const db = getDb();
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM telegram_links`).get() as any;
    
    const setting = db.prepare(`SELECT value_json FROM platform_settings WHERE key = 'telegram_bot_token'`).get() as any;
    let savedToken = '';
    if (setting) {
      try {
        savedToken = JSON.parse(setting.value_json) || '';
      } catch {
        savedToken = setting.value_json || '';
      }
    }
    const botConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN || savedToken);

    res.json({
      success: true,
      bot_configured: botConfigured,
      linked_accounts_count: countRow?.cnt || 0,
      bot_username: process.env.TELEGRAM_BOT_USERNAME || 'RightPortalBot',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Admin endpoint to configure Telegram Bot token and automatically set webhook
router.post('/configure', async (req, res) => {
  try {
    const { bot_token } = req.body;
    if (!bot_token || typeof bot_token !== 'string' || !bot_token.includes(':')) {
      res.status(400).json({ success: false, error: 'Invalid Telegram bot token format.' });
      return;
    }

    const cleanToken = bot_token.trim();

    // 1. Test bot token against Telegram getMe API
    const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const meData = (await meRes.json()) as any;

    if (!meData.ok) {
      res.status(400).json({ success: false, error: `Invalid Telegram token: ${meData.description || 'Unknown error'}` });
      return;
    }

    const botUsername = meData.result?.username || 'RightPortalBot';

    // 2. Automatically set Webhook
    // Determine public app URL from request headers or environment
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const appUrl = process.env.APP_URL || `${protocol}://${host}`;
    const webhookUrl = `${appUrl}/api/telegram/webhook`;

    const hookRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const hookData = (await hookRes.json()) as any;

    if (!hookData.ok) {
      res.status(400).json({ success: false, error: `Failed to set webhook: ${hookData.description || 'Unknown error'}` });
      return;
    }

    // 3. Save token in database platform_settings
    const db = getDb();
    db.prepare(`
      INSERT INTO platform_settings (key, value_json, updated_by)
      VALUES ('telegram_bot_token', ?, 'admin')
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = 'admin'
    `).run(JSON.stringify(cleanToken));

    res.json({
      success: true,
      bot_username: botUsername,
      webhook_url: webhookUrl,
      message: `Telegram bot @${botUsername} successfully configured and webhook connected!`,
    });
  } catch (err) {
    console.error('[Telegram Configure] Error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Internal error' });
  }
});

export default router;
