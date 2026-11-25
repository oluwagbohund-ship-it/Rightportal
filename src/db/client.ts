import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let dbInstance: DatabaseSync | null = null;

interface RoleSeed {
  id: string;
  code: string;
  name: string;
  scope: 'platform' | 'school';
  description: string;
}

interface PermissionSeed {
  id: string;
  code: string;
  description: string;
}

const ROLES_SEED: RoleSeed[] = [
  {
    id: 'role_platform_owner',
    code: 'platform_owner',
    name: 'Platform Owner',
    scope: 'platform',
    description: 'Executive governance over Dave Timi EdTech Systems, tenant schools, workforce, security, and settings.',
  },
  {
    id: 'role_workforce_admin',
    code: 'workforce_admin',
    name: 'DT Workforce Administrator',
    scope: 'platform',
    description: 'Authorized platform operations administrator managing school onboarding and workforce operations.',
  },
  {
    id: 'role_workforce_support',
    code: 'workforce_support',
    name: 'DT Workforce Support',
    scope: 'platform',
    description: 'Authorized platform support specialist with read-only tenant oversight and audit inspection.',
  },
  {
    id: 'role_school_admin',
    code: 'school_admin',
    name: 'School Administrator',
    scope: 'school',
    description: 'Tenant-scoped executive administrator for an individual school institution.',
  },
  {
    id: 'role_teacher',
    code: 'teacher',
    name: 'Teacher',
    scope: 'school',
    description: 'School faculty educator scoped to assigned institutional workspace.',
  },
  {
    id: 'role_student',
    code: 'student',
    name: 'Student',
    scope: 'school',
    description: 'Enrolled learner portal scoped to their school institution.',
  },
  {
    id: 'role_parent',
    code: 'parent',
    name: 'Parent / Guardian',
    scope: 'school',
    description: 'Guardian portal scoped to their school institution.',
  },
];

