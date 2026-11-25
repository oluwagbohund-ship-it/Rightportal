import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { buildStudentsCsvTemplate, parseStudentsCsv } from '../../../lib/student-csv.ts';
import { recordAuditLog } from '../../audit.ts';
import { deleteStoredFileById, saveValidatedFile } from '../../file-storage.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import {
  allocateUniqueAdmissionNumber,
  normalizePagination,
  validateActiveClassAndArm,
} from '../../school-helpers.ts';
import { hashPassword } from '../../security.ts';
import { revokeAllSessionsForUser } from '../../session-service.ts';
import {
  bulkImportStudentsSchema,
  createStudentSchema,
  entityDocumentUploadSchema,
  promoteStudentSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
  uploadFileSchema,
} from '../../validation.ts';

export const schoolStudentsRouter = Router();

schoolStudentsRouter.get(
  '/students',
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 50);

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const classId = typeof req.query.classId === 'string' ? req.query.classId.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const admissionYear =
      typeof req.query.admissionYear === 'string' ? req.query.admissionYear.trim() : '';

    const whereClauses = ['s.school_id = ?'];
    const params: Array<string | number> = [schoolId];

    if (search) {
      const pattern = `%${search.toLowerCase()}%`;
      whereClauses.push(
        '(LOWER(s.first_name) LIKE ? OR LOWER(s.last_name) LIKE ? OR LOWER(s.admission_number) LIKE ? OR LOWER(s.student_email) LIKE ?)',
      );
      params.push(pattern, pattern, pattern, pattern);
    }
    if (classId && classId !== 'all') {
      whereClauses.push('s.current_class_id = ?');
      params.push(classId);
    }
    if (status && status !== 'all') {
      whereClauses.push('s.status = ?');
      params.push(status);
    }
    if (/^\d{4}$/.test(admissionYear)) {
      whereClauses.push("substr(s.admission_date, 1, 4) = ?");
      params.push(admissionYear);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM students s WHERE ${whereSql}`)
      .get(...params) as { total: number };

    const students = db
      .prepare(`
        SELECT
          s.id,
          s.user_id,
          s.admission_number,
          s.admission_date,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.date_of_birth,
          s.gender,
          s.student_email,
          s.student_phone,
          s.current_class_id,
          s.current_arm_id,
          s.photo_file_id,
          s.status,
          s.created_at,
          c.name AS class_name,
          a.name AS arm_name,
          (SELECT COUNT(*) FROM student_guardians sg WHERE sg.student_id = s.id AND sg.school_id = s.school_id) AS guardians_count
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE ${whereSql}
        ORDER BY s.created_at DESC, s.last_name ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    const years = db
      .prepare(`
        SELECT DISTINCT substr(admission_date, 1, 4) AS year
        FROM students
        WHERE school_id = ?
        ORDER BY year DESC
      `)
      .all(schoolId) as Array<{ year: string }>;

    res.json({
      students,
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.max(1, Math.ceil(countRow.total / limit)),
      },
      admissionYears: years.map((y) => y.year).filter(Boolean),
    });
  },
);

schoolStudentsRouter.get(
  '/students/promotions/history',
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';

    const history = studentId
      ? db
          .prepare(`
            SELECT
              h.*,
              s.first_name,
              s.last_name,
              s.admission_number,
              fc.name AS from_class_name,
              fa.name AS from_arm_name,
              tc.name AS to_class_name,
              ta.name AS to_arm_name,
              acs.name AS session_name,
              u.full_name AS recorded_by_name
            FROM student_class_history h
            INNER JOIN students s ON s.id = h.student_id
            LEFT JOIN school_classes fc ON fc.id = h.from_class_id
            LEFT JOIN class_arms fa ON fa.id = h.from_arm_id
            INNER JOIN school_classes tc ON tc.id = h.to_class_id
            LEFT JOIN class_arms ta ON ta.id = h.to_arm_id
            LEFT JOIN academic_sessions acs ON acs.id = h.academic_session_id
            LEFT JOIN users u ON u.id = h.recorded_by_user_id
            WHERE h.school_id = ? AND h.student_id = ?
            ORDER BY h.created_at DESC, h.rowid DESC
          `)
          .all(schoolId, studentId)
      : db
          .prepare(`
            SELECT
              h.*,
              s.first_name,
              s.last_name,
              s.admission_number,
              fc.name AS from_class_name,
              fa.name AS from_arm_name,
              tc.name AS to_class_name,
              ta.name AS to_arm_name,
              acs.name AS session_name,
              u.full_name AS recorded_by_name
            FROM student_class_history h
            INNER JOIN students s ON s.id = h.student_id
            LEFT JOIN school_classes fc ON fc.id = h.from_class_id
            LEFT JOIN class_arms fa ON fa.id = h.from_arm_id
            INNER JOIN school_classes tc ON tc.id = h.to_class_id
            LEFT JOIN class_arms ta ON ta.id = h.to_arm_id
            LEFT JOIN academic_sessions acs ON acs.id = h.academic_session_id
            LEFT JOIN users u ON u.id = h.recorded_by_user_id
            WHERE h.school_id = ?
            ORDER BY h.created_at DESC, h.rowid DESC
            LIMIT 100
          `)
          .all(schoolId);

    res.json({ history });
  },
);

