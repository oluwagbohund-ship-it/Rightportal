import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/client.ts';
import { sanitizeDisplayFilename, sha256Hex } from './security.ts';

export type FileCategory =
  | 'school_logo'
  | 'teacher_profile_picture'
  | 'student_profile_picture'
  | 'student_document'
  | 'staff_document'
  | 'school_document';

interface CategoryPolicy {
  allowedMimes: string[];
  maxBytes: number;
}

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const DOCUMENT_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'];

export const FILE_CATEGORY_POLICIES: Record<FileCategory, CategoryPolicy> = {
  school_logo: { allowedMimes: IMAGE_MIMES, maxBytes: 2 * 1024 * 1024 },
  teacher_profile_picture: { allowedMimes: IMAGE_MIMES, maxBytes: 2 * 1024 * 1024 },
  student_profile_picture: { allowedMimes: IMAGE_MIMES, maxBytes: 2 * 1024 * 1024 },
  school_document: { allowedMimes: DOCUMENT_MIMES, maxBytes: 5 * 1024 * 1024 },
  staff_document: { allowedMimes: DOCUMENT_MIMES, maxBytes: 5 * 1024 * 1024 },
  student_document: { allowedMimes: DOCUMENT_MIMES, maxBytes: 5 * 1024 * 1024 },
};

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export function getStorageRoot(): string {
  const root = path.resolve(
    process.cwd(),
    process.env.FILE_STORAGE_DIR || './data/storage',
  );
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

export function resolveConfinedStoragePath(relPath: string): string {
  const root = getStorageRoot();
  const normalizedRel = relPath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(root, normalizedRel);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('File path escaped storage confinement.');
  }
  return resolved;
}

export function detectVerifiedMimeType(buffer: Buffer, claimedMime: string, fileName: string): string | null {
  if (buffer.length === 0) return null;

  // Reject executable & script signatures immediately (PE/MZ, ELF, Mach-O, HTML/SVG/PHP)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return null; // MZ
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return null; // ELF

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // PDF: %PDF-
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  // Plain text / CSV (only if explicitly claimed as text/plain or text/csv and contains no null bytes or active HTML/SVG/script markup)
  if (claimedMime === 'text/plain' || claimedMime === 'text/csv') {
    if (buffer.includes(0x00)) return null;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf-8');
    if (/<\s*(script|svg|iframe|html|\?php)/i.test(sample)) {
      return null;
    }
    const ext = path.extname(fileName).toLowerCase();
    if (claimedMime === 'text/csv' || ext === '.csv') {
      return 'text/csv';
    }
    return 'text/plain';
  }

  return null;
}

export interface StoredFileRecord {
  id: string;
  school_id: string | null;
  uploaded_by_user_id: string;
  subject_user_id: string | null;
  category: FileCategory;
  original_name: string;
  stored_name: string;
  storage_rel_path: string;
  mime_type: string;
  size_bytes: number;
  sha256_hex: string;
  visibility: 'private_tenant' | 'private_owner';
  created_at: string;
}

export function saveValidatedFile(params: {
  schoolId: string | null;
  uploadedByUserId: string;
  subjectUserId?: string | null;
  category: FileCategory;
  originalName: string;
  claimedMimeType: string;
  contentBase64: string;
  visibility: 'private_tenant' | 'private_owner';
}): StoredFileRecord {
  const policy = FILE_CATEGORY_POLICIES[params.category];
  if (!policy) {
    throw new Error('Unsupported file category.');
  }

  const cleanBase64 = params.contentBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!cleanBase64 || !/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
    throw new Error('Invalid base64 file payload.');
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Uploaded file cannot be empty.');
  }
  if (buffer.length > policy.maxBytes) {
    const maxMb = (policy.maxBytes / (1024 * 1024)).toFixed(1);
    throw new Error(`File exceeds the ${maxMb} MB size limit for ${params.category}.`);
  }

  const verifiedMime = detectVerifiedMimeType(
    buffer,
    params.claimedMimeType.toLowerCase(),
    params.originalName,
  );
  if (!verifiedMime || !policy.allowedMimes.includes(verifiedMime)) {
    throw new Error(
      `File signature rejected. Allowed formats for ${params.category}: ${policy.allowedMimes.join(', ')}.`,
    );
  }

  const safeOriginal = sanitizeDisplayFilename(params.originalName);
  const ext = MIME_TO_EXT[verifiedMime] ?? 'bin';
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const tenantSegment = params.schoolId ? `school_${params.schoolId}` : 'platform';
  const storageRelPath = path.join(tenantSegment, params.category, storedName);
  const absPath = resolveConfinedStoragePath(storageRelPath);

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(absPath, buffer, { flag: 'wx' });

  const id = `fil_${crypto.randomUUID()}`;
  const digest = sha256Hex(buffer);
  const db = getDb();

  try {
    db.prepare(`
      INSERT INTO stored_files (
        id, school_id, uploaded_by_user_id, subject_user_id, category,
        original_name, stored_name, storage_rel_path, mime_type,
        size_bytes, sha256_hex, visibility
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.schoolId,
      params.uploadedByUserId,
      params.subjectUserId ?? null,
      params.category,
      safeOriginal,
      storedName,
      storageRelPath,
      verifiedMime,
      buffer.length,
      digest,
      params.visibility,
    );
  } catch (err) {
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
    throw err;
  }

  return db
    .prepare('SELECT * FROM stored_files WHERE id = ?')
    .get(id) as unknown as StoredFileRecord;
}

export function deleteStoredFileById(fileId: string): boolean {
  const db = getDb();
  const row = db
    .prepare('SELECT id, storage_rel_path FROM stored_files WHERE id = ?')
    .get(fileId) as { id: string; storage_rel_path: string } | undefined;
  if (!row) return false;

  const absPath = resolveConfinedStoragePath(row.storage_rel_path);
  db.prepare('DELETE FROM stored_files WHERE id = ?').run(fileId);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
  return true;
}
