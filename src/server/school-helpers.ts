import { getDb } from '../db/client.ts';

export function formatAdmissionNumber(params: {
  template: string;
  prefix: string;
  schoolCode: string;
  year: number;
  seq: number;
}): string {
  const safeTemplate = params.template.trim() || '{PREFIX}-{YEAR}-{SEQ}';
  const safePrefix = params.prefix.trim().toUpperCase() || 'ADM';
  const safeCode = params.schoolCode.trim().toUpperCase() || 'SCH';
  const seqPadded = String(Math.max(1, params.seq)).padStart(4, '0');

  let out = safeTemplate
    .replaceAll('{PREFIX}', safePrefix)
    .replaceAll('{CODE}', safeCode)
    .replaceAll('{YEAR}', String(params.year))
    .replaceAll('{SEQ}', seqPadded);

  if (!safeTemplate.includes('{SEQ}')) {
    out = `${out}-${seqPadded}`;
  }
  return out.replace(/[^A-Za-z0-9/_-]/g, '').slice(0, 48);
}

export function formatApplicationReference(params: {
  prefix: string;
  schoolCode: string;
  year: number;
  seq: number;
}): string {
  const safePrefix = params.prefix.trim().toUpperCase() || 'APP';
  const safeCode = params.schoolCode.trim().toUpperCase() || 'SCH';
  const seqPadded = String(Math.max(1, params.seq)).padStart(4, '0');
  return `${safePrefix}-${safeCode}-${params.year}-${seqPadded}`.slice(0, 48);
}

export function normalizePagination(
  pageRaw: unknown,
  limitRaw: unknown,
  maxLimit = 50,
): { page: number; limit: number; offset: number } {
  const pageNum = Number(pageRaw);
  const limitNum = Number(limitRaw);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;
  const limit =
    Number.isFinite(limitNum) && limitNum >= 1
      ? Math.min(Math.floor(limitNum), maxLimit)
      : 20;
  return { page, limit, offset: (page - 1) * limit };
}