schoolStudentsRouter.get(
  '/students/bulk-import/template.csv',
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const classes = db
      .prepare(`
        SELECT id, name
        FROM school_classes
        WHERE school_id = ? AND status != 'archived'
        ORDER BY level_order ASC, name ASC
      `)
      .all(schoolId) as Array<{ id: string; name: string }>;

    const arms = db
      .prepare(`
        SELECT class_id, name, status
        FROM class_arms
        WHERE school_id = ? AND status != 'archived'
        ORDER BY name ASC
      `)
      .all(schoolId) as Array<{ class_id: string; name: string; status: string }>;

    const armsByClass = new Map<string, Array<{ name: string; status: string }>>();
    for (const arm of arms) {
      const list = armsByClass.get(arm.class_id) ?? [];
      list.push({ name: arm.name, status: arm.status });
      armsByClass.set(arm.class_id, list);
    }

    const csv = buildStudentsCsvTemplate(
      classes.map((c) => ({ name: c.name, arms: armsByClass.get(c.id) ?? [] })),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students-import-template.csv"');
    res.send(csv);
  },
);

schoolStudentsRouter.post(
  '/students/bulk-import',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = bulkImportStudentsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid bulk import request.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;

    let defaultClassRow: { id: string; name: string; status: string; capacity: number } | null = null;
    let defaultArmRow: { id: string; name: string; class_id: string; status: string; capacity: number } | null =
      null;

    if (d.defaultClassId) {
      const check = validateActiveClassAndArm({
        schoolId,
        classId: d.defaultClassId,
        armId: d.defaultArmId || null,
      });
      if (!check.ok || !check.classRow) {
        res.status(400).json({ error: check.error || 'Invalid default class selection.' });
        return;
      }
      defaultClassRow = check.classRow;
      defaultArmRow = check.armRow ?? null;
    } else if (d.defaultArmId) {
      res.status(400).json({ error: 'Select a default class before choosing a default arm.' });
      return;
    }

    const parsedCsv = parseStudentsCsv(d.csvContent, {
      defaultAdmissionDate: d.defaultAdmissionDate || undefined,
    });
    if (parsedCsv.fileErrors.length > 0) {
      res.status(400).json({
        error: parsedCsv.fileErrors[0],
        fileErrors: parsedCsv.fileErrors,
        missingRequiredColumns: parsedCsv.missingRequiredColumns,
      });
      return;
    }

    // Load tenant classes, arms, and active occupancy snapshots
    const classRows = db
      .prepare(`SELECT id, name, code, status, capacity FROM school_classes WHERE school_id = ?`)
      .all(schoolId) as Array<{ id: string; name: string; code: string; status: string; capacity: number }>;

    const armRows = db
      .prepare(`SELECT id, class_id, name, status, capacity FROM class_arms WHERE school_id = ?`)
      .all(schoolId) as Array<{ id: string; class_id: string; name: string; status: string; capacity: number }>;

    const classOccupancyRows = db
      .prepare(`
        SELECT current_class_id AS class_id, COUNT(*) AS cnt
        FROM students
        WHERE school_id = ? AND status = 'active' AND current_class_id IS NOT NULL
        GROUP BY current_class_id
      `)
      .all(schoolId) as Array<{ class_id: string; cnt: number }>;

    const armOccupancyRows = db
      .prepare(`
        SELECT current_arm_id AS arm_id, COUNT(*) AS cnt
        FROM students
        WHERE school_id = ? AND status = 'active' AND current_arm_id IS NOT NULL
        GROUP BY current_arm_id
      `)
      .all(schoolId) as Array<{ arm_id: string; cnt: number }>;

    const classOccupiedMap = new Map<string, number>(classOccupancyRows.map((r) => [r.class_id, r.cnt]));
    const armOccupiedMap = new Map<string, number>(armOccupancyRows.map((r) => [r.arm_id, r.cnt]));
    const projectedClassAdds = new Map<string, number>();
    const projectedArmAdds = new Map<string, number>();

    const seenAdmNumbers = new Set<string>();
    const seenLoginEmails = new Set<string>();

    const existingAdmStmt = db.prepare(
      `SELECT id FROM students WHERE school_id = ? AND UPPER(admission_number) = UPPER(?) LIMIT 1`,
    );
    const existingUserEmailStmt = db.prepare(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
    );

    interface EvaluatedBulkStudentRow {
      rowNumber: number;
      status: 'valid' | 'error';
      issues: string[];
      firstName: string;
      middleName: string;
      lastName: string;
      dateOfBirth: string;
      gender: 'Male' | 'Female' | 'Other' | '';
      admissionNumber: string;
      admissionDate: string;
      studentEmail: string;
      studentPhone: string;
      residentialAddress: string;
      nationality: string;
      stateOfOrigin: string;
      previousSchool: string;
      classId: string | null;
      className: string;
      armId: string | null;
      armName: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
      emergencyContactRelationship: string;
      createLogin: boolean;
      portalPassword: string;
    }

    const evaluatedRows: EvaluatedBulkStudentRow[] = parsedCsv.rows.map((row) => {
      const issues = [...row.localIssues];

      // Admission number uniqueness (DB + intra-CSV)
      if (row.admissionNumber) {
        const admUpper = row.admissionNumber.toUpperCase();
        if (seenAdmNumbers.has(admUpper)) {
          issues.push(`Duplicate admission number "${row.admissionNumber}" within CSV`);
        } else if (existingAdmStmt.get(schoolId, row.admissionNumber)) {
          issues.push(`Admission number "${row.admissionNumber}" already exists in school`);
        }
      }

      // Resolve target class & arm
      let resolvedClass: { id: string; name: string; status: string; capacity: number } | null = null;
      let resolvedArm: { id: string; name: string; class_id: string; status: string; capacity: number } | null =
        null;

      if (row.className) {
        const needle = row.className.trim().toLowerCase();
        const foundClass = classRows.find(
          (c) => c.name.trim().toLowerCase() === needle || c.code.trim().toLowerCase() === needle || c.id === row.className,
        );
        if (!foundClass) {
          issues.push(`Class "${row.className}" was not found in your school`);
        } else if (foundClass.status === 'archived') {
          issues.push(`Class "${foundClass.name}" is archived`);
        } else {
          resolvedClass = foundClass;
        }
      } else if (defaultClassRow) {
        resolvedClass = defaultClassRow;
      }

      if (row.armName) {
        if (!resolvedClass) {
          issues.push(`Arm "${row.armName}" cannot be assigned without a valid class`);
        } else {
          const armNeedle = row.armName.trim().toLowerCase();
          const foundArm = armRows.find(
            (a) =>
              a.class_id === resolvedClass!.id &&
              (a.name.trim().toLowerCase() === armNeedle || a.id === row.armName),
          );
          if (!foundArm) {
            issues.push(`Arm "${row.armName}" not found under class ${resolvedClass.name}`);
          } else if (foundArm.status === 'archived') {
            issues.push(`Arm "${foundArm.name}" is archived`);
          } else {
            resolvedArm = foundArm;
          }
        }
      } else if (!row.className && defaultArmRow && resolvedClass?.id === defaultArmRow.class_id) {
        resolvedArm = defaultArmRow;
      }

      // Capacity check (projected across batch)
      if (resolvedArm) {
        const used = (armOccupiedMap.get(resolvedArm.id) ?? 0) + (projectedArmAdds.get(resolvedArm.id) ?? 0);
        if (used >= resolvedArm.capacity) {
          issues.push(`Arm ${resolvedClass?.name ?? ''} (${resolvedArm.name}) capacity (${resolvedArm.capacity}) reached`);
        }
      } else if (resolvedClass) {
        const used =
          (classOccupiedMap.get(resolvedClass.id) ?? 0) + (projectedClassAdds.get(resolvedClass.id) ?? 0);
        if (used >= resolvedClass.capacity) {
          issues.push(`Class ${resolvedClass.name} capacity (${resolvedClass.capacity}) reached`);
        }
      }

      // Portal login determination
      const createLogin =
        row.createPortalLogin !== null
          ? row.createPortalLogin
          : Boolean(d.createPortalLogins && row.studentEmail);

      if (createLogin) {
        if (!row.studentEmail) {
          issues.push('Student email is required when creating a portal login');
        } else {
          const emailLower = row.studentEmail.toLowerCase();
          if (seenLoginEmails.has(emailLower)) {
            issues.push(`Duplicate student email "${row.studentEmail}" within CSV`);
          } else if (existingUserEmailStmt.get(emailLower)) {
            issues.push(`Email "${row.studentEmail}" already has a portal account`);
          }
        }
      }

      const valid = issues.length === 0;
      if (valid) {
        if (row.admissionNumber) seenAdmNumbers.add(row.admissionNumber.toUpperCase());
        if (createLogin && row.studentEmail) seenLoginEmails.add(row.studentEmail.toLowerCase());
        if (resolvedClass) {
          projectedClassAdds.set(resolvedClass.id, (projectedClassAdds.get(resolvedClass.id) ?? 0) + 1);
        }
        if (resolvedArm) {
          projectedArmAdds.set(resolvedArm.id, (projectedArmAdds.get(resolvedArm.id) ?? 0) + 1);
        }
      }

      return {
        rowNumber: row.rowNumber,
        status: valid ? 'valid' : 'error',
        issues,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        admissionNumber: row.admissionNumber,
        admissionDate: row.admissionDate,
        studentEmail: row.studentEmail,
        studentPhone: row.studentPhone,
        residentialAddress: row.residentialAddress,
        nationality: row.nationality,
        stateOfOrigin: row.stateOfOrigin,
        previousSchool: row.previousSchool,
        classId: resolvedClass?.id ?? null,
        className: resolvedClass?.name ?? 'Unassigned',
        armId: resolvedArm?.id ?? null,
        armName: resolvedArm?.name ?? '',
        emergencyContactName: row.emergencyContactName,
        emergencyContactPhone: row.emergencyContactPhone,
        emergencyContactRelationship: row.emergencyContactRelationship,
        createLogin,
        portalPassword: row.portalPassword,
      };
    });

    const validRows = evaluatedRows.filter((r) => r.status === 'valid');
    const errorRows = evaluatedRows.filter((r) => r.status === 'error');

    if (d.mode === 'preview') {
      res.json({
        mode: 'preview',
        summary: {
          totalRows: evaluatedRows.length,
          validCount: validRows.length,
          errorCount: errorRows.length,
          loginsToCreateCount: validRows.filter((r) => r.createLogin).length,
        },
        recognizedColumns: parsedCsv.recognizedColumns,
        unknownHeaders: parsedCsv.unknownHeaders,
        rows: evaluatedRows.map(({ portalPassword: _pw, ...publicRow }) => ({
          ...publicRow,
          hasCustomPassword: Boolean(_pw),
        })),
      });
      return;
    }

    // Commit mode
    if (!d.skipInvalidRows && errorRows.length > 0) {
      res.status(400).json({
        error: `${errorRows.length} CSV row(s) have validation issues. Fix them or choose to skip invalid rows.`,
        summary: {
          totalRows: evaluatedRows.length,
          validCount: validRows.length,
          errorCount: errorRows.length,
        },
        errors: errorRows.map((r) => ({ rowNumber: r.rowNumber, issues: r.issues })),
      });
      return;
    }

    if (validRows.length === 0) {
      res.status(400).json({
        error: 'No valid student rows are available to import.',
        summary: {
          totalRows: evaluatedRows.length,
          validCount: 0,
          errorCount: errorRows.length,
        },
        errors: errorRows.map((r) => ({ rowNumber: r.rowNumber, issues: r.issues })),
      });
      return;
    }

    const currentSession = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(schoolId) as { id: string } | undefined;

    const insertUserStmt = db.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
      VALUES (?, ?, ?, ?, 'school_member', 1)
    `);
    const insertMemStmt = db.prepare(`
      INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
      VALUES (?, ?, ?, 'role_student', ?, 'active')
    `);
    const insertStudentStmt = db.prepare(`
      INSERT INTO students (
        id, school_id, user_id, admission_number, admission_date,
        first_name, middle_name, last_name, date_of_birth, gender,
        student_email, student_phone, residential_address, nationality, state_of_origin, previous_school,
        current_class_id, current_arm_id,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    const insertEnrollStmt = db.prepare(`
      INSERT INTO class_enrollments (id, school_id, student_id, class_id, arm_id, academic_session_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    const insertHistoryStmt = db.prepare(`
      INSERT INTO student_class_history (
        id, school_id, student_id, academic_session_id,
        from_class_id, from_arm_id, to_class_id, to_arm_id,
        action_type, effective_date, notes, recorded_by_user_id
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'initial_placement', ?, 'Bulk CSV student import', ?)
    `);

    const imported: Array<{
      rowNumber: number;
      id: string;
      admissionNumber: string;
      fullName: string;
      className: string;
      armName: string;
      studentEmail: string;
      loginCreated: boolean;
      temporaryPassword: string | null;
    }> = [];

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of validRows) {
        const studentId = `stu_${crypto.randomUUID()}`;
        const assignedAdmissionNumber = row.admissionNumber
          ? row.admissionNumber
          : allocateUniqueAdmissionNumber(schoolId, row.admissionDate);

        let linkedUserId: string | null = null;
        let issuedTempPassword: string | null = null;
        const fullName = [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ');

        if (row.createLogin && row.studentEmail) {
          linkedUserId = `usr_${crypto.randomUUID()}`;
          const rawPass =
            row.portalPassword && row.portalPassword.length >= 8
              ? row.portalPassword
              : `Stu-${crypto.randomBytes(4).toString('hex')}!`;
          issuedTempPassword = rawPass;

          insertUserStmt.run(
            linkedUserId,
            row.studentEmail.toLowerCase(),
            fullName,
            hashPassword(rawPass),
          );
          insertMemStmt.run(`mem_${crypto.randomUUID()}`, schoolId, linkedUserId, assignedAdmissionNumber);
        }

        insertStudentStmt.run(
          studentId,
          schoolId,
          linkedUserId,
          assignedAdmissionNumber,
          row.admissionDate,
          row.firstName,
          row.middleName,
          row.lastName,
          row.dateOfBirth,
          row.gender,
          row.studentEmail.toLowerCase(),
          row.studentPhone,
          row.residentialAddress,
          row.nationality,
          row.stateOfOrigin,
          row.previousSchool,
          row.classId,
          row.armId,
          row.emergencyContactName,
          row.emergencyContactPhone,
          row.emergencyContactRelationship,
        );

        if (row.classId) {
          insertEnrollStmt.run(
            `enr_${crypto.randomUUID()}`,
            schoolId,
            studentId,
            row.classId,
            row.armId,
            currentSession?.id ?? null,
          );
          insertHistoryStmt.run(
            `sch_${crypto.randomUUID()}`,
            schoolId,
            studentId,
            currentSession?.id ?? null,
            row.classId,
            row.armId,
            row.admissionDate,
            req.auth!.id,
          );
        }

        imported.push({
          rowNumber: row.rowNumber,
          id: studentId,
          admissionNumber: assignedAdmissionNumber,
          fullName,
          className: row.className,
          armName: row.armName,
          studentEmail: row.studentEmail.toLowerCase(),
          loginCreated: Boolean(linkedUserId),
          temporaryPassword: issuedTempPassword,
        });
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Bulk import students failed:', err);
      res.status(500).json({ error: 'Unable to complete student bulk import.' });
      return;
    }

    const loginsCreatedCount = imported.filter((r) => r.loginCreated).length;

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student.bulk_imported',
      resourceType: 'student',
      resourceId: imported[0]?.id ?? null,
      outcome: 'success',
      metadata: {
        totalRows: evaluatedRows.length,
        importedCount: imported.length,
        skippedCount: errorRows.length,
        loginsCreatedCount,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      mode: 'commit',
      summary: {
        totalRows: evaluatedRows.length,
        importedCount: imported.length,
        skippedCount: errorRows.length,
        loginsCreatedCount,
      },
      imported,
      errors: errorRows.map((r) => ({
        rowNumber: r.rowNumber,
        fullName: [r.firstName, r.lastName].filter(Boolean).join(' ') || `Row ${r.rowNumber}`,
        issues: r.issues,
      })),
    });
  },
);

schoolStudentsRouter.post(
  '/students',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid student payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;

    let classId: string | null = d.currentClassId || null;
    let armId: string | null = d.currentArmId || null;
    if (classId) {
      const check = validateActiveClassAndArm({ schoolId, classId, armId });
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
      armId = check.armRow?.id ?? null;
    } else {
      armId = null;
    }

    if (d.guardianLink?.parentId) {
      const parent = db
        .prepare('SELECT id FROM parents WHERE id = ? AND school_id = ?')
        .get(d.guardianLink.parentId, schoolId);
      if (!parent) {
        res.status(404).json({ error: 'Selected guardian does not belong to your school.' });
        return;
      }
    }

    if (d.portalAccount?.createLogin) {
      if (!d.studentEmail) {
        res.status(400).json({ error: 'Student email is required to provision a portal login account.' });
        return;
      }
      if (!d.portalAccount.password || d.portalAccount.password.length < 8) {
        res.status(400).json({ error: 'Initial student portal password must be at least 8 characters.' });
        return;
      }
      const existingUser = db
        .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
        .get(d.studentEmail);
      if (existingUser) {
        res.status(409).json({ error: 'A user account with this student email already exists.' });
        return;
      }
    }

    const studentId = `stu_${crypto.randomUUID()}`;
    let assignedAdmissionNumber = '';
    let linkedUserId: string | null = null;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.admissionNumber) {
        const dupAdm = db
          .prepare('SELECT id FROM students WHERE school_id = ? AND UPPER(admission_number) = UPPER(?)')
          .get(schoolId, d.admissionNumber);
        if (dupAdm) {
          db.exec('ROLLBACK');
          res.status(409).json({
            error: `Admission number "${d.admissionNumber}" is already assigned to another student in your school.`,
          });
          return;
        }
        assignedAdmissionNumber = d.admissionNumber;
      } else {
        assignedAdmissionNumber = allocateUniqueAdmissionNumber(schoolId, d.admissionDate);
      }

      if (d.portalAccount?.createLogin && d.studentEmail && d.portalAccount.password) {
        linkedUserId = `usr_${crypto.randomUUID()}`;
        const fullName = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ');
        db.prepare(`
          INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
          VALUES (?, ?, ?, ?, 'school_member', 1)
        `).run(
          linkedUserId,
          d.studentEmail.toLowerCase(),
          fullName,
          hashPassword(d.portalAccount.password),
        );

        db.prepare(`
          INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
          VALUES (?, ?, ?, 'role_student', ?, 'active')
        `).run(
          `mem_${crypto.randomUUID()}`,
          schoolId,
          linkedUserId,
          assignedAdmissionNumber,
        );
      }

      db.prepare(`
        INSERT INTO students (
          id, school_id, user_id, admission_number, admission_date,
          first_name, middle_name, last_name, date_of_birth, gender,
          student_email, student_phone, residential_address, nationality, state_of_origin, previous_school,
          current_class_id, current_arm_id,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        studentId,
        schoolId,
        linkedUserId,
        assignedAdmissionNumber,
        d.admissionDate,
        d.firstName,
        d.middleName,
        d.lastName,
        d.dateOfBirth,
        d.gender,
        d.studentEmail.toLowerCase(),
        d.studentPhone,
        d.residentialAddress,
        d.nationality,
        d.stateOfOrigin,
        d.previousSchool,
        classId,
        armId,
        d.emergencyContactName,
        d.emergencyContactPhone,
        d.emergencyContactRelationship,
      );

      const currentSession = db
        .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
        .get(schoolId) as { id: string } | undefined;

      if (classId) {
        db.prepare(`
          INSERT INTO class_enrollments (id, school_id, student_id, class_id, arm_id, academic_session_id, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `).run(`enr_${crypto.randomUUID()}`, schoolId, studentId, classId, armId, currentSession?.id ?? null);

        db.prepare(`
          INSERT INTO student_class_history (
            id, school_id, student_id, academic_session_id,
            from_class_id, from_arm_id, to_class_id, to_arm_id,
            action_type, effective_date, notes, recorded_by_user_id
          ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'initial_placement', ?, 'Initial student registration placement', ?)
        `).run(
          `sch_${crypto.randomUUID()}`,
          schoolId,
          studentId,
          currentSession?.id ?? null,
          classId,
          armId,
          d.admissionDate,
          req.auth!.id,
        );
      }

      if (d.guardianLink?.parentId) {
        db.prepare(`
          INSERT INTO student_guardians (
            id, school_id, student_id, parent_id, relationship,
            is_primary_guardian, is_emergency_contact
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `grd_${crypto.randomUUID()}`,
          schoolId,
          studentId,
          d.guardianLink.parentId,
          d.guardianLink.relationship,
          d.guardianLink.isPrimaryGuardian ? 1 : 0,
          d.guardianLink.isEmergencyContact ? 1 : 0,
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create student failed:', err);
      res.status(500).json({ error: 'Unable to register student.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student.created',
      resourceType: 'student',
      resourceId: studentId,
      outcome: 'success',
      metadata: {
        admissionNumber: assignedAdmissionNumber,
        fullName: `${d.firstName} ${d.lastName}`,
        classId,
        armId,
      },
      ipAddress: getClientIp(req),
    });

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    res.status(201).json({ student });
  },
);

schoolStudentsRouter.get(
  '/students/:studentId',
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;

    const student = db
      .prepare(`
        SELECT
          s.*,
          c.name AS class_name,
          c.section AS class_section,
          a.name AS arm_name
        FROM students s
        LEFT JOIN school_classes c ON c.id = s.current_class_id
        LEFT JOIN class_arms a ON a.id = s.current_arm_id
        WHERE s.id = ? AND s.school_id = ?
      `)
      .get(studentId, schoolId);

    if (!student) {
      res.status(404).json({ error: 'Student record not found in your school.' });
      return;
    }

    const guardians = db
      .prepare(`
        SELECT
          sg.id AS guardian_id,
          sg.relationship,
          sg.is_primary_guardian,
          sg.is_emergency_contact,
          sg.can_pickup,
          sg.can_view_academic_records,
          sg.can_receive_notifications,
          sg.verified_at,
          p.id AS parent_id,
          p.full_name,
          p.email,
          p.phone,
          p.occupation,
          p.residential_address,
          p.status AS parent_status
        FROM student_guardians sg
        INNER JOIN parents p ON p.id = sg.parent_id
        WHERE sg.student_id = ? AND sg.school_id = ?
        ORDER BY sg.is_primary_guardian DESC, p.full_name ASC
      `)
      .all(studentId, schoolId);

    const history = db
      .prepare(`
        SELECT
          h.*,
          fc.name AS from_class_name,
          fa.name AS from_arm_name,
          tc.name AS to_class_name,
          ta.name AS to_arm_name,
          acs.name AS session_name,
          u.full_name AS recorded_by_name
        FROM student_class_history h
        LEFT JOIN school_classes fc ON fc.id = h.from_class_id
        LEFT JOIN class_arms fa ON fa.id = h.from_arm_id
        INNER JOIN school_classes tc ON tc.id = h.to_class_id
        LEFT JOIN class_arms ta ON ta.id = h.to_arm_id
        LEFT JOIN academic_sessions acs ON acs.id = h.academic_session_id
        LEFT JOIN users u ON u.id = h.recorded_by_user_id
        WHERE h.student_id = ? AND h.school_id = ?
        ORDER BY h.created_at DESC, h.rowid DESC
      `)
      .all(studentId, schoolId);

    const documents = db
      .prepare(`
        SELECT
          sd.id,
          sd.document_type,
          sd.title,
          sd.file_id,
          sd.created_at,
          f.original_name,
          f.mime_type,
          f.size_bytes
        FROM student_documents sd
        INNER JOIN stored_files f ON f.id = sd.file_id
        WHERE sd.student_id = ? AND sd.school_id = ?
        ORDER BY sd.created_at DESC
      `)
      .all(studentId, schoolId);

    res.json({ student, guardians, history, documents });
  },
);

schoolStudentsRouter.patch(
  '/students/:studentId',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid student update.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;
    const d = parsed.data;

    const existing = db
      .prepare('SELECT id, current_class_id, current_arm_id, admission_number FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, schoolId) as
      | { id: string; current_class_id: string | null; current_arm_id: string | null; admission_number: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    const dupAdm = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND UPPER(admission_number) = UPPER(?) AND id != ?')
      .get(schoolId, d.admissionNumber, studentId);
    if (dupAdm) {
      res.status(409).json({
        error: `Admission number "${d.admissionNumber}" is already assigned to another student.`,
      });
      return;
    }

    let classId: string | null = d.currentClassId || null;
    let armId: string | null = d.currentArmId || null;
    if (classId) {
      const check = validateActiveClassAndArm({
        schoolId,
        classId,
        armId,
        excludeStudentId: studentId,
      });
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
      armId = check.armRow?.id ?? null;
    } else {
      armId = null;
    }

    const placementChanged =
      classId &&
      (classId !== existing.current_class_id || (armId ?? null) !== (existing.current_arm_id ?? null));

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE students
        SET
          admission_number = ?,
          admission_date = ?,
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          date_of_birth = ?,
          gender = ?,
          student_email = ?,
          student_phone = ?,
          residential_address = ?,
          nationality = ?,
          state_of_origin = ?,
          previous_school = ?,
          current_class_id = ?,
          current_arm_id = ?,
          emergency_contact_name = ?,
          emergency_contact_phone = ?,
          emergency_contact_relationship = ?,
          updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(
        d.admissionNumber,
        d.admissionDate,
        d.firstName,
        d.middleName,
        d.lastName,
        d.dateOfBirth,
        d.gender,
        d.studentEmail.toLowerCase(),
        d.studentPhone,
        d.residentialAddress,
        d.nationality,
        d.stateOfOrigin,
        d.previousSchool,
        classId,
        armId,
        d.emergencyContactName,
        d.emergencyContactPhone,
        d.emergencyContactRelationship,
        studentId,
        schoolId,
      );

      if (placementChanged && classId) {
        const currentSession = db
          .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
          .get(schoolId) as { id: string } | undefined;

        db.prepare(`
          UPDATE class_enrollments
          SET status = 'transferred', ended_at = datetime('now')
          WHERE school_id = ? AND student_id = ? AND status = 'active'
        `).run(schoolId, studentId);

        db.prepare(`
          INSERT INTO class_enrollments (id, school_id, student_id, class_id, arm_id, academic_session_id, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `).run(`enr_${crypto.randomUUID()}`, schoolId, studentId, classId, armId, currentSession?.id ?? null);

        db.prepare(`
          INSERT INTO student_class_history (
            id, school_id, student_id, academic_session_id,
            from_class_id, from_arm_id, to_class_id, to_arm_id,
            action_type, effective_date, notes, recorded_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reassignment', date('now'), 'Updated via student profile edit', ?)
        `).run(
          `sch_${crypto.randomUUID()}`,
          schoolId,
          studentId,
          currentSession?.id ?? null,
          existing.current_class_id,
          existing.current_arm_id,
          classId,
          armId,
          req.auth!.id,
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update student failed:', err);
      res.status(500).json({ error: 'Unable to update student record.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student.updated',
      resourceType: 'student',
      resourceId: studentId,
      outcome: 'success',
      metadata: {
        admissionNumber: d.admissionNumber,
        placementChanged: Boolean(placementChanged),
      },
      ipAddress: getClientIp(req),
    });

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    res.json({ student });
  },
);

schoolStudentsRouter.patch(
  '/students/:studentId/status',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateStudentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid student status.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;

    const existing = db
      .prepare('SELECT id, user_id, admission_number, status FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, schoolId) as
      | { id: string; user_id: string | null; admission_number: string; status: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?").run(
        parsed.data.status,
        studentId,
        schoolId,
      );
      if (parsed.data.status !== 'active') {
        db.prepare(`
          UPDATE student_id_cards
          SET status = 'revoked',
              revoked_by_user_id = ?,
              revoked_reason = ?,
              revoked_at = datetime('now')
          WHERE school_id = ? AND student_id = ? AND status = 'active'
        `).run(
          req.auth!.id,
          `Student enrollment status updated to ${parsed.data.status}`,
          schoolId,
          studentId,
        );
      }
      if (existing.user_id) {
        const memStatus = parsed.data.status === 'active' ? 'active' : 'suspended';
        db.prepare('UPDATE school_memberships SET status = ? WHERE user_id = ? AND school_id = ?').run(
          memStatus,
          existing.user_id,
          schoolId,
        );
        if (memStatus === 'suspended') {
          revokeAllSessionsForUser(existing.user_id);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update student status failed:', err);
      res.status(500).json({ error: 'Unable to update student status.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student.status_updated',
      resourceType: 'student',
      resourceId: studentId,
      outcome: 'success',
      metadata: {
        admissionNumber: existing.admission_number,
        previousStatus: existing.status,
        newStatus: parsed.data.status,
      },
      ipAddress: getClientIp(req),
    });

    res.json({ id: studentId, status: parsed.data.status });
  },
);

schoolStudentsRouter.post(
  '/students/:studentId/promote',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = promoteStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid promotion payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;
    const d = parsed.data;

    const student = db
      .prepare('SELECT id, admission_number, current_class_id, current_arm_id, status FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, schoolId) as
      | {
          id: string;
          admission_number: string;
          current_class_id: string | null;
          current_arm_id: string | null;
          status: string;
        }
      | undefined;

    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }
    if (student.status !== 'active') {
      res.status(400).json({ error: 'Only active students can be promoted or transferred between classes.' });
      return;
    }

    const check = validateActiveClassAndArm({
      schoolId,
      classId: d.toClassId,
      armId: d.toArmId,
      excludeStudentId: studentId,
    });
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    const targetArmId = check.armRow?.id ?? null;

    if (
      student.current_class_id === d.toClassId &&
      (student.current_arm_id ?? null) === targetArmId
    ) {
      res.status(400).json({ error: 'Student is already placed in the selected destination class and arm.' });
      return;
    }

    const currentSession = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(schoolId) as { id: string } | undefined;

    const historyId = `sch_${crypto.randomUUID()}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE class_enrollments
        SET status = ?, ended_at = datetime('now')
        WHERE school_id = ? AND student_id = ? AND status = 'active'
      `).run(d.actionType === 'promotion' ? 'completed' : 'transferred', schoolId, studentId);

      db.prepare(`
        INSERT INTO class_enrollments (id, school_id, student_id, class_id, arm_id, academic_session_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(
        `enr_${crypto.randomUUID()}`,
        schoolId,
        studentId,
        d.toClassId,
        targetArmId,
        currentSession?.id ?? null,
      );

      db.prepare(`
        INSERT INTO student_class_history (
          id, school_id, student_id, academic_session_id,
          from_class_id, from_arm_id, to_class_id, to_arm_id,
          action_type, effective_date, notes, recorded_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        schoolId,
        studentId,
        currentSession?.id ?? null,
        student.current_class_id,
        student.current_arm_id,
        d.toClassId,
        targetArmId,
        d.actionType,
        d.effectiveDate,
        d.notes,
        req.auth!.id,
      );

      db.prepare(`
        UPDATE students
        SET current_class_id = ?, current_arm_id = ?, updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(d.toClassId, targetArmId, studentId, schoolId);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Promote student failed:', err);
      res.status(500).json({ error: 'Unable to complete student class movement.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: `school.student.${d.actionType}`,
      resourceType: 'student_class_history',
      resourceId: historyId,
      outcome: 'success',
      metadata: {
        studentId,
        admissionNumber: student.admission_number,
        fromClassId: student.current_class_id,
        toClassId: d.toClassId,
        toArmId: targetArmId,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ historyId, toClassId: d.toClassId, toArmId: targetArmId });
  },
);

schoolStudentsRouter.post(
  '/students/:studentId/photo',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = uploadFileSchema.safeParse({
      ...req.body,
      category: 'student_profile_picture',
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid photo payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;

    const student = db
      .prepare('SELECT id, user_id, photo_file_id FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, schoolId) as
      | { id: string; user_id: string | null; photo_file_id: string | null }
      | undefined;
    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId: student.user_id,
        category: 'student_profile_picture',
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      db.prepare("UPDATE students SET photo_file_id = ?, updated_at = datetime('now') WHERE id = ?").run(
        file.id,
        studentId,
      );
      if (student.photo_file_id && student.photo_file_id !== file.id) {
        deleteStoredFileById(student.photo_file_id);
      }

      res.status(201).json({ photoFileId: file.id });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload photo.' });
    }
  },
);

schoolStudentsRouter.get(
  '/students/:studentId/documents',
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;

    const student = db
      .prepare('SELECT id, first_name, last_name, admission_number FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, schoolId);
    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    const documents = db
      .prepare(`
        SELECT
          sd.id, sd.document_type, sd.title, sd.file_id, sd.created_at,
          f.original_name, f.mime_type, f.size_bytes,
          u.full_name AS uploaded_by_name
        FROM student_documents sd
        INNER JOIN stored_files f ON f.id = sd.file_id
        LEFT JOIN users u ON u.id = sd.uploaded_by_user_id
        WHERE sd.student_id = ? AND sd.school_id = ?
        ORDER BY sd.created_at DESC
      `)
      .all(studentId, schoolId);

    res.json({ student, documents });
  },
);

schoolStudentsRouter.post(
  '/students/:studentId/documents',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = entityDocumentUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid document payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId } = req.params;

    const student = db
      .prepare('SELECT id, user_id FROM students WHERE id = ? AND school_id = ?')
      .get(studentId, schoolId) as { id: string; user_id: string | null } | undefined;
    if (!student) {
      res.status(404).json({ error: 'Student not found in your school.' });
      return;
    }

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        subjectUserId: student.user_id,
        category: 'student_document',
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      const docId = `sdoc_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO student_documents (id, school_id, student_id, file_id, document_type, title, uploaded_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        schoolId,
        studentId,
        file.id,
        parsed.data.documentType,
        parsed.data.title,
        req.auth!.id,
      );

      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId,
        authEnvironment: 'school',
        action: 'school.student.document_uploaded',
        resourceType: 'student_document',
        resourceId: docId,
        outcome: 'success',
        metadata: { studentId, documentType: parsed.data.documentType, title: parsed.data.title },
        ipAddress: getClientIp(req),
      });

      res.status(201).json({
        document: {
          id: docId,
          document_type: parsed.data.documentType,
          title: parsed.data.title,
          file_id: file.id,
          original_name: file.original_name,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload document.' });
    }
  },
);

schoolStudentsRouter.delete(
  '/students/:studentId/documents/:docId',
  requireCsrfCheck,
  requirePermission('school.students.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { studentId, docId } = req.params;

    const doc = db
      .prepare('SELECT id, file_id, title FROM student_documents WHERE id = ? AND student_id = ? AND school_id = ?')
      .get(docId, studentId, schoolId) as { id: string; file_id: string; title: string } | undefined;

    if (!doc) {
      res.status(404).json({ error: 'Student document not found.' });
      return;
    }

    db.prepare('DELETE FROM student_documents WHERE id = ? AND school_id = ?').run(docId, schoolId);
    deleteStoredFileById(doc.file_id);

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.student.document_deleted',
      resourceType: 'student_document',
      resourceId: docId,
      outcome: 'success',
      metadata: { studentId, title: doc.title },
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  },
);