const PERMISSIONS_SEED: PermissionSeed[] = [
  { id: 'perm_plat_overview', code: 'platform.overview.read', description: 'Read platform-wide metrics' },
  { id: 'perm_plat_schools_read', code: 'platform.schools.read', description: 'Read registered schools directory' },
  { id: 'perm_plat_schools_manage', code: 'platform.schools.manage', description: 'Verify, activate, or suspend schools' },
  { id: 'perm_plat_workforce_manage', code: 'platform.workforce.manage', description: 'Create and manage DT workforce accounts' },
  { id: 'perm_plat_settings_manage', code: 'platform.settings.manage', description: 'Modify platform governance settings' },
  { id: 'perm_plat_security_read', code: 'platform.security.read', description: 'Monitor platform security and active sessions' },
  { id: 'perm_plat_audit_read', code: 'platform.audit.read', description: 'Inspect global platform audit logs' },
  { id: 'perm_plat_db_manage', code: 'platform.database.manage', description: 'Run integrity checks and manage database backups/restores' },
  { id: 'perm_plat_files_manage', code: 'platform.files.manage', description: 'Inspect and manage platform file assets' },
  { id: 'perm_plat_notif_manage', code: 'platform.notifications.manage', description: 'Publish platform-wide or school-targeted notices' },
  { id: 'perm_sch_overview_read', code: 'school.overview.read', description: 'Read school tenant overview' },
  { id: 'perm_sch_sessions_manage', code: 'school.sessions.manage', description: 'Create and activate school academic sessions' },
  { id: 'perm_sch_members_manage', code: 'school.members.manage', description: 'Provision and manage school staff, students, and parents' },
  { id: 'perm_sch_audit_read', code: 'school.audit.read', description: 'Read tenant-scoped audit logs' },
  { id: 'perm_sch_files_manage', code: 'school.files.manage', description: 'Upload and manage school logos, pictures, and tenant documents' },
  { id: 'perm_sch_files_read', code: 'school.files.read', description: 'Access authorized tenant-scoped files' },
  { id: 'perm_sch_notif_manage', code: 'school.notifications.manage', description: 'Publish tenant notifications to staff, students, and parents' },
  { id: 'perm_sch_notif_read', code: 'school.notifications.read', description: 'Read tenant notifications scoped to user role' },
  { id: 'perm_sch_profile_manage', code: 'school.profile.manage', description: 'Manage school profile, branding logo, and admission formats' },
  { id: 'perm_sch_students_manage', code: 'school.students.manage', description: 'Register, edit, promote, and manage school students and documents' },
  { id: 'perm_sch_teachers_manage', code: 'school.teachers.manage', description: 'Register, edit, assign, and manage school teachers and staff documents' },
  { id: 'perm_sch_parents_manage', code: 'school.parents.manage', description: 'Register parents and manage verified student-guardian links' },
  { id: 'perm_sch_classes_manage', code: 'school.classes.manage', description: 'Create, edit, archive classes/arms, and manage class assignments' },
  { id: 'perm_sch_subjects_manage', code: 'school.subjects.manage', description: 'Create, edit, archive subjects and manage class/teacher subject assignments' },
  { id: 'perm_sch_admissions_manage', code: 'school.admissions.manage', description: 'Review admission applications and convert approved applicants' },
  { id: 'perm_sch_academics_manage', code: 'school.academics.manage', description: 'Manage configurable sessions, terms, calendar events, and student subject enrollments' },
  { id: 'perm_sch_assessments_manage', code: 'school.assessments.manage', description: 'Configure assessment categories, weighted components, examinations, and review score submissions' },
  { id: 'perm_sch_grading_manage', code: 'school.grading.manage', description: 'Configure institutional grading scales and boundary rules' },
  { id: 'perm_sch_results_compute', code: 'school.results.compute', description: 'Execute server-side result computation, review broadsheets, and manage report card templates' },
  { id: 'perm_sch_results_publish', code: 'school.results.publish', description: 'Publish verified academic results and official report cards' },
  { id: 'perm_sch_results_amend', code: 'school.results.amend', description: 'Execute audited post-publication result amendments' },
  { id: 'perm_sch_promotions_approve', code: 'school.promotions.approve', description: 'Generate promotion recommendations and approve official class promotions' },
  { id: 'perm_teacher_ws', code: 'teacher.workspace.read', description: 'Access Teacher instructional workspace' },
  { id: 'perm_teacher_scores_enter', code: 'teacher.scores.enter', description: 'Enter, save draft, and submit assessment/exam scores for assigned subjects and classes' },
  { id: 'perm_teacher_comments_manage', code: 'teacher.comments.manage', description: 'Manage attendance summaries, behavioral traits, and teacher comments for assigned classes' },
  { id: 'perm_student_ws', code: 'student.workspace.read', description: 'Access Student learning portal' },
  { id: 'perm_student_results_read', code: 'student.results.read', description: 'View own published academic results and official report cards' },
  { id: 'perm_parent_ws', code: 'parent.workspace.read', description: 'Access Parent guardian portal' },
  { id: 'perm_parent_results_read', code: 'parent.results.read', description: 'View verified linked ward published results and report cards' },
  { id: 'perm_ai_core_view', code: 'ai.core.view', description: 'View DT AI CORE architectural module registry' },
  { id: 'perm_ai_core_use', code: 'ai.core.use', description: 'Run authorized DT AI CORE analytics and administrative assistant queries' },
  { id: 'perm_plat_analytics_read', code: 'platform.analytics.read', description: 'Read platform-wide tenant analytics and growth metrics' },
  { id: 'perm_plat_health_read', code: 'platform.health.read', description: 'Inspect system health, diagnostics, and runtime readiness' },
  { id: 'perm_sch_att_manage', code: 'school.attendance.manage', description: 'Manage school attendance settings, approvals, QR sessions, and reports' },
  { id: 'perm_sch_att_mark', code: 'school.attendance.mark', description: 'Mark and edit class attendance registers and generate QR attendance' },
  { id: 'perm_stu_att_read', code: 'student.attendance.read', description: 'View own attendance records and scan QR attendance sessions' },
  { id: 'perm_par_att_read', code: 'parent.attendance.read', description: 'View verified linked ward attendance records' },
  { id: 'perm_sch_fin_manage', code: 'school.finance.manage', description: 'Configure school fee categories, structures, discounts, expenses, verification, and financial reports' },
  { id: 'perm_sch_fin_record', code: 'school.finance.record', description: 'Record school fee payments and issue receipts' },
  { id: 'perm_stu_fin_read', code: 'student.finance.read', description: 'View own fee balances and verified payment receipts' },
  { id: 'perm_par_fin_read', code: 'parent.finance.read', description: 'View verified linked ward fee statements and receipts' },
  { id: 'perm_sch_cbt_manage', code: 'school.cbt.manage', description: 'Manage CBT question banks, examinations, grading, and result synchronization' },
  { id: 'perm_tch_cbt_manage', code: 'teacher.cbt.manage', description: 'Manage CBT questions and grade essays for assigned subjects' },
  { id: 'perm_stu_cbt_take', code: 'student.cbt.take', description: 'Take assigned computer-based examinations and review authorized scores' },
  { id: 'perm_sch_comms_manage', code: 'school.comms.manage', description: 'Manage school announcements, schedules, templates, and communication delivery logs' },
  { id: 'perm_sch_comms_send', code: 'school.comms.send', description: 'Send authorized direct messages and class announcements' },
  { id: 'perm_sch_tt_manage', code: 'school.timetable.manage', description: 'Configure rooms, periods, and school timetables with conflict detection' },
  { id: 'perm_sch_web_manage', code: 'school.website.manage', description: 'Manage public school website appearance, pages, gallery, and admissions intake' },
];

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  role_platform_owner: [
    'perm_plat_overview',
    'perm_plat_schools_read',
    'perm_plat_schools_manage',
    'perm_plat_workforce_manage',
    'perm_plat_settings_manage',
    'perm_plat_security_read',
    'perm_plat_audit_read',
    'perm_plat_db_manage',
    'perm_plat_files_manage',
    'perm_plat_notif_manage',
    'perm_plat_analytics_read',
    'perm_plat_health_read',
    'perm_ai_core_view',
    'perm_ai_core_use',
  ],
  role_workforce_admin: [
    'perm_plat_overview',
    'perm_plat_schools_read',
    'perm_plat_schools_manage',
    'perm_plat_security_read',
    'perm_plat_audit_read',
    'perm_plat_files_manage',
    'perm_plat_notif_manage',
    'perm_plat_analytics_read',
    'perm_plat_health_read',
    'perm_ai_core_view',
  ],
  role_workforce_support: [
    'perm_plat_overview',
    'perm_plat_schools_read',
    'perm_plat_audit_read',
    'perm_plat_analytics_read',
  ],
  role_school_admin: [
    'perm_sch_overview_read',
    'perm_sch_sessions_manage',
    'perm_sch_members_manage',
    'perm_sch_audit_read',
    'perm_sch_files_manage',
    'perm_sch_files_read',
    'perm_sch_notif_manage',
    'perm_sch_notif_read',
    'perm_sch_profile_manage',
    'perm_sch_students_manage',
    'perm_sch_teachers_manage',
    'perm_sch_parents_manage',
    'perm_sch_classes_manage',
    'perm_sch_subjects_manage',
    'perm_sch_admissions_manage',
    'perm_sch_academics_manage',
    'perm_sch_assessments_manage',
    'perm_sch_grading_manage',
    'perm_sch_results_compute',
    'perm_sch_results_publish',
    'perm_sch_results_amend',
    'perm_sch_promotions_approve',
    'perm_teacher_scores_enter',
    'perm_teacher_comments_manage',
    'perm_sch_att_manage',
    'perm_sch_att_mark',
    'perm_sch_fin_manage',
    'perm_sch_fin_record',
    'perm_sch_cbt_manage',
    'perm_tch_cbt_manage',
    'perm_sch_comms_manage',
    'perm_sch_comms_send',
    'perm_sch_tt_manage',
    'perm_sch_web_manage',
    'perm_ai_core_view',
    'perm_ai_core_use',
  ],
  role_teacher: [
    'perm_sch_overview_read',
    'perm_sch_files_read',
    'perm_sch_notif_read',
    'perm_teacher_ws',
    'perm_teacher_scores_enter',
    'perm_teacher_comments_manage',
    'perm_sch_att_mark',
    'perm_tch_cbt_manage',
    'perm_sch_comms_send',
    'perm_ai_core_view',
    'perm_ai_core_use',
  ],
  role_student: [
    'perm_sch_overview_read',
    'perm_sch_files_read',
    'perm_sch_notif_read',
    'perm_student_ws',
    'perm_student_results_read',
    'perm_stu_att_read',
    'perm_stu_fin_read',
    'perm_stu_cbt_take',
    'perm_sch_comms_send',
  ],
  role_parent: [
    'perm_sch_overview_read',
    'perm_sch_files_read',
    'perm_sch_notif_read',
    'perm_parent_ws',
    'perm_parent_results_read',
    'perm_par_att_read',
    'perm_par_fin_read',
    'perm_sch_comms_send',
  ],
};