export function ensureSchoolProfileRow(schoolId: string): {
  school_id: string;
  admission_number_prefix: string;
  admission_number_format: string;
  admission_next_seq: number;
  application_ref_prefix: string;
  application_next_seq: number;
} {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO school_profiles (school_id)
    VALUES (?)
  `).run(schoolId);

  return db
    .prepare(`
      SELECT
        school_id,
        admission_number_prefix,
        admission_number_format,
        admission_next_seq,
        application_ref_prefix,
        application_next_seq
      FROM school_profiles
      WHERE school_id = ?
    `)
    .get(schoolId) as {
    school_id: string;
    admission_number_prefix: string;
    admission_number_format: string;
    admission_next_seq: number;
    application_ref_prefix: string;
    application_next_seq: number;
  };
}

/**
 * Generates and reserves the next unique admission number for a school.
 * Must be called inside an open DB transaction or standalone.
 */
export function allocateUniqueAdmissionNumber(schoolId: string, admissionDate: string): string {
  const db = getDb();
  const profile = ensureSchoolProfileRow(schoolId);
  const schoolRow = db
    .prepare('SELECT code FROM schools WHERE id = ?')
    .get(schoolId) as { code: string } | undefined;

  const yearMatch = /^(\d{4})/.exec(admissionDate);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
  let seq = profile.admission_next_seq;
  let candidate = '';

  for (let i = 0; i < 200; i++) {
    candidate = formatAdmissionNumber({
      template: profile.admission_number_format,
      prefix: profile.admission_number_prefix,
      schoolCode: schoolRow?.code ?? 'SCH',
      year,
      seq,
    });
    const exists = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND UPPER(admission_number) = UPPER(?)')
      .get(schoolId, candidate);
    if (!exists) {
      db.prepare("UPDATE school_profiles SET admission_next_seq = ?, updated_at = datetime('now') WHERE school_id = ?").run(
        seq + 1,
        schoolId,
      );
      return candidate;
    }
    seq += 1;
  }

  throw new Error('Unable to allocate a unique admission number.');
}

export function allocateUniqueApplicationReference(schoolId: string): string {
  const db = getDb();
  const profile = ensureSchoolProfileRow(schoolId);
  const schoolRow = db
    .prepare('SELECT code FROM schools WHERE id = ?')
    .get(schoolId) as { code: string } | undefined;

  const year = new Date().getUTCFullYear();
  let seq = profile.application_next_seq;

  for (let i = 0; i < 200; i++) {
    const candidate = formatApplicationReference({
      prefix: profile.application_ref_prefix,
      schoolCode: schoolRow?.code ?? 'SCH',
      year,
      seq,
    });
    const exists = db
      .prepare('SELECT id FROM admission_applications WHERE school_id = ? AND UPPER(application_reference) = UPPER(?)')
      .get(schoolId, candidate);
    if (!exists) {
      db.prepare("UPDATE school_profiles SET application_next_seq = ?, updated_at = datetime('now') WHERE school_id = ?").run(
        seq + 1,
        schoolId,
      );
      return candidate;
    }
    seq += 1;
  }

  throw new Error('Unable to allocate a unique application reference.');
}

export interface ClassPlacementValidation {
  ok: boolean;
  error?: string;
  classRow?: { id: string; name: string; status: string; capacity: number };
  armRow?: { id: string; name: string; class_id: string; status: string; capacity: number } | null;
}

export function validateActiveClassAndArm(params: {
  schoolId: string;
  classId: string;
  armId?: string | null;
  excludeStudentId?: string;
}): ClassPlacementValidation {
  const db = getDb();
  const classRow = db
    .prepare('SELECT id, name, status, capacity FROM school_classes WHERE id = ? AND school_id = ?')
    .get(params.classId, params.schoolId) as
    | { id: string; name: string; status: string; capacity: number }
    | undefined;

  if (!classRow) {
    return { ok: false, error: 'Selected class does not belong to your school.' };
  }
  if (classRow.status === 'archived') {
    return { ok: false, error: `Cannot assign student to archived class (${classRow.name}).` };
  }

  let armRow: { id: string; name: string; class_id: string; status: string; capacity: number } | null =
    null;

  if (params.armId) {
    const foundArm = db
      .prepare('SELECT id, name, class_id, status, capacity FROM class_arms WHERE id = ? AND school_id = ?')
      .get(params.armId, params.schoolId) as
      | { id: string; name: string; class_id: string; status: string; capacity: number }
      | undefined;

    if (!foundArm) {
      return { ok: false, error: 'Selected class arm does not belong to your school.' };
    }
    if (foundArm.class_id !== classRow.id) {
      return {
        ok: false,
        error: `Class arm "${foundArm.name}" belongs to a different class and is incompatible with ${classRow.name}.`,
      };
    }
    if (foundArm.status === 'archived') {
      return { ok: false, error: `Cannot assign student to archived class arm (${foundArm.name}).` };
    }

    const armOccupied = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM students
        WHERE school_id = ? AND current_arm_id = ? AND status = 'active'
        ${params.excludeStudentId ? 'AND id != ?' : ''}
      `)
      .get(
        ...(params.excludeStudentId
          ? [params.schoolId, foundArm.id, params.excludeStudentId]
          : [params.schoolId, foundArm.id]),
      ) as { count: number };

    if (armOccupied.count >= foundArm.capacity) {
      return {
        ok: false,
        error: `Class arm ${classRow.name} - ${foundArm.name} has reached its capacity (${foundArm.capacity}).`,
      };
    }
    armRow = foundArm;
  } else {
    const classOccupied = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM students
        WHERE school_id = ? AND current_class_id = ? AND status = 'active'
        ${params.excludeStudentId ? 'AND id != ?' : ''}
      `)
      .get(
        ...(params.excludeStudentId
          ? [params.schoolId, classRow.id, params.excludeStudentId]
          : [params.schoolId, classRow.id]),
      ) as { count: number };

    if (classOccupied.count >= classRow.capacity) {
      return {
        ok: false,
        error: `Class ${classRow.name} has reached its capacity (${classRow.capacity}).`,
      };
    }
  }

  return { ok: true, classRow, armRow };
}
