import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeDb, getDb, getDbFilePath, verifyDatabaseIntegrity } from './client.ts';

const BACKUP_FILENAME_REGEX = /^dt_edtech_backup_[A-Za-z0-9_-]+\.sqlite$/;

export function getBackupDir(): string {
  const dir = path.resolve(
    process.cwd(),
    process.env.SQLITE_BACKUP_DIR || path.join(path.dirname(getDbFilePath()), 'backups'),
  );
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveSafeBackupPath(filename: string): string {
  if (!BACKUP_FILENAME_REGEX.test(filename)) {
    throw new Error('Invalid backup filename format.');
  }
  const backupDir = getBackupDir();
  const resolved = path.resolve(backupDir, filename);
  if (!resolved.startsWith(backupDir + path.sep)) {
    throw new Error('Backup path escaped storage confinement.');
  }
  return resolved;
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifyBackupSqliteFile(backupPath: string): void {
  const checkDb = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const integrity = checkDb.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string;
    };
    if (integrity.integrity_check !== 'ok') {
      throw new Error(`Backup integrity check failed: ${integrity.integrity_check}`);
    }
    const tableRow = checkDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get() as { name: string } | undefined;
    if (!tableRow) {
      throw new Error('Backup archive is missing schema_migrations metadata.');
    }
  } finally {
    checkDb.close();
  }
}

export interface BackupRecord {
  id: string;
  filename: string;
  size_bytes: number;
  sha256_hex: string;
  created_by_email: string;
  notes: string;
  created_at: string;
  fileExists?: boolean;
}

export function createDatabaseBackup(actorEmail: string, notes = ''): BackupRecord {
  const db = getDb();
  const backupDir = getBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = crypto.randomBytes(3).toString('hex');
  const filename = `dt_edtech_backup_${stamp}_${suffix}.sqlite`;
  const targetPath = resolveSafeBackupPath(filename);

  if (!targetPath.startsWith(backupDir + path.sep)) {
    throw new Error('Invalid backup path.');
  }

  // VACUUM INTO creates an atomic transactionally consistent snapshot safe under WAL mode
  const escapedPath = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}';`);

  verifyBackupSqliteFile(targetPath);
  const stat = fs.statSync(targetPath);
  const sha256 = sha256File(targetPath);
  const id = `bak_${crypto.randomUUID()}`;

  db.prepare(`
    INSERT INTO database_backups (id, filename, size_bytes, sha256_hex, created_by_email, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, filename, stat.size, sha256, actorEmail, notes.slice(0, 200));

  return {
    id,
    filename,
    size_bytes: stat.size,
    sha256_hex: sha256,
    created_by_email: actorEmail,
    notes: notes.slice(0, 200),
    created_at: new Date().toISOString(),
    fileExists: true,
  };
}

export function listDatabaseBackups(): BackupRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT id, filename, size_bytes, sha256_hex, created_by_email, notes, created_at
      FROM database_backups
      ORDER BY created_at DESC
      LIMIT 30
    `)
    .all() as unknown as BackupRecord[];

  return rows.map((row) => {
    let fileExists = false;
    try {
      const p = resolveSafeBackupPath(row.filename);
      fileExists = fs.existsSync(p);
    } catch {
      fileExists = false;
    }
    return { ...row, fileExists };
  });
}

export function restoreDatabaseBackup(filename: string, actorEmail: string): {
  restoredFrom: string;
  preRestoreBackup: string;
  integrityOk: boolean;
} {
  const sourcePath = resolveSafeBackupPath(filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Backup file does not exist on disk.');
  }

  // Verify the source backup before closing or overwriting anything
  verifyBackupSqliteFile(sourcePath);

  // Create an automatic safety backup before restoring
  const safetyBackup = createDatabaseBackup(
    actorEmail,
    `Automatic pre-restore safety snapshot before restoring ${filename}`,
  );

  const dbPath = getDbFilePath();
  closeDb();

  try {
    for (const ext of ['-wal', '-shm']) {
      const sidecar = `${dbPath}${ext}`;
      if (fs.existsSync(sidecar)) {
        fs.unlinkSync(sidecar);
      }
    }
    fs.copyFileSync(sourcePath, dbPath);

    // Reopen, run any pending migrations, and verify integrity
    getDb();
    const integrity = verifyDatabaseIntegrity();
    if (!integrity.ok) {
      throw new Error('Post-restore database integrity check failed.');
    }

    return {
      restoredFrom: filename,
      preRestoreBackup: safetyBackup.filename,
      integrityOk: integrity.ok,
    };
  } catch (err) {
    // Re-open so server stays functional if possible
    getDb();
    throw err;
  }
}
