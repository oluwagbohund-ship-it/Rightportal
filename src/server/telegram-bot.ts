import { getDb } from '../db/client.ts';
import crypto from 'node:crypto';

export function getBotToken(): string | null {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  try {
    const db = getDb();
    const row = db.prepare(`SELECT value_json FROM platform_settings WHERE key = 'telegram_bot_token'`).get() as any;
    if (row?.value_json) {
      try {
        return JSON.parse(row.value_json) || row.value_json;
      } catch {
        return row.value_json;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function sendTelegramMessage(chatId: string | number, text: string, parseMode = 'Markdown'): Promise<boolean> {
  const token = getBotToken();
  if (!token) {
    console.log(`[TelegramBot] Mock send to chat ${chatId}: ${text}`);
    return true;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  } catch (err) {
    console.error('[TelegramBot] Failed to send message:', err);
    return false;
  }
}

export async function handleTelegramUpdate(update: any): Promise<void> {
  const message = update?.message || update?.edited_message;
  if (!message || !message.text) return;

  const chatId = String(message.chat.id);
  const text = String(message.text).trim();
  const username = message.from?.username || message.from?.first_name || 'User';

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1);

  const db = getDb();

  switch (command) {
    case '/start':
    case '/help': {
      await sendTelegramMessage(
        chatId,
        `🤖 *Dave Timi EdTech Bot*\n\nWelcome *${username}*! Manage your school portal right here in Telegram.\n\n` +
          `*Commands:*\n` +
          `• \`/link <AccessCodeOrEmail>\` - Link your portal account\n` +
          `• \`/login\` - Generate a quick portal login link\n` +
          `• \`/attendance\` - View your attendance record\n` +
          `• \`/results\` - Check your latest academic results\n` +
          `• \`/fees\` - Check fee & payment status\n` +
          `• \`/idcard\` - View Digital ID Card & QR info\n` +
          `• \`/status\` - Check link status\n` +
          `• \`/unlink\` - Unlink this Telegram account`,
      );
      break;
    }

    case '/link': {
      const query = args.join(' ').trim();
      if (!query) {
        await sendTelegramMessage(
          chatId,
          `⚠️ Please provide your portal access code, admission/staff number, or email.\nExample: \`/link STU-2026-0001\``,
        );
        return;
      }

      // Search user across students, teachers, staff
      const student = db
        .prepare(`
          SELECT s.*, (s.first_name || ' ' || s.last_name) as full_name, sc.name as school_name 
          FROM students s 
          JOIN schools sc ON s.school_id = sc.id 
          LEFT JOIN users u ON s.user_id = u.id
          WHERE s.student_email = ? OR u.email = ? OR s.admission_number = ?
        `)
        .get(query, query, query) as any;

      if (student) {
        db.prepare(`
          INSERT INTO telegram_links (telegram_chat_id, user_id, school_id, role, username)
          VALUES (?, ?, ?, 'student', ?)
          ON CONFLICT(telegram_chat_id) DO UPDATE SET user_id=excluded.user_id, school_id=excluded.school_id, role='student', username=excluded.username
        `).run(chatId, student.id, student.school_id, username);

        await sendTelegramMessage(
          chatId,
          `✅ *Successfully Linked!*\n\nSchool: *${student.school_name}*\nStudent: *${student.full_name}* (${student.admission_number})\nRole: *Student*\n\nYou can now use \`/attendance\`, \`/results\`, \`/fees\`, and \`/idcard\`!`,
        );
        return;
      }

      const teacher = db
        .prepare(`
          SELECT t.*, (t.first_name || ' ' || t.last_name) as full_name, sc.name as school_name 
          FROM teachers t 
          JOIN schools sc ON t.school_id = sc.id 
          WHERE t.email = ? OR t.staff_id_number = ?
        `)
        .get(query, query) as any;

      if (teacher) {
        db.prepare(`
          INSERT INTO telegram_links (telegram_chat_id, user_id, school_id, role, username)
          VALUES (?, ?, ?, 'teacher', ?)
          ON CONFLICT(telegram_chat_id) DO UPDATE SET user_id=excluded.user_id, school_id=excluded.school_id, role='teacher', username=excluded.username
        `).run(chatId, teacher.id, teacher.school_id, username);

        await sendTelegramMessage(
          chatId,
          `✅ *Successfully Linked!*\n\nSchool: *${teacher.school_name}*\nTeacher: *${teacher.full_name}* (${teacher.staff_id_number})\nRole: *Teacher*\n\nUse \`/attendance\` or \`/login\` to access your workspace.`,
        );
        return;
      }

      await sendTelegramMessage(
        chatId,
        `❌ No matching student or teacher account found for \`${query}\`. Please check your admission number, staff ID, or portal email.`,
      );
      break;
    }

    case '/status': {
      const link = db.prepare(`SELECT tl.*, sc.name as school_name FROM telegram_links tl JOIN schools sc ON tl.school_id = sc.id WHERE tl.telegram_chat_id = ?`).get(chatId) as any;
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ This Telegram chat is not linked to any portal account. Use \`/link <your_code>\` to connect.`);
        return;
      }
      await sendTelegramMessage(
        chatId,
        `🔗 *Account Link Status*\n\nSchool: *${link.school_name}*\nRole: *${link.role.toUpperCase()}*\nLinked User ID: \`${link.user_id}\`\nLinked At: \`${link.linked_at}\``,
      );
      break;
    }

    case '/unlink': {
      db.prepare(`DELETE FROM telegram_links WHERE telegram_chat_id = ?`).run(chatId);
      await sendTelegramMessage(chatId, `🔌 Successfully unlinked your Telegram account from the portal.`);
      break;
    }

    case '/login': {
      const link = db.prepare(`SELECT * FROM telegram_links WHERE telegram_chat_id = ?`).get(chatId) as any;
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Please link your account first using \`/link <code_or_email>\`.`);
        return;
      }
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.prepare(`INSERT INTO session_tokens (token, user_id, school_id, role, expires_at) VALUES (?, ?, ?, ?, ?)`)
        .run(token, link.user_id, link.school_id, link.role, expiresAt);

      const appUrl = process.env.APP_URL || 'https://rightportal.edu';
      const loginUrl = `${appUrl}/auth/telegram-callback?token=${token}`;
      await sendTelegramMessage(
        chatId,
        `🔑 *Portal Quick Login*\n\nClick the secure link below to log in instantly (expires in 15 mins):\n\n[Login to Portal](${loginUrl})`,
      );
      break;
    }

    case '/attendance': {
      const link = db.prepare(`SELECT * FROM telegram_links WHERE telegram_chat_id = ?`).get(chatId) as any;
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Please link your account first using \`/link <code_or_email>\`.`);
        return;
      }
      if (link.role === 'student') {
        const records = db.prepare(`SELECT * FROM attendance_records WHERE student_id = ? ORDER BY date DESC LIMIT 5`).all(link.user_id) as any[];
        const stats = db.prepare(`SELECT status, COUNT(*) as cnt FROM attendance_records WHERE student_id = ? GROUP BY status`).all(link.user_id) as any[];
        
        let summary = `📊 *Attendance Summary*\n\n`;
        for (const s of stats) {
          summary += `• ${s.status}: *${s.cnt}*\n`;
        }
        summary += `\n*Recent 5 Records:*\n`;
        for (const r of records) {
          summary += `• ${r.date}: *${r.status}* ${r.remarks ? `(${r.remarks})` : ''}\n`;
        }
        await sendTelegramMessage(chatId, summary);
      } else {
        await sendTelegramMessage(chatId, `📊 Teacher attendance management is active. Please log in to the portal for class register entry.`);
      }
      break;
    }

    case '/results': {
      const link = db.prepare(`SELECT * FROM telegram_links WHERE telegram_chat_id = ?`).get(chatId) as any;
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Please link your account first using \`/link <code_or_email>\`.`);
        return;
      }
      if (link.role === 'student') {
        const results = db.prepare(`SELECT * FROM student_results WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`).all(link.user_id) as any[];
        if (results.length === 0) {
          await sendTelegramMessage(chatId, `📚 No published results found yet.`);
          return;
        }
        let msg = `📚 *Latest Academic Results*\n\n`;
        for (const res of results) {
          msg += `• Score: *${res.total_score || res.score}* | Grade: *${res.grade || 'N/A'}* (${res.assessment_type || 'Term'})\n`;
        }
        await sendTelegramMessage(chatId, msg);
      } else {
        await sendTelegramMessage(chatId, `📚 Please use the portal dashboard for result entry and publication.`);
      }
      break;
    }

    case '/fees': {
      const link = db.prepare(`SELECT * FROM telegram_links WHERE telegram_chat_id = ?`).get(chatId) as any;
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Please link your account first using \`/link <code_or_email>\`.`);
        return;
      }
      if (link.role === 'student') {
        const fees = db.prepare(`SELECT * FROM student_fee_dues WHERE student_id = ?`).all(link.user_id) as any[];
        const payments = db.prepare(`SELECT * FROM student_payments WHERE student_id = ? ORDER BY paid_at DESC LIMIT 5`).all(link.user_id) as any[];

        let msg = `💳 *Fee & Payment Status*\n\n`;
        msg += `*Fee Dues / Bills:*\n`;
        if (fees.length === 0) msg += `• No outstanding dues recorded.\n`;
        for (const f of fees) {
          msg += `• ${f.fee_item || 'School Fee'}: ₦${f.amount} - Status: *${f.status}*\n`;
        }

        msg += `\n*Recent Payments:*\n`;
        for (const p of payments) {
          msg += `• ₦${p.amount} paid on ${p.paid_at} (${p.status})\n`;
        }
        await sendTelegramMessage(chatId, msg);
      } else {
        await sendTelegramMessage(chatId, `💳 Fee management is available in the School Finance dashboard.`);
      }
      break;
    }

    case '/idcard': {
      const link = db.prepare(`SELECT * FROM telegram_links WHERE telegram_chat_id = ?`).get(chatId) as any;
      if (!link) {
        await sendTelegramMessage(chatId, `⚠️ Please link your account first using \`/link <code_or_email>\`.`);
        return;
      }
      if (link.role === 'student') {
        const idCard = db.prepare(`SELECT * FROM student_id_cards WHERE student_id = ?`).get(link.user_id) as any;
        const student = db.prepare(`SELECT *, (first_name || ' ' || last_name) as full_name FROM students WHERE id = ?`).get(link.user_id) as any;

        if (!idCard) {
          await sendTelegramMessage(chatId, `🆔 Digital ID card has not been generated for you yet. Ask your school admin.`);
          return;
        }

        await sendTelegramMessage(
          chatId,
          `🆔 *Digital Student ID Card*\n\n` +
            `Name: *${student.full_name}*\n` +
            `Admission No: \`${student.admission_number}\`\n` +
            `ID Card Serial: \`${idCard.card_number}\`\n` +
            `Status: *${idCard.status.toUpperCase()}*\n` +
            `QR Verification Hash: \`${idCard.qr_token.slice(0, 16)}...\``,
        );
      } else {
        await sendTelegramMessage(chatId, `🆔 Digital ID cards are issued for students.`);
      }
      break;
    }

    default:
      await sendTelegramMessage(chatId, `❓ Unknown command \`${command}\`. Type \`/help\` to see available commands.`);
  }
}
