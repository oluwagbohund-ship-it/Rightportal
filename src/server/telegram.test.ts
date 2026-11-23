import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../db/client.ts';
import { getBotToken, handleTelegramUpdate } from './telegram-bot.ts';

test('Telegram bot helper retrieves token from database if environment variable is not present', () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO platform_settings (key, value_json, updated_by)
    VALUES ('telegram_bot_token', ?, 'test')
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run(JSON.stringify('123456:TEST_BOT_TOKEN_XYZ'));

  const token = getBotToken();
  assert.ok(token, 'Bot token should be retrieved');
  assert.ok(token.includes('123456'), 'Should match saved token');
});

test('Telegram bot handles unknown update gracefully without throwing', async () => {
  await assert.doesNotReject(async () => {
    await handleTelegramUpdate({});
    await handleTelegramUpdate({ message: null });
    await handleTelegramUpdate({ message: { text: null } });
  });
});

test('Telegram bot handles /help command without error', async () => {
  await assert.doesNotReject(async () => {
    await handleTelegramUpdate({
      message: {
        chat: { id: 987654321 },
        text: '/help',
        from: { username: 'test_student', first_name: 'Test' },
      },
    });
  });
});
