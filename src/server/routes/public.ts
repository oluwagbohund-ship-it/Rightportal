import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import { getDb } from '../../db/client.ts';
import { evaluateAccessCodeStatus, normalizeSchoolAccessCode } from '../access-code-helpers.ts';
import { getAiCoreBlueprint } from '../ai-core.ts';
import { recordAuditLog } from '../audit.ts';
import { resolveConfinedStoragePath, type StoredFileRecord } from '../file-storage.ts';
import { getClientIp, isRequestHttps, requireCsrfCheck } from '../middleware.ts';
import { checkRateLimit, recordRateLimitedAttempt } from '../rate-limiter.ts';
import { allocateUniqueApplicationReference, validateActiveClassAndArm } from '../school-helpers.ts';
import {
  buildSessionCookieHeader,
  hashPassword,
  slugifySchoolName,
} from '../security.ts';
import { createAuthSession } from '../session-service.ts';
import {
  contactInquirySchema,
  createAdmissionSchema,
  registerSchoolSchema,
  verifyAccessCodeSchema,
} from '../validation.ts';

export const publicRouter = Router();

publicRouter.get('/info', (_req, res) => {
  const db = getDb();
  const settingRow = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = 'allow_public_school_registration'")
    .get() as { value_json: string } | undefined;

  let allowPublicSchoolRegistration = true;
  if (settingRow) {
    try {
      allowPublicSchoolRegistration = Boolean(JSON.parse(settingRow.value_json));
    } catch {
      allowPublicSchoolRegistration = true;
    }
  }

  res.json({
    platformName: 'Dave Timi EdTech Systems',
    developer: 'David Oluwagbohun',
    tagline: 'Build • Innovate • Transform',
    phase: 'Version 1 — Complete Multi-School Production Release',
    allowPublicSchoolRegistration,
    aiCore: getAiCoreBlueprint(),
  });
});

publicRouter.get('/schools', (_req, res) => {
  const db = getDb();
  const schools = db
    .prepare(`
      SELECT
        s.id, s.name, s.slug, s.city, s.country, s.status,
        sp.motto, sp.school_type, sp.logo_file_id,
        sws.hero_title, sws.primary_color, sws.accent_color, sws.admissions_open
      FROM schools s
      INNER JOIN school_website_settings sws ON sws.school_id = s.id
      LEFT JOIN school_profiles sp ON sp.school_id = s.id
      WHERE sws.is_published = 1 AND s.status != 'suspended'
      ORDER BY s.name ASC
      LIMIT 60
    `)
    .all();
  res.json({ schools });
});

publicRouter.get('/schools/:slug', (req, res) => {
  const db = getDb();
  const slug = req.params.slug;
  const school = db
    .prepare(`
      SELECT
        s.id, s.name, s.slug, s.code, s.country, s.city, s.contact_email, s.phone, s.status,
        sp.school_type, sp.school_ownership, sp.motto, sp.description, sp.physical_address,
        sp.state, sp.established_year, sp.logo_file_id
      FROM schools s
      LEFT JOIN school_profiles sp ON sp.school_id = s.id
      WHERE s.slug = ?
      LIMIT 1
    `)
    .get(slug) as ({ id: string; name: string; slug: string; status: string } & Record<string, unknown>) | undefined;

  if (!school) {
    res.status(404).json({ error: 'School website not found.' });
    return;
  }

  if (school.status === 'suspended') {
    res.status(403).json({ error: 'This institution portal is currently unavailable.' });
    return;
  }

  const website = db
    .prepare('SELECT * FROM school_website_settings WHERE school_id = ?')
    .get(school.id) as ({ is_published: number } & Record<string, unknown>) | undefined;

  if (!website || website.is_published !== 1) {
    res.status(404).json({ error: 'This school has not published its public website yet.' });
    return;
  }

  const pages = db
    .prepare('SELECT id, slug, title, section_type, content, display_order FROM school_website_pages WHERE school_id = ? AND is_published = 1 ORDER BY display_order ASC')
    .all(school.id);
  const announcements = db
    .prepare('SELECT id, title, summary, body, category, published_at FROM school_website_announcements WHERE school_id = ? AND is_published = 1 ORDER BY published_at DESC LIMIT 20')
    .all(school.id);
  const gallery = db
    .prepare('SELECT id, title, caption, file_id, category, display_order FROM school_website_gallery WHERE school_id = ? AND is_published = 1 ORDER BY display_order ASC, created_at DESC LIMIT 24')
    .all(school.id);
  const classes = db
    .prepare("SELECT id, name, section FROM school_classes WHERE school_id = ? AND status = 'active' ORDER BY level_order ASC")
    .all(school.id);
  const upcomingEvents = db
    .prepare('SELECT id, title, event_type, start_date, end_date, description FROM academic_events WHERE school_id = ? ORDER BY start_date ASC LIMIT 10')
    .all(school.id);

  res.json({
    school,
    website,
    pages,
    announcements,
    gallery,
    classes,
    upcomingEvents,
  });
});

