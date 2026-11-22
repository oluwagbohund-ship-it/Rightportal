import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import { saveValidatedFile } from '../../file-storage.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import {
  allocateUniqueAdmissionNumber,
  allocateUniqueApplicationReference,
  normalizePagination,
  validateActiveClassAndArm,
} from '../../school-helpers.ts';
import {
  convertAdmissionSchema,
  createAdmissionSchema,
  entityDocumentUploadSchema,
  reviewAdmissionSchema,
} from '../../validation.ts';

export const schoolAdmissionsRouter = Router();

schoolAdmissionsRouter.get(
  '/admissions',
  requirePermission('school.admissions.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { page, limit, offset } = normalizePagination(req.query.page, req.query.limit, 50);

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const whereClauses = ['aa.school_id = ?'];
    const params: Array<string | number> = [schoolId];

    if (search) {
      const pattern = `%${search.toLowerCase()}%`;
      whereClauses.push(
        '(LOWER(aa.applicant_first_name) LIKE ? OR LOWER(aa.applicant_last_name) LIKE ? OR LOWER(aa.application_reference) LIKE ? OR LOWER(aa.guardian_name) LIKE ?)',
      );
      params.push(pattern, pattern, pattern, pattern);
    }
    if (status && status !== 'all') {
      whereClauses.push('aa.status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.join(' AND ');
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM admission_applications aa WHERE ${whereSql}`)
      .get(...params) as { total: number };

    const applications = db
      .prepare(`
        SELECT
          aa.*,
          c.name AS desired_class_name,
          a.name AS desired_arm_name,
          (SELECT COUNT(*) FROM admission_documents ad WHERE ad.application_id = aa.id AND ad.school_id = aa.school_id) AS documents_count
        FROM admission_applications aa
        LEFT JOIN school_classes c ON c.id = aa.desired_class_id
        LEFT JOIN class_arms a ON a.id = aa.desired_arm_id
        WHERE ${whereSql}
        ORDER BY aa.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    const summary = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending_review,
          SUM(CASE WHEN status = 'more_info_requested' THEN 1 ELSE 0 END) AS more_info_requested,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
        FROM admission_applications
        WHERE school_id = ?
      `)
      .get(schoolId) as Record<string, number | null>;

    res.json({
      applications,
      summary: {
        total: summary.total ?? 0,
        pending_review: summary.pending_review ?? 0,
        more_info_requested: summary.more_info_requested ?? 0,
        approved: summary.approved ?? 0,
        rejected: summary.rejected ?? 0,
        converted: summary.converted ?? 0,
      },
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.max(1, Math.ceil(countRow.total / limit)),
      },
    });
  },
);

schoolAdmissionsRouter.post(
  '/admissions',
  requireCsrfCheck,
  requirePermission('school.admissions.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createAdmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid admission application.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;

    const classCheck = validateActiveClassAndArm({
      schoolId,
      classId: d.desiredClassId,
      armId: d.desiredArmId,
    });
    if (!classCheck.ok) {
      res.status(400).json({ error: classCheck.error });
      return;
    }

    const applicationId = `adm_${crypto.randomUUID()}`;
    let reference = '';

    db.exec('BEGIN IMMEDIATE');
    try {
      reference = allocateUniqueApplicationReference(schoolId);
      const currentSession = db
        .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
        .get(schoolId) as { id: string } | undefined;

      db.prepare(`
        INSERT INTO admission_applications (
          id, school_id, application_reference,
          applicant_first_name, applicant_middle_name, applicant_last_name,
          date_of_birth, gender, applicant_email, applicant_phone,
          residential_address, nationality, state_of_origin, previous_school,
          desired_class_id, desired_arm_id, academic_session_id,
          guardian_name, guardian_email, guardian_phone, guardian_relationship, guardian_occupation, guardian_address,
          notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
      `).run(
        applicationId,
        schoolId,
        reference,
        d.applicantFirstName,
        d.applicantMiddleName,
        d.applicantLastName,
        d.dateOfBirth,
        d.gender,
        d.applicantEmail ? d.applicantEmail.toLowerCase() : '',
        d.applicantPhone,
        d.residentialAddress,
        d.nationality,
        d.stateOfOrigin,
        d.previousSchool,
        d.desiredClassId,
        classCheck.armRow?.id ?? null,
        currentSession?.id ?? null,
        d.guardianName,
        d.guardianEmail ? d.guardianEmail.toLowerCase() : '',
        d.guardianPhone,
        d.guardianRelationship,
        d.guardianOccupation,
        d.guardianAddress,
        d.notes,
      );

      db.prepare(`
        INSERT INTO admission_history (
          id, school_id, application_id, from_status, to_status, comment, actor_user_id, actor_email
        ) VALUES (?, ?, ?, '', 'pending_review', 'Application submitted for administrative review', ?, ?)
      `).run(`amh_${crypto.randomUUID()}`, schoolId, applicationId, req.auth!.id, req.auth!.email);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Create admission application failed:', err);
      res.status(500).json({ error: 'Unable to submit admission application.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.admission.created',
      resourceType: 'admission_application',
      resourceId: applicationId,
      outcome: 'success',
      metadata: {
        reference,
        applicantName: `${d.applicantFirstName} ${d.applicantLastName}`,
        desiredClassId: d.desiredClassId,
      },
      ipAddress: getClientIp(req),
    });

    const application = db
      .prepare('SELECT * FROM admission_applications WHERE id = ?')
      .get(applicationId);
    res.status(201).json({ application });
  },
);

schoolAdmissionsRouter.get(
  '/admissions/:applicationId',
  requirePermission('school.admissions.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { applicationId } = req.params;

    const application = db
      .prepare(`
        SELECT
          aa.*,
          c.name AS desired_class_name,
          a.name AS desired_arm_name,
          acs.name AS academic_session_name,
          st.admission_number AS converted_admission_number
        FROM admission_applications aa
        LEFT JOIN school_classes c ON c.id = aa.desired_class_id
        LEFT JOIN class_arms a ON a.id = aa.desired_arm_id
        LEFT JOIN academic_sessions acs ON acs.id = aa.academic_session_id
        LEFT JOIN students st ON st.id = aa.converted_student_id
        WHERE aa.id = ? AND aa.school_id = ?
      `)
      .get(applicationId, schoolId);

    if (!application) {
      res.status(404).json({ error: 'Admission application not found in your school.' });
      return;
    }

    const documents = db
      .prepare(`
        SELECT
          ad.id, ad.document_type, ad.title, ad.file_id, ad.created_at,
          f.original_name, f.mime_type, f.size_bytes
        FROM admission_documents ad
        INNER JOIN stored_files f ON f.id = ad.file_id
        WHERE ad.application_id = ? AND ad.school_id = ?
        ORDER BY ad.created_at DESC
      `)
      .all(applicationId, schoolId);

    const history = db
      .prepare(`
        SELECT *
        FROM admission_history
        WHERE application_id = ? AND school_id = ?
        ORDER BY created_at DESC, rowid DESC
      `)
      .all(applicationId, schoolId);

    res.json({ application, documents, history });
  },
);

schoolAdmissionsRouter.post(
  '/admissions/:applicationId/documents',
  requireCsrfCheck,
  requirePermission('school.admissions.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = entityDocumentUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid document upload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { applicationId } = req.params;

    const appRow = db
      .prepare('SELECT id FROM admission_applications WHERE id = ? AND school_id = ?')
      .get(applicationId, schoolId);
    if (!appRow) {
      res.status(404).json({ error: 'Admission application not found in your school.' });
      return;
    }

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        category: 'student_document',
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      const docId = `adoc_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO admission_documents (id, school_id, application_id, file_id, document_type, title, uploaded_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        schoolId,
        applicationId,
        file.id,
        parsed.data.documentType,
        parsed.data.title,
        req.auth!.id,
      );

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
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload supporting document.' });
    }
  },
);

schoolAdmissionsRouter.post(
  '/admissions/:applicationId/review',
  requireCsrfCheck,
  requirePermission('school.admissions.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = reviewAdmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid review decision.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { applicationId } = req.params;
    const d = parsed.data;

    const existing = db
      .prepare('SELECT id, application_reference, status FROM admission_applications WHERE id = ? AND school_id = ?')
      .get(applicationId, schoolId) as
      | { id: string; application_reference: string; status: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Admission application not found in your school.' });
      return;
    }

    if (existing.status === 'converted') {
      res.status(400).json({ error: 'This application has already been converted into a registered student.' });
      return;
    }

    const decisionToStatus: Record<'approve' | 'reject' | 'request_info', string> = {
      approve: 'approved',
      reject: 'rejected',
      request_info: 'more_info_requested',
    };
    const nextStatus = decisionToStatus[d.decision];

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE admission_applications
        SET
          status = ?,
          review_notes = ?,
          reviewed_by_user_id = ?,
          reviewed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(nextStatus, d.reviewNotes, req.auth!.id, applicationId, schoolId);

      db.prepare(`
        INSERT INTO admission_history (
          id, school_id, application_id, from_status, to_status, comment, actor_user_id, actor_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `amh_${crypto.randomUUID()}`,
        schoolId,
        applicationId,
        existing.status,
        nextStatus,
        d.reviewNotes,
        req.auth!.id,
        req.auth!.email,
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Review admission failed:', err);
      res.status(500).json({ error: 'Unable to record admission review.' });
      return;
    }

    const auditAction =
      d.decision === 'approve'
        ? 'school.admission.approved'
        : d.decision === 'reject'
          ? 'school.admission.rejected'
          : 'school.admission.info_requested';

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: auditAction,
      resourceType: 'admission_application',
      resourceId: applicationId,
      outcome: 'success',
      metadata: {
        reference: existing.application_reference,
        fromStatus: existing.status,
        toStatus: nextStatus,
      },
      ipAddress: getClientIp(req),
    });

    res.json({ id: applicationId, status: nextStatus, review_notes: d.reviewNotes });
  },
);

schoolAdmissionsRouter.post(
  '/admissions/:applicationId/convert',
  requireCsrfCheck,
  requirePermission('school.admissions.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = convertAdmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid conversion payload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const { applicationId } = req.params;
    const d = parsed.data;

    const appRow = db
      .prepare('SELECT * FROM admission_applications WHERE id = ? AND school_id = ?')
      .get(applicationId, schoolId) as
      | {
          id: string;
          application_reference: string;
          applicant_first_name: string;
          applicant_middle_name: string;
          applicant_last_name: string;
          date_of_birth: string;
          gender: string;
          applicant_email: string;
          applicant_phone: string;
          residential_address: string;
          nationality: string;
          state_of_origin: string;
          previous_school: string;
          guardian_name: string;
          guardian_email: string;
          guardian_phone: string;
          guardian_relationship: string;
          guardian_occupation: string;
          guardian_address: string;
          status: string;
        }
      | undefined;

    if (!appRow) {
      res.status(404).json({ error: 'Admission application not found in your school.' });
      return;
    }

    if (appRow.status !== 'approved') {
      res.status(400).json({
        error:
          appRow.status === 'converted'
            ? 'This approved applicant has already been converted into a student.'
            : 'Only explicitly approved applications can be converted into active student records.',
      });
      return;
    }

    const classCheck = validateActiveClassAndArm({
      schoolId,
      classId: d.classId,
      armId: d.armId,
    });
    if (!classCheck.ok) {
      res.status(400).json({ error: classCheck.error });
      return;
    }
    const targetArmId = classCheck.armRow?.id ?? null;

    const studentId = `stu_${crypto.randomUUID()}`;
    let assignedAdmissionNumber = '';
    let createdParentId: string | null = null;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (d.admissionNumber) {
        const dupAdm = db
          .prepare('SELECT id FROM students WHERE school_id = ? AND UPPER(admission_number) = UPPER(?)')
          .get(schoolId, d.admissionNumber);
        if (dupAdm) {
          db.exec('ROLLBACK');
          res.status(409).json({
            error: `Admission number "${d.admissionNumber}" is already assigned in your school.`,
          });
          return;
        }
        assignedAdmissionNumber = d.admissionNumber;
      } else {
        assignedAdmissionNumber = allocateUniqueAdmissionNumber(schoolId, d.admissionDate);
      }

      db.prepare(`
        INSERT INTO students (
          id, school_id, admission_number, admission_date,
          first_name, middle_name, last_name, date_of_birth, gender,
          student_email, student_phone, residential_address, nationality, state_of_origin, previous_school,
          current_class_id, current_arm_id,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          status, admission_application_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        studentId,
        schoolId,
        assignedAdmissionNumber,
        d.admissionDate,
        appRow.applicant_first_name,
        appRow.applicant_middle_name,
        appRow.applicant_last_name,
        appRow.date_of_birth,
        appRow.gender,
        appRow.applicant_email,
        appRow.applicant_phone,
        appRow.residential_address,
        appRow.nationality,
        appRow.state_of_origin,
        appRow.previous_school,
        d.classId,
        targetArmId,
        appRow.guardian_name,
        appRow.guardian_phone,
        appRow.guardian_relationship,
        applicationId,
      );

      const currentSession = db
        .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
        .get(schoolId) as { id: string } | undefined;

      db.prepare(`
        INSERT INTO class_enrollments (id, school_id, student_id, class_id, arm_id, academic_session_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(`enr_${crypto.randomUUID()}`, schoolId, studentId, d.classId, targetArmId, currentSession?.id ?? null);

      db.prepare(`
        INSERT INTO student_class_history (
          id, school_id, student_id, academic_session_id,
          from_class_id, from_arm_id, to_class_id, to_arm_id,
          action_type, effective_date, notes, recorded_by_user_id
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'initial_placement', ?, ?, ?)
      `).run(
        `sch_${crypto.randomUUID()}`,
        schoolId,
        studentId,
        currentSession?.id ?? null,
        d.classId,
        targetArmId,
        d.admissionDate,
        `Converted from admission application ${appRow.application_reference}`,
        req.auth!.id,
      );

      if (d.createGuardianRecord) {
        const existingParent = db
          .prepare('SELECT id FROM parents WHERE school_id = ? AND (phone = ? OR (email != \'\' AND LOWER(email) = LOWER(?))) LIMIT 1')
          .get(schoolId, appRow.guardian_phone, appRow.guardian_email) as { id: string } | undefined;

        const parentId = existingParent?.id ?? `par_${crypto.randomUUID()}`;
        if (!existingParent) {
          db.prepare(`
            INSERT INTO parents (id, school_id, full_name, email, phone, residential_address, occupation, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `).run(
            parentId,
            schoolId,
            appRow.guardian_name,
            appRow.guardian_email,
            appRow.guardian_phone,
            appRow.guardian_address,
            appRow.guardian_occupation,
          );
        }
        createdParentId = parentId;

        db.prepare(`
          INSERT OR IGNORE INTO student_guardians (
            id, school_id, student_id, parent_id, relationship,
            is_primary_guardian, is_emergency_contact
          ) VALUES (?, ?, ?, ?, ?, 1, 1)
        `).run(`grd_${crypto.randomUUID()}`, schoolId, studentId, parentId, appRow.guardian_relationship);
      }

      // Copy admission supporting documents into student documents (referencing existing stored_files safely)
      // Since student_documents.file_id has UNIQUE constraint, create student_documents only if file_id isn't already linked
      const appDocs = db
        .prepare('SELECT file_id, document_type, title, uploaded_by_user_id FROM admission_documents WHERE application_id = ? AND school_id = ?')
        .all(applicationId, schoolId) as Array<{
        file_id: string;
        document_type: string;
        title: string;
        uploaded_by_user_id: string | null;
      }>;
      for (const doc of appDocs) {
        db.prepare(`
          INSERT OR IGNORE INTO student_documents (id, school_id, student_id, file_id, document_type, title, uploaded_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `sdoc_${crypto.randomUUID()}`,
          schoolId,
          studentId,
          doc.file_id,
          doc.document_type,
          doc.title,
          doc.uploaded_by_user_id ?? req.auth!.id,
        );
      }

      db.prepare(`
        UPDATE admission_applications
        SET
          status = 'converted',
          converted_student_id = ?,
          converted_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND school_id = ?
      `).run(studentId, applicationId, schoolId);

      db.prepare(`
        INSERT INTO admission_history (
          id, school_id, application_id, from_status, to_status, comment, actor_user_id, actor_email
        ) VALUES (?, ?, ?, 'approved', 'converted', ?, ?, ?)
      `).run(
        `amh_${crypto.randomUUID()}`,
        schoolId,
        applicationId,
        `Registration completed and converted to Student ${assignedAdmissionNumber}`,
        req.auth!.id,
        req.auth!.email,
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Convert admission failed:', err);
      res.status(500).json({ error: 'Unable to complete admission conversion.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.admission.converted',
      resourceType: 'student',
      resourceId: studentId,
      outcome: 'success',
      metadata: {
        applicationId,
        reference: appRow.application_reference,
        admissionNumber: assignedAdmissionNumber,
        createdParentId,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      studentId,
      admissionNumber: assignedAdmissionNumber,
      parentId: createdParentId,
    });
  },
);
