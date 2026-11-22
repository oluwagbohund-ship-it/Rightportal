import { Router } from 'express';
import { getDb } from '../../../db/client.ts';
import { recordAuditLog } from '../../audit.ts';
import { deleteStoredFileById, saveValidatedFile } from '../../file-storage.ts';
import {
  type AuthenticatedRequest,
  getClientIp,
  requireCsrfCheck,
  requirePermission,
} from '../../middleware.ts';
import { ensureSchoolProfileRow, formatAdmissionNumber } from '../../school-helpers.ts';
import {
  updateSchoolProfileSchema,
  updateSchoolSettingsSchema,
  uploadFileSchema,
} from '../../validation.ts';

export const schoolProfileRouter = Router();

schoolProfileRouter.get(
  '/profile',
  requirePermission('school.overview.read'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolProfileRow(schoolId);

    const profile = db
      .prepare(`
        SELECT
          s.id,
          s.name,
          s.slug,
          s.code,
          s.country,
          s.city,
          s.contact_email,
          s.phone,
          s.status,
          s.created_at,
          sp.registration_number,
          sp.state,
          sp.physical_address,
          sp.website,
          sp.motto,
          sp.description,
          sp.school_type,
          sp.school_ownership,
          sp.established_year,
          sp.logo_file_id,
          sp.admission_number_prefix,
          sp.admission_number_format,
          sp.admission_next_seq,
          sp.application_ref_prefix,
          sp.application_next_seq,
          sp.updated_at
        FROM schools s
        INNER JOIN school_profiles sp ON sp.school_id = s.id
        WHERE s.id = ?
      `)
      .get(schoolId);

    res.json({ profile });
  },
);

schoolProfileRouter.put(
  '/profile',
  requireCsrfCheck,
  requirePermission('school.profile.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSchoolProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid school profile data.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolProfileRow(schoolId);
    const d = parsed.data;

    const duplicate = db
      .prepare(
        'SELECT id FROM schools WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?) AND LOWER(country) = LOWER(?) AND id != ?',
      )
      .get(d.name, d.city, d.country, schoolId);
    if (duplicate) {
      res.status(409).json({
        error: 'Another registered institution already uses this school name in that city and country.',
      });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE schools
        SET name = ?, contact_email = ?, phone = ?, country = ?, city = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(d.name, d.contactEmail, d.phone, d.country, d.city, schoolId);

      db.prepare(`
        UPDATE school_profiles
        SET
          registration_number = ?,
          state = ?,
          physical_address = ?,
          website = ?,
          motto = ?,
          description = ?,
          school_type = ?,
          school_ownership = ?,
          established_year = ?,
          updated_at = datetime('now')
        WHERE school_id = ?
      `).run(
        d.registrationNumber,
        d.state,
        d.physicalAddress,
        d.website,
        d.motto,
        d.description,
        d.schoolType,
        d.schoolOwnership,
        d.establishedYear,
        schoolId,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Update school profile failed:', err);
      res.status(500).json({ error: 'Unable to update school profile.' });
      return;
    }

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.profile.updated',
      resourceType: 'school_profile',
      resourceId: schoolId,
      outcome: 'success',
      metadata: {
        name: d.name,
        schoolType: d.schoolType,
        schoolOwnership: d.schoolOwnership,
        city: d.city,
        country: d.country,
      },
      ipAddress: getClientIp(req),
    });

    const updated = db
      .prepare(`
        SELECT
          s.id, s.name, s.slug, s.code, s.country, s.city, s.contact_email, s.phone, s.status, s.created_at,
          sp.registration_number, sp.state, sp.physical_address, sp.website, sp.motto, sp.description,
          sp.school_type, sp.school_ownership, sp.established_year, sp.logo_file_id,
          sp.admission_number_prefix, sp.admission_number_format, sp.admission_next_seq,
          sp.application_ref_prefix, sp.application_next_seq, sp.updated_at
        FROM schools s
        INNER JOIN school_profiles sp ON sp.school_id = s.id
        WHERE s.id = ?
      `)
      .get(schoolId);

    res.json({ profile: updated });
  },
);