publicRouter.get('/schools/:slug/media/:fileId', (req, res) => {
  const db = getDb();
  const school = db
    .prepare(`
      SELECT s.id, s.status, sp.logo_file_id, sws.is_published, sws.hero_image_file_id, sws.principal_photo_file_id
      FROM schools s
      LEFT JOIN school_profiles sp ON sp.school_id = s.id
      LEFT JOIN school_website_settings sws ON sws.school_id = s.id
      WHERE s.slug = ?
      LIMIT 1
    `)
    .get(req.params.slug) as
    | {
        id: string;
        status: string;
        logo_file_id: string | null;
        is_published: number | null;
        hero_image_file_id: string | null;
        principal_photo_file_id: string | null;
      }
    | undefined;

  if (!school || school.status === 'suspended' || school.is_published !== 1) {
    res.status(404).json({ error: 'Public school media unavailable.' });
    return;
  }

  const fileId = req.params.fileId;
  const isPublishedAsset =
    school.logo_file_id === fileId ||
    school.hero_image_file_id === fileId ||
    school.principal_photo_file_id === fileId ||
    Boolean(
      db
        .prepare('SELECT id FROM school_website_gallery WHERE school_id = ? AND file_id = ? AND is_published = 1 LIMIT 1')
        .get(school.id, fileId),
    );

  if (!isPublishedAsset) {
    res.status(403).json({ error: 'Requested file is not published for public access.' });
    return;
  }

  const file = db
    .prepare('SELECT * FROM stored_files WHERE id = ? AND school_id = ?')
    .get(fileId, school.id) as StoredFileRecord | undefined;

  if (!file || !file.mime_type.startsWith('image/')) {
    res.status(404).json({ error: 'Media image not found.' });
    return;
  }

  try {
    const absPath = resolveConfinedStoragePath(file.storage_rel_path);
    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'Stored file missing on disk.' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', file.mime_type);
    res.sendFile(absPath);
  } catch {
    res.status(400).json({ error: 'Unable to serve public media asset.' });
  }
});

publicRouter.post('/schools/:slug/admissions', requireCsrfCheck, (req, res) => {
  const ip = getClientIp(req) || 'unknown';
  const rateKey = `public:admission:ip:${ip}`;
  const limit = checkRateLimit(rateKey, 15, 30);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Too many admission applications submitted. Please try again later.' });
    return;
  }
  recordRateLimitedAttempt(rateKey, 15, 30, 30);

  const db = getDb();
  const school = db
    .prepare(`
      SELECT s.id, s.name, s.status, sws.is_published, sws.admissions_open
      FROM schools s
      LEFT JOIN school_website_settings sws ON sws.school_id = s.id
      WHERE s.slug = ?
      LIMIT 1
    `)
    .get(req.params.slug) as
    | { id: string; name: string; status: string; is_published: number | null; admissions_open: number | null }
    | undefined;

  if (!school || school.status === 'suspended' || school.is_published !== 1) {
    res.status(404).json({ error: 'School admission portal not found.' });
    return;
  }

  if (school.admissions_open !== 1) {
    res.status(403).json({ error: 'Online admissions are currently closed by this school.' });
    return;
  }

  const parsed = createAdmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid admission application data.' });
    return;
  }

  const d = parsed.data;
  const classCheck = validateActiveClassAndArm({
    schoolId: school.id,
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
    reference = allocateUniqueApplicationReference(school.id);
    const currentSession = db
      .prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1')
      .get(school.id) as { id: string } | undefined;

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
      school.id,
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
      ) VALUES (?, ?, ?, '', 'pending_review', 'Submitted via public school website admissions portal', NULL, ?)
    `).run(
      `amh_${crypto.randomUUID()}`,
      school.id,
      applicationId,
      d.guardianEmail || d.applicantEmail || 'public_applicant',
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Public admission submission failed:', err);
    res.status(500).json({ error: 'Unable to submit online admission application.' });
    return;
  }

  recordAuditLog({
    actorEmail: d.guardianEmail || d.applicantEmail || 'public_applicant',
    actorRole: 'public_visitor',
    schoolId: school.id,
    authEnvironment: 'public',
    action: 'public.admission.submitted',
    resourceType: 'admission_application',
    resourceId: applicationId,
    outcome: 'success',
    metadata: { reference, applicantName: `${d.applicantFirstName} ${d.applicantLastName}` },
    ipAddress: ip,
  });

  res.status(201).json({
    id: applicationId,
    applicationReference: reference,
    schoolName: school.name,
    status: 'pending_review',
    message: 'Your admission application has been submitted directly to the school admissions office.',
  });
});

publicRouter.post('/contact', requireCsrfCheck, (req, res) => {
  const ip = getClientIp(req) || 'unknown';
  const rateKey = `public:contact:ip:${ip}`;
  const limit = checkRateLimit(rateKey, 10, 15);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Too many contact submissions. Please wait before retrying.' });
    return;
  }
  recordRateLimitedAttempt(rateKey, 10, 15, 15);

  const parsed = contactInquirySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid inquiry submission.',
    });
    return;
  }

  const db = getDb();
  const id = `inq_${crypto.randomUUID()}`;
  const { fullName, email, organization, subject, message } = parsed.data;

  db.prepare(`
    INSERT INTO contact_inquiries (id, full_name, email, organization, subject, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, fullName, email.toLowerCase(), organization, subject, message);

  recordAuditLog({
    actorEmail: email.toLowerCase(),
    actorRole: 'public_visitor',
    authEnvironment: 'public',
    action: 'public.contact.submitted',
    resourceType: 'contact_inquiry',
    resourceId: id,
    outcome: 'success',
    metadata: { subject, organization },
    ipAddress: ip,
  });

  res.status(201).json({
    id,
    message: 'Your inquiry has been recorded. Our team will respond via email.',
  });
});

