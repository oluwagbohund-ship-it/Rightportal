import fs from 'node:fs';
import { createCanvas, loadImage, type CanvasRenderingContext2D } from 'canvas';
import QRCode from 'qrcode';
import { getDb } from '../db/client.ts';
import { resolveConfinedStoragePath } from './file-storage.ts';
import { decryptIdCardToken, getOrCreateIdCardMasterSecret } from './id-card-helpers.ts';

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = '';
      }
      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  const consumedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumedWords < words.length && lines.length > 0) {
    const remaining = [lines[lines.length - 1], ...words.slice(consumedWords)].join(' ');
    let clipped = remaining;
    while (clipped.length > 3 && ctx.measureText(`${clipped}…`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    lines[lines.length - 1] = `${clipped}…`;
  }

  return lines.slice(0, maxLines);
}

export async function renderStudentIdCardPngBuffer(
  studentId: string,
  schoolId: string,
): Promise<Buffer | null> {
  try {
    const db = getDb();

    const student = db
      .prepare(`
        SELECT
          s.id,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.admission_number,
          s.gender,
          s.photo_file_id,
          c.name AS class_name,
          a.name AS arm_name
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.id = ? AND s.school_id = ?
      `)
      .get(studentId, schoolId) as
      | {
          id: string;
          first_name: string;
          middle_name: string | null;
          last_name: string;
          admission_number: string;
          gender: string;
          photo_file_id: string | null;
          class_name: string | null;
          arm_name: string | null;
        }
      | undefined;

    if (!student) return null;

    const school = db
      .prepare(`
        SELECT
          s.name,
          s.code,
          s.city,
          s.country,
          COALESCE(sp.motto, '') AS motto,
          sp.logo_file_id
        FROM schools s
        LEFT JOIN school_profiles sp ON sp.school_id = s.id
        WHERE s.id = ?
      `)
      .get(schoolId) as
      | {
          name: string;
          code: string;
          city: string;
          country: string;
          motto: string;
          logo_file_id: string | null;
        }
      | undefined;

    if (!school) return null;

    const card = db
      .prepare(`
        SELECT card_number, qr_token_encrypted, status, issued_at, expires_at
        FROM student_id_cards
        WHERE student_id = ? AND school_id = ? AND status = 'active'
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `)
      .get(studentId, schoolId) as
      | {
          card_number: string;
          qr_token_encrypted: string;
          status: string;
          issued_at: string;
          expires_at: string;
        }
      | undefined;

    if (!card) return null;

    const secret = getOrCreateIdCardMasterSecret();
    const rawQrToken = decryptIdCardToken(card.qr_token_encrypted, secret);
    if (!rawQrToken) return null;

    const width = 856;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Card Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Subtle institutional watermark grid in body
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 124, width, height - 124);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(16, 134, width - 32, height - 150);

    // Institutional Header Gradient
    const headerHeight = 118;
    const headerGrad = ctx.createLinearGradient(0, 0, width, headerHeight);
    headerGrad.addColorStop(0, '#0F172A');
    headerGrad.addColorStop(0.55, '#1E3A8A');
    headerGrad.addColorStop(1, '#2563EB');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, width, headerHeight);

    // Subtle decorative geometric accent inside header
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.arc(width - 70, 20, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width - 170, 110, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Cyan Security Accent Stripe
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(0, headerHeight, width, 5);

    // Load School Logo if uploaded
    let logoImg: Awaited<ReturnType<typeof loadImage>> | null = null;
    if (school.logo_file_id) {
      try {
        const logoFile = db
          .prepare('SELECT storage_rel_path FROM stored_files WHERE id = ?')
          .get(school.logo_file_id) as { storage_rel_path: string } | undefined;
        if (logoFile) {
          const absPath = resolveConfinedStoragePath(logoFile.storage_rel_path);
          if (fs.existsSync(absPath)) {
            logoImg = await loadImage(absPath);
          }
        }
      } catch {
        // Fallback to code monogram
      }
    }

    // Draw School Logo Container (x: 28, y: 20, 78x78)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(28, 20, 78, 78, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.clip();

    if (logoImg) {
      const pad = 6;
      const box = 78 - pad * 2;
      const scale = Math.min(box / (logoImg.width || box), box / (logoImg.height || box));
      const drawW = (logoImg.width || box) * scale;
      const drawH = (logoImg.height || box) * scale;
      ctx.drawImage(
        logoImg,
        28 + pad + (box - drawW) / 2,
        20 + pad + (box - drawH) / 2,
        drawW,
        drawH,
      );
    } else {
      ctx.fillStyle = '#1E3A8A';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const nameInitials = school.name
        .split(/\s+/)
        .map((w) => w.replace(/[^A-Za-z0-9]/g, '')[0] || '')
        .filter(Boolean)
        .slice(0, 3)
        .join('')
        .toUpperCase();
      const emblem =
        nameInitials.length >= 2
          ? nameInitials
          : (school.code || school.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'SCH';
      ctx.fillText(emblem, 28 + 39, 20 + 39);
    }
    ctx.restore();

    // School Name & Motto/Location in Header
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(school.name, 124, 28, 512);

    ctx.fillStyle = '#DBEAFE';
    ctx.font = '14px sans-serif';
    const locationText = [school.city, school.country].filter(Boolean).join(', ');
    const subtitle = (school.motto && school.motto.trim()) || locationText || 'Official Student Identity Card';
    ctx.fillText(subtitle, 124, 62, 512);

    // Header Top-Right Credential Badge
    const badgeW = 166;
    const badgeH = 54;
    const badgeX = width - badgeW - 28;
    const badgeY = 30;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#BAE6FD';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('STUDENT ID PASS', badgeX + badgeW - 14, badgeY + 10);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(school.code, badgeX + badgeW - 14, badgeY + 27, badgeW - 24);
    ctx.restore();

    // Student Passport Photo (x: 32, y: 146, w: 164, h: 204)
    let studentImg: Awaited<ReturnType<typeof loadImage>> | null = null;
    if (student.photo_file_id) {
      try {
        const studentFile = db
          .prepare('SELECT storage_rel_path FROM stored_files WHERE id = ?')
          .get(student.photo_file_id) as { storage_rel_path: string } | undefined;
        if (studentFile) {
          const absPath = resolveConfinedStoragePath(studentFile.storage_rel_path);
          if (fs.existsSync(absPath)) {
            studentImg = await loadImage(absPath);
          }
        }
      } catch {
        // Fallback to initials avatar
      }
    }

    const photoX = 32;
    const photoY = 146;
    const photoW = 164;
    const photoH = 204;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(photoX, photoY, photoW, photoH, 14);
    ctx.fillStyle = '#F1F5F9';
    ctx.fill();
    ctx.clip();

    if (studentImg && studentImg.width > 0 && studentImg.height > 0) {
      // Object-fit: cover centered crop so passport portraits never distort
      const scale = Math.max(photoW / studentImg.width, photoH / studentImg.height);
      const drawW = studentImg.width * scale;
      const drawH = studentImg.height * scale;
      const drawX = photoX + (photoW - drawW) / 2;
      const drawY = photoY + (photoH - drawH) / 2;
      ctx.drawImage(studentImg, drawX, drawY, drawW, drawH);
    } else {
      const avatarGrad = ctx.createLinearGradient(photoX, photoY, photoX, photoY + photoH);
      avatarGrad.addColorStop(0, '#0F172A');
      avatarGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = avatarGrad;
      ctx.fillRect(photoX, photoY, photoW, photoH);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 46px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initials = `${student.first_name?.[0] || 'S'}${student.last_name?.[0] || 'T'}`.toUpperCase();
      ctx.fillText(initials, photoX + photoW / 2, photoY + photoH / 2 - 8);

      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('NO PASSPORT PHOTO', photoX + photoW / 2, photoY + photoH - 24);
    }
    ctx.restore();

    // Photo border frame
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(photoX, photoY, photoW, photoH, 14);
    ctx.stroke();

    // Student Identity Details (x: 218 to 618)
    const detailX = 218;
    const detailMaxW = 396;
    let cursorY = 148;

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('OFFICIAL STUDENT CREDENTIAL', detailX, cursorY);
    cursorY += 18;

    const fullName = [student.first_name, student.middle_name, student.last_name]
      .filter(Boolean)
      .join(' ');
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 25px sans-serif';
    const nameLines = wrapLines(ctx, fullName, detailMaxW, 2);
    for (const line of nameLines) {
      ctx.fillText(line, detailX, cursorY, detailMaxW);
      cursorY += 30;
    }
    cursorY += 4;

    // Admission Number
    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(student.admission_number, detailX, cursorY, detailMaxW);
    cursorY += 30;

    // Class / Arm and Gender two-column details
    const classText = student.class_name
      ? `${student.class_name}${student.arm_name ? ` (${student.arm_name})` : ''}`
      : 'Class Pending';

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('CLASS / ARM', detailX, cursorY);
    ctx.fillText('GENDER', detailX + 230, cursorY);
    cursorY += 15;

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(classText, detailX, cursorY, 215);
    ctx.fillText(student.gender || 'Unspecified', detailX + 230, cursorY, 160);
    cursorY += 30;

    // Active Status Badge (matching DigitalStudentIdCard emerald pill)
    const badgePosY = Math.min(cursorY, 320);
    ctx.save();
    ctx.fillStyle = '#ECFDF5';
    ctx.strokeStyle = '#A7F3D0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(detailX, badgePosY, 126, 28, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(detailX + 16, badgePosY + 14, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#065F46';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACTIVE CARD', detailX + 27, badgePosY + 14);
    ctx.restore();

    // Right QR Matrix Container (x: 638, y: 146, w: 186, h: 204)
    const qrBoxX = width - 218;
    const qrBoxY = 146;
    const qrBoxW = 186;
    const qrBoxH = 204;

    const qrBuffer = await QRCode.toBuffer(rawQrToken, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    const qrImg = await loadImage(qrBuffer);

    ctx.save();
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 12);
    ctx.fill();
    ctx.stroke();

    // Inner white frame behind QR matrix
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(qrBoxX + 13, qrBoxY + 12, 160, 160, 8);
    ctx.fill();
    ctx.drawImage(qrImg, qrBoxX + 17, qrBoxY + 16, 152, 152);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.card_number, qrBoxX + qrBoxW / 2, qrBoxY + 188, qrBoxW - 16);
    ctx.restore();

    // Bottom Metadata Strip (x: 32, y: 374, w: width - 64, h: 134)
    const barX = 32;
    const barY = 374;
    const barW = width - 64;
    const barH = 134;

    ctx.save();
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('CARD NUMBER', barX + 22, barY + 18);
    ctx.fillText('ISSUED DATE', barX + 232, barY + 18);
    ctx.fillText('VALID UNTIL', barX + 412, barY + 18);
    ctx.fillText('VERIFICATION', barX + 592, barY + 18);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(card.card_number, barX + 22, barY + 37, 195);

    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(card.issued_at.slice(0, 10), barX + 232, barY + 37);
    ctx.fillText(card.expires_at.slice(0, 10), barX + 412, barY + 37);

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('PORTAL & QR ENABLED', barX + 592, barY + 37, 180);

    // Hairline divider
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX + 20, barY + 78);
    ctx.lineTo(barX + barW - 20, barY + 78);
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '12px sans-serif';
    ctx.fillText(
      'Valid for Student Portal QR Sign-In, CBT Examinations & Daily Attendance Scan',
      barX + 22,
      barY + 95,
      540,
    );

    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('VERIFIED DIGITAL PASS', barX + barW - 22, barY + 96);
    ctx.restore();

    // Outer Card Frame Border
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[IdCardRenderer] Error rendering student ID card:', err);
    return null;
  }
}