export function getDbFilePath(): string {
  const envPath = process.env.SQLITE_DB_PATH;
  if (envPath) {
    const candidate = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    try {
      const dir = path.dirname(candidate);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.accessSync(dir, fs.constants.W_OK);
      return candidate;
    } catch (err) {
      console.warn(`[DB] Warning: SQLITE_DB_PATH (${envPath}) is not writable. Falling back to local ./data/dt_edtech.sqlite`);
    }
  }
  return path.resolve(process.cwd(), './data/dt_edtech.sqlite');
}

function sha256Text(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function hasMigrationChecksumColumn(db: DatabaseSync): boolean {
  const columns = db.prepare('PRAGMA table_info(schema_migrations)').all() as Array<{ name: string }>;
  return columns.some((c) => c.name === 'checksum');
}

export function runMigrations(db: DatabaseSync): void {
  const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error('Migrations directory missing: src/db/migrations');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const checksum = sha256Text(sql);
    const existing = db
      .prepare('SELECT version FROM schema_migrations WHERE version = ?')
      .get(file) as { version: string } | undefined;

    if (!existing) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(sql);
        if (hasMigrationChecksumColumn(db)) {
          db.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)').run(
            file,
            checksum,
          );
        } else {
          db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  if (hasMigrationChecksumColumn(db)) {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const expectedChecksum = sha256Text(sql);
      const row = db
        .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
        .get(file) as { checksum?: string } | undefined;

      if (row && (!row.checksum || row.checksum === '')) {
        db.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = ?').run(
          expectedChecksum,
          file,
        );
      } else if (row && row.checksum !== expectedChecksum) {
        throw new Error(
          `Database migration integrity mismatch for ${file}: expected checksum ${expectedChecksum}, found ${row.checksum}`,
        );
      }
    }
  }
}