publicRouter.post('/verify-access-code', requireCsrfCheck, (req, res) => {
  const ip = getClientIp(req) || 'unknown';
  const rateKey = `public:verify-code:ip:${ip}`;
  const limit = checkRateLimit(rateKey, 20, 15);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Too many code verification attempts. Please wait before trying again.' });
    return;
  }
  recordRateLimitedAttempt(rateKey, 20, 15, 15);

  const parsed = verifyAccessCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      valid: false,
      error: parsed.error.issues[0]?.message ?? 'Enter a valid access code.',
    });
    return;
  }

  const normalized = normalizeSchoolAccessCode(parsed.data.accessCode);
  const db = getDb();
  const row = db
    .prepare(`
      SELECT id, code, intended_school_name, status, expires_at
      FROM school_access_codes
      WHERE UPPER(code) = ?
      LIMIT 1
    `)
    .get(normalized) as
    | {
        id: string;
        code: string;
        intended_school_name: string;
        status: string;
        expires_at: string | null;
      }
    | undefined;

  const evaluation = evaluateAccessCodeStatus(row);
  if (!evaluation.valid || !row) {
    res.status(403).json({
      valid: false,
      error: evaluation.reason ?? 'Invalid School Access Code.',
    });
    return;
  }

  res.json({
    valid: true,
    code: row.code,
    intendedSchoolName: row.intended_school_name,
  });
});

