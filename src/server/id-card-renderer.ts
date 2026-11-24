import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import QRCode from 'qrcode';
import { getDb } from '../db/client.ts';
import { resolveConfinedStoragePath } from './file-storage.ts';
import { decryptIdCardToken, getOrCreateIdCardMasterSecret } from './id-card-helpers.ts';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, 'assets', 'fonts');

let wasmInitPromise: Promise<void> | null = null;
let cachedFontBuffers: Uint8Array[] | null = null;

async function ensureResvgReady(): Promise<Uint8Array[]> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
      const wasmBytes = fs.readFileSync(wasmPath);
      await initWasm(wasmBytes);
    })();
  }
  await wasmInitPromise;

  if (!cachedFontBuffers) {
    const fontFiles = [
      'DejaVuSans.ttf',
      'DejaVuSans-Bold.ttf',
      'DejaVuSansMono.ttf',
      'DejaVuSansMono-Bold.ttf',
    ];
    cachedFontBuffers = fontFiles
      .map((file) => path.join(FONTS_DIR, file))
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => new Uint8Array(fs.readFileSync(filePath)));
  }

  return cachedFontBuffers;
}

export async function renderSvgToPngBuffer(svg: string): Promise<Buffer> {
  const fontBuffers = await ensureResvgReady();
  const resvg = new Resvg(svg, {
    font:
      fontBuffers.length > 0
        ? {
            fontBuffers,
            defaultFontFamily: 'DejaVu Sans',
            sansSerifFamily: 'DejaVu Sans',
            monospaceFamily: 'DejaVu Sans Mono',
          }
        : {
            loadSystemFonts: true,
            defaultFontFamily: 'sans-serif',
          },
  });
  try {
    const rendered = resvg.render();
    try {
      return Buffer.from(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clipText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function wrapTextByCharBudget(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else if (!current) {
      lines.push(clipText(word, maxCharsPerLine));
      if (lines.length === maxLines) {
        return lines;
      }
    } else {
      lines.push(current);
      if (lines.length === maxLines - 1) {
        const remaining = words.slice(i).join(' ');
        lines.push(clipText(remaining, maxCharsPerLine));
        return lines;
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function readStoredImageDataUri(fileId: string | null): string | null {
  if (!fileId) return null;
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT storage_rel_path, mime_type FROM stored_files WHERE id = ?')
      .get(fileId) as { storage_rel_path: string; mime_type: string } | undefined;
    if (!row) return null;

    if (row.mime_type !== 'image/png' && row.mime_type !== 'image/jpeg') {
      return null;
    }

    const absPath = resolveConfinedStoragePath(row.storage_rel_path);
    if (!fs.existsSync(absPath)) return null;

    const bytes = fs.readFileSync(absPath);
    if (bytes.length === 0) return null;

    return `data:${row.mime_type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
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

    const qrDataUrl = await QRCode.toDataURL(rawQrToken, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });

    const logoDataUri = readStoredImageDataUri(school.logo_file_id);
    const studentPhotoDataUri = readStoredImageDataUri(student.photo_file_id);

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

    const locationText = [school.city, school.country].filter(Boolean).join(', ');
    const subtitle = clipText(
      (school.motto && school.motto.trim()) || locationText || 'Official Student Identity Card',
      58,
    );
    const schoolTitle = clipText(school.name, 36);

    const fullName = [student.first_name, student.middle_name, student.last_name]
      .filter(Boolean)
      .join(' ');
    const nameLines = wrapTextByCharBudget(fullName, 23, 2);

    const classText = clipText(
      student.class_name
        ? `${student.class_name}${student.arm_name ? ` (${student.arm_name})` : ''}`
        : 'Class Pending',
      22,
    );
    const genderText = clipText(student.gender || 'Unspecified', 14);
    const studentInitials = `${student.first_name?.[0] || 'S'}${student.last_name?.[0] || 'T'}`.toUpperCase();

    const nameStartY = 188;
    const nameSvg = nameLines
      .map(
        (line, idx) =>
          `<text x="218" y="${nameStartY + idx * 30}" fill="#0F172A" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold">${escapeXml(line)}</text>`,
      )
      .join('\n');

    const afterNameY = nameStartY + (nameLines.length - 1) * 30;
    const admY = afterNameY + 26;
    const metaLabelY = admY + 28;
    const metaValY = metaLabelY + 18;
    const statusBadgeY = Math.min(metaValY + 14, 320);

    const logoBlock = logoDataUri
      ? `<image href="${logoDataUri}" x="34" y="26" width="66" height="66" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoClip)" />`
      : `<text x="67" y="68" text-anchor="middle" fill="#1E3A8A" font-family="DejaVu Sans, sans-serif" font-size="25" font-weight="bold">${escapeXml(emblem)}</text>`;

    const photoBlock = studentPhotoDataUri
      ? `<image href="${studentPhotoDataUri}" x="32" y="146" width="164" height="204" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
      : `
        <rect x="32" y="146" width="164" height="204" rx="14" fill="url(#avatarGrad)" />
        <text x="114" y="252" text-anchor="middle" fill="#FFFFFF" font-family="DejaVu Sans, sans-serif" font-size="44" font-weight="bold">${escapeXml(studentInitials)}</text>
        <text x="114" y="328" text-anchor="middle" fill="#94A3B8" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">NO PASSPORT PHOTO</text>
      `;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="856" height="540" viewBox="0 0 856 540">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="55%" stop-color="#1E3A8A" />
      <stop offset="100%" stop-color="#2563EB" />
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
    <clipPath id="headerClip">
      <rect x="0" y="0" width="856" height="118" />
    </clipPath>
    <clipPath id="logoClip">
      <rect x="28" y="20" width="78" height="78" rx="12" />
    </clipPath>
    <clipPath id="photoClip">
      <rect x="32" y="146" width="164" height="204" rx="14" />
    </clipPath>
  </defs>

  <!-- Base Card Surface -->
  <rect x="0" y="0" width="856" height="540" fill="#F8FAFC" />
  <rect x="16" y="132" width="824" height="392" rx="14" fill="#FFFFFF" />

  <!-- Institutional Header -->
  <g clip-path="url(#headerClip)">
    <rect x="0" y="0" width="856" height="118" fill="url(#headerGrad)" />
    <circle cx="786" cy="20" r="96" fill="rgba(255,255,255,0.06)" />
    <circle cx="686" cy="110" r="68" fill="rgba(255,255,255,0.06)" />
  </g>
  <rect x="0" y="118" width="856" height="5" fill="#38BDF8" />

  <!-- School Logo / Crest -->
  <rect x="28" y="20" width="78" height="78" rx="12" fill="#FFFFFF" />
  ${logoBlock}

  <!-- School Title & Motto -->
  <text x="124" y="51" fill="#FFFFFF" font-family="DejaVu Sans, sans-serif" font-size="23" font-weight="bold">${escapeXml(schoolTitle)}</text>
  <text x="124" y="77" fill="#DBEAFE" font-family="DejaVu Sans, sans-serif" font-size="13.5">${escapeXml(subtitle)}</text>

  <!-- Right Credential Badge -->
  <rect x="662" y="30" width="166" height="54" rx="10" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.28)" stroke-width="1" />
  <text x="814" y="49" text-anchor="end" fill="#BAE6FD" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">STUDENT ID PASS</text>
  <text x="814" y="71" text-anchor="end" fill="#FFFFFF" font-family="DejaVu Sans Mono, monospace" font-size="14.5" font-weight="bold">${escapeXml(clipText(school.code, 14))}</text>

  <!-- Student Passport Photo Frame -->
  <rect x="32" y="146" width="164" height="204" rx="14" fill="#F1F5F9" />
  ${photoBlock}
  <rect x="32" y="146" width="164" height="204" rx="14" fill="none" stroke="#CBD5E1" stroke-width="2" />

  <!-- Student Credential Text -->
  <text x="218" y="158" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">OFFICIAL STUDENT CREDENTIAL</text>
  ${nameSvg}
  <text x="218" y="${admY}" fill="#1E3A8A" font-family="DejaVu Sans Mono, monospace" font-size="16.5" font-weight="bold">${escapeXml(clipText(student.admission_number, 26))}</text>

  <text x="218" y="${metaLabelY}" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">CLASS / ARM</text>
  <text x="448" y="${metaLabelY}" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">GENDER</text>
  <text x="218" y="${metaValY}" fill="#0F172A" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="bold">${escapeXml(classText)}</text>
  <text x="448" y="${metaValY}" fill="#0F172A" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="bold">${escapeXml(genderText)}</text>

  <!-- Active Card Status Badge -->
  <rect x="218" y="${statusBadgeY}" width="128" height="28" rx="7" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.5" />
  <circle cx="234" cy="${statusBadgeY + 14}" r="4" fill="#10B981" />
  <text x="245" y="${statusBadgeY + 18}" fill="#065F46" font-family="DejaVu Sans, sans-serif" font-size="11.5" font-weight="bold">ACTIVE CARD</text>

  <!-- QR Verification Box -->
  <rect x="638" y="146" width="186" height="204" rx="12" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5" />
  <rect x="651" y="158" width="160" height="160" rx="8" fill="#FFFFFF" />
  <image href="${qrDataUrl}" x="655" y="162" width="152" height="152" />
  <text x="731" y="338" text-anchor="middle" fill="#475569" font-family="DejaVu Sans Mono, monospace" font-size="10.5" font-weight="bold">${escapeXml(card.card_number)}</text>

  <!-- Bottom Metadata Bar -->
  <rect x="32" y="374" width="792" height="134" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
  <text x="54" y="400" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">CARD NUMBER</text>
  <text x="264" y="400" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">ISSUED DATE</text>
  <text x="444" y="400" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">VALID UNTIL</text>
  <text x="624" y="400" fill="#64748B" font-family="DejaVu Sans, sans-serif" font-size="10" font-weight="bold">VERIFICATION</text>

  <text x="54" y="424" fill="#0F172A" font-family="DejaVu Sans Mono, monospace" font-size="13.5" font-weight="bold">${escapeXml(card.card_number)}</text>
  <text x="264" y="424" fill="#0F172A" font-family="DejaVu Sans, sans-serif" font-size="13.5" font-weight="bold">${escapeXml(card.issued_at.slice(0, 10))}</text>
  <text x="444" y="424" fill="#0F172A" font-family="DejaVu Sans, sans-serif" font-size="13.5" font-weight="bold">${escapeXml(card.expires_at.slice(0, 10))}</text>
  <text x="624" y="424" fill="#059669" font-family="DejaVu Sans, sans-serif" font-size="12.5" font-weight="bold">PORTAL &amp; QR ENABLED</text>

  <line x1="52" y1="452" x2="804" y2="452" stroke="#E2E8F0" stroke-width="1" />
  <text x="54" y="481" fill="#475569" font-family="DejaVu Sans, sans-serif" font-size="11.5">Valid for Student Portal QR Sign-In, CBT Examinations &amp; Daily Attendance Scan</text>
  <text x="802" y="481" text-anchor="end" fill="#1E3A8A" font-family="DejaVu Sans, sans-serif" font-size="11" font-weight="bold">VERIFIED DIGITAL PASS</text>

  <!-- Outer Card Frame Border -->
  <rect x="1" y="1" width="854" height="538" fill="none" stroke="#CBD5E1" stroke-width="2" />
</svg>`;

    return await renderSvgToPngBuffer(svg);
  } catch (err) {
    console.error('[IdCardRenderer] Error rendering student ID card:', err);
    return null;
  }
}