function seedReferenceCatalog(db: DatabaseSync): void {
  const upsertRole = db.prepare(`
    INSERT INTO roles (id, code, name, scope, description)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      scope = excluded.scope,
      description = excluded.description
  `);

  for (const role of ROLES_SEED) {
    upsertRole.run(role.id, role.code, role.name, role.scope, role.description);
  }

  const upsertPerm = db.prepare(`
    INSERT INTO permissions (id, code, description)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      description = excluded.description
  `);

  for (const perm of PERMISSIONS_SEED) {
    upsertPerm.run(perm.id, perm.code, perm.description);
  }

  const insertRolePerm = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    VALUES (?, ?)
  `);

  for (const [roleId, permIds] of Object.entries(ROLE_PERMISSION_MAP)) {
    for (const permId of permIds) {
      insertRolePerm.run(roleId, permId);
    }
  }

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_json, updated_by)
    VALUES (?, ?, 'system')
  `);

  insertSetting.run('allow_public_school_registration', JSON.stringify(true));
  insertSetting.run('require_access_code_for_school_registration', JSON.stringify(true));
  insertSetting.run('require_school_verification_banner', JSON.stringify(true));
  insertSetting.run('session_ttl_hours', JSON.stringify(24));
  insertSetting.run('dt_ai_core_enabled', JSON.stringify(false));
}

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = getDbFilePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  seedReferenceCatalog(db);

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } finally {
      dbInstance = null;
    }
  }
}

export interface DatabaseIntegrityReport {
  ok: boolean;
  integrityCheck: string;
  foreignKeyViolations: number;
  journalMode: string;
  foreignKeysEnabled: boolean;
  dbSizeBytes: number;
  migrations: Array<{
    version: string;
    applied_at: string;
    checksum: string;
    checksumMatch: boolean;
  }>;
}

export function verifyDatabaseIntegrity(): DatabaseIntegrityReport {
  const db = getDb();
  const dbPath = getDbFilePath();
  const integrityRow = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  const journalRow = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
  const fkRow = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };

  const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');
  const applied = db
    .prepare('SELECT version, applied_at, checksum FROM schema_migrations ORDER BY id ASC')
    .all() as Array<{ version: string; applied_at: string; checksum: string }>;

  const migrations = applied.map((m) => {
    const filePath = path.join(migrationsDir, m.version);
    const exists = fs.existsSync(filePath);
    const expected = exists ? sha256Text(fs.readFileSync(filePath, 'utf-8')) : '';
    return {
      version: m.version,
      applied_at: m.applied_at,
      checksum: m.checksum || '',
      checksumMatch: exists && m.checksum === expected,
    };
  });

  const stat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;

  return {
    ok:
      integrityRow.integrity_check === 'ok' &&
      fkViolations.length === 0 &&
      fkRow.foreign_keys === 1 &&
      migrations.every((m) => m.checksumMatch),
    integrityCheck: integrityRow.integrity_check,
    foreignKeyViolations: fkViolations.length,
    journalMode: journalRow.journal_mode,
    foreignKeysEnabled: fkRow.foreign_keys === 1,
    dbSizeBytes: stat?.size ?? 0,
    migrations,
  };
}