publicRouter.post('/register-school', requireCsrfCheck, (req, res) => {
  const ip = getClientIp(req) || 'unknown';
  const rateKey = `public:register:ip:${ip}`;
  const limit = checkRateLimit(rateKey, 10, 30);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Too many school registration attempts from this network.' });
    return;
  }
  recordRateLimitedAttempt(rateKey, 10, 30, 30);

  const db = getDb();

  const regSetting = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = 'allow_public_school_registration'")
    .get() as { value_json: string } | undefined;
  const registrationOpen = regSetting ? Boolean(JSON.parse(regSetting.value_json)) : true;

  if (!registrationOpen) {
    res.status(403).json({
      error: 'Public school registration is currently paused by platform administration.',
    });
    return;
  }

  const parsed = registerSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid registration payload.',
    });
    return;
  }

  const data = parsed.data;
  const normalizedAccessCode = normalizeSchoolAccessCode(data.accessCode);
  const adminEmail = data.adminEmail.toLowerCase();
  const schoolContactEmail = data.contactEmail.toLowerCase();
  const normalizedSchoolName = data.schoolName.trim().toLowerCase();
  const normalizedCity = data.city.trim().toLowerCase();
  const normalizedCountry = data.country.trim().toLowerCase();

  const existingUser = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .get(adminEmail) as { id: string } | undefined;
  if (existingUser) {
    res.status(409).json({
      error: 'An account with this administrator email already exists.',
    });
    return;
  }

  const duplicateSchool = db
    .prepare(`
      SELECT id, name
      FROM schools
      WHERE LOWER(contact_email) = ?
         OR (LOWER(TRIM(name)) = ? AND LOWER(TRIM(city)) = ? AND LOWER(TRIM(country)) = ?)
      LIMIT 1
    `)
    .get(schoolContactEmail, normalizedSchoolName, normalizedCity, normalizedCountry) as
    | { id: string; name: string }
    | undefined;

  if (duplicateSchool) {
    recordAuditLog({
      actorEmail: adminEmail,
      actorRole: 'public_visitor',
      authEnvironment: 'public',
      action: 'school.registration.duplicate_blocked',
      resourceType: 'school',
      resourceId: duplicateSchool.id,
      outcome: 'denied',
      metadata: { attemptedName: data.schoolName, contactEmail: schoolContactEmail },
      ipAddress: ip,
    });
    res.status(409).json({
      error:
        'A school institution with this name/location or official contact email is already registered. Please sign in or contact support.',
    });
    return;
  }

  const baseSlug = slugifySchoolName(data.schoolName) || 'school';
  const suffix = crypto.randomBytes(2).toString('hex');
  const slug = `${baseSlug}-${suffix}`;
  const schoolId = `sch_${crypto.randomUUID()}`;
  const userId = `usr_${crypto.randomUUID()}`;
  const membershipId = `mem_${crypto.randomUUID()}`;
  const passwordHash = hashPassword(data.adminPassword);
  let schoolCode = normalizedAccessCode;
  let accessCodeId = '';

  db.exec('BEGIN IMMEDIATE');
  try {
    const codeRow = db
      .prepare(`
        SELECT id, code, status, expires_at
        FROM school_access_codes
        WHERE UPPER(code) = ?
        LIMIT 1
      `)
      .get(normalizedAccessCode) as
      | { id: string; code: string; status: string; expires_at: string | null }
      | undefined;

    const codeEval = evaluateAccessCodeStatus(codeRow);
    if (!codeEval.valid || !codeRow) {
      db.exec('ROLLBACK');
      recordAuditLog({
        actorEmail: adminEmail,
        actorRole: 'public_visitor',
        authEnvironment: 'public',
        action: 'school.registration.access_code_rejected',
        resourceType: 'school_access_code',
        resourceId: codeRow?.id ?? '',
        outcome: 'denied',
        metadata: { attemptedCode: normalizedAccessCode, reason: codeEval.reason },
        ipAddress: ip,
      });
      res.status(403).json({
        error: codeEval.reason ?? 'Invalid Platform Owner School Access Code.',
      });
      return;
    }

    accessCodeId = codeRow.id;
    schoolCode = codeRow.code.toUpperCase();

    const codeConflict = db
      .prepare('SELECT id FROM schools WHERE UPPER(code) = ?')
      .get(schoolCode);
    if (codeConflict) {
      db.exec('ROLLBACK');
      res.status(409).json({
        error: 'This School Code is already assigned to another school. Request a new code from the Platform Owner.',
      });
      return;
    }
    db.prepare(`
      INSERT INTO schools (
        id, name, slug, code, country, city, contact_email, phone, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification')
    `).run(
      schoolId,
      data.schoolName.trim(),
      slug,
      schoolCode,
      data.country.trim(),
      data.city.trim(),
      schoolContactEmail,
      data.phone ?? '',
    );

    db.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, user_type, is_active)
      VALUES (?, ?, ?, ?, 'school_member', 1)
    `).run(userId, adminEmail, data.adminFullName.trim(), passwordHash);

    db.prepare(`
      INSERT INTO school_memberships (id, school_id, user_id, role_id, title, status)
      VALUES (?, ?, ?, 'role_school_admin', 'Principal Administrator', 'active')
    `).run(membershipId, schoolId, userId);

    if (data.initialSessionName && data.initialSessionName.trim().length >= 4) {
      const year = new Date().getFullYear();
      db.prepare(`
        INSERT INTO academic_sessions (
          id, school_id, name, term, start_date, end_date, is_current
        ) VALUES (?, ?, ?, 'First Term', ?, ?, 1)
      `).run(
        `acs_${crypto.randomUUID()}`,
        schoolId,
        data.initialSessionName.trim(),
        `${year}-09-01`,
        `${year}-12-18`,
      );
    }

    db.prepare(`
      UPDATE school_access_codes
      SET status = 'used', used_by_school_id = ?, used_at = datetime('now')
      WHERE id = ?
    `).run(schoolId, accessCodeId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('School registration transaction failed:', err);
    res.status(500).json({ error: 'Unable to complete school registration.' });
    return;
  }

  const { rawToken, maxAgeSeconds } = createAuthSession({
    userId,
    authEnvironment: 'school',
    activeSchoolId: schoolId,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? '',
  });

  recordAuditLog({
    actorUserId: userId,
    actorEmail: adminEmail,
    actorRole: 'school_admin',
    schoolId,
    authEnvironment: 'school',
    action: 'school.registered',
    resourceType: 'school',
    resourceId: schoolId,
    outcome: 'success',
    metadata: { schoolName: data.schoolName, schoolCode, accessCodeId },
    ipAddress: ip,
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookieHeader(rawToken, {
      maxAgeSeconds,
      isHttps: isRequestHttps(req),
    }),
  );

  res.status(201).json({
    school: {
      id: schoolId,
      name: data.schoolName.trim(),
      code: schoolCode,
      status: 'pending_verification',
    },
    redirectPath: '/dashboard/school-admin',
  });
});