schoolProfileRouter.post(
  '/profile/logo',
  requireCsrfCheck,
  requirePermission('school.profile.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = uploadFileSchema.safeParse({
      ...req.body,
      category: 'school_logo',
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid logo upload.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolProfileRow(schoolId);
    const prev = db
      .prepare('SELECT logo_file_id FROM school_profiles WHERE school_id = ?')
      .get(schoolId) as { logo_file_id: string | null } | undefined;

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        category: 'school_logo',
        originalName: parsed.data.fileName,
        claimedMimeType: parsed.data.mimeType,
        contentBase64: parsed.data.contentBase64,
        visibility: 'private_tenant',
      });

      db.prepare("UPDATE school_profiles SET logo_file_id = ?, updated_at = datetime('now') WHERE school_id = ?").run(
        file.id,
        schoolId,
      );

      if (prev?.logo_file_id && prev.logo_file_id !== file.id) {
        deleteStoredFileById(prev.logo_file_id);
      }

      recordAuditLog({
        actorUserId: req.auth!.id,
        actorEmail: req.auth!.email,
        actorRole: req.auth!.roleCode,
        schoolId,
        authEnvironment: 'school',
        action: 'school.profile.logo_updated',
        resourceType: 'stored_file',
        resourceId: file.id,
        outcome: 'success',
        metadata: { mimeType: file.mime_type, sizeBytes: file.size_bytes },
        ipAddress: getClientIp(req),
      });

      res.status(201).json({
        logoFileId: file.id,
        file: {
          id: file.id,
          original_name: file.original_name,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save school logo.' });
    }
  },
);

schoolProfileRouter.get(
  '/settings',
  requirePermission('school.profile.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const profile = ensureSchoolProfileRow(schoolId);
    const school = db
      .prepare('SELECT code FROM schools WHERE id = ?')
      .get(schoolId) as { code: string } | undefined;

    const previewAdmissionNumber = formatAdmissionNumber({
      template: profile.admission_number_format,
      prefix: profile.admission_number_prefix,
      schoolCode: school?.code ?? 'SCH',
      year: new Date().getUTCFullYear(),
      seq: profile.admission_next_seq,
    });

    res.json({
      settings: {
        admissionNumberPrefix: profile.admission_number_prefix,
        admissionNumberFormat: profile.admission_number_format,
        admissionNextSeq: profile.admission_next_seq,
        applicationRefPrefix: profile.application_ref_prefix,
        applicationNextSeq: profile.application_next_seq,
        previewAdmissionNumber,
      },
    });
  },
);

schoolProfileRouter.put(
  '/settings',
  requireCsrfCheck,
  requirePermission('school.profile.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSchoolSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid school settings.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureSchoolProfileRow(schoolId);
    const d = parsed.data;

    db.prepare(`
      UPDATE school_profiles
      SET
        admission_number_prefix = ?,
        admission_number_format = ?,
        admission_next_seq = ?,
        application_ref_prefix = ?,
        updated_at = datetime('now')
      WHERE school_id = ?
    `).run(
      d.admissionNumberPrefix.toUpperCase(),
      d.admissionNumberFormat,
      d.admissionNextSeq,
      d.applicationRefPrefix.toUpperCase(),
      schoolId,
    );

    const school = db
      .prepare('SELECT code FROM schools WHERE id = ?')
      .get(schoolId) as { code: string } | undefined;

    const previewAdmissionNumber = formatAdmissionNumber({
      template: d.admissionNumberFormat,
      prefix: d.admissionNumberPrefix.toUpperCase(),
      schoolCode: school?.code ?? 'SCH',
      year: new Date().getUTCFullYear(),
      seq: d.admissionNextSeq,
    });

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.settings.updated',
      resourceType: 'school_profile',
      resourceId: schoolId,
      outcome: 'success',
      metadata: {
        admissionNumberPrefix: d.admissionNumberPrefix.toUpperCase(),
        admissionNumberFormat: d.admissionNumberFormat,
        admissionNextSeq: d.admissionNextSeq,
        applicationRefPrefix: d.applicationRefPrefix.toUpperCase(),
      },
      ipAddress: getClientIp(req),
    });

    res.json({
      settings: {
        admissionNumberPrefix: d.admissionNumberPrefix.toUpperCase(),
        admissionNumberFormat: d.admissionNumberFormat,
        admissionNextSeq: d.admissionNextSeq,
        applicationRefPrefix: d.applicationRefPrefix.toUpperCase(),
        previewAdmissionNumber,
      },
    });
  },
);
