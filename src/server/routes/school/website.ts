import crypto from 'node:crypto';
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
import {
  createWebsiteAnnouncementSchema,
  updateSchoolWebsiteSettingsSchema,
  upsertWebsitePageSchema,
} from '../../validation-v1.ts';

export const schoolWebsiteRouter = Router();

function ensureWebsiteSettings(schoolId: string) {
  const db = getDb();
  const school = db
    .prepare('SELECT id, name, slug FROM schools WHERE id = ?')
    .get(schoolId) as { id: string; name: string; slug: string } | undefined;

  db.prepare(`
    INSERT OR IGNORE INTO school_website_settings (school_id, hero_title, hero_subtitle)
    VALUES (?, ?, ?)
  `).run(
    schoolId,
    school?.name ? `Welcome to ${school.name}` : 'Welcome to Our School',
    'Inspiring excellence, character, and modern digital learning.',
  );

  return db
    .prepare('SELECT * FROM school_website_settings WHERE school_id = ?')
    .get(schoolId) as Record<string, unknown>;
}

schoolWebsiteRouter.get(
  '/website/overview',
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureWebsiteSettings(schoolId);
    const school = db
      .prepare('SELECT id, name, slug, code, status, contact_email, phone, city, country FROM schools WHERE id = ?')
      .get(schoolId) as { slug: string } & Record<string, unknown>;

    const pagesCount = (
      db.prepare('SELECT COUNT(*) AS c FROM school_website_pages WHERE school_id = ?').get(schoolId) as { c: number }
    ).c;
    const newsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM school_website_announcements WHERE school_id = ?').get(schoolId) as { c: number }
    ).c;
    const galleryCount = (
      db.prepare('SELECT COUNT(*) AS c FROM school_website_gallery WHERE school_id = ?').get(schoolId) as { c: number }
    ).c;
    const admissionsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM admission_applications WHERE school_id = ?').get(schoolId) as { c: number }
    ).c;

    res.json({
      school,
      settings,
      publicPath: `/schools/${school.slug}`,
      counts: {
        pagesCount,
        newsCount,
        galleryCount,
        admissionsCount,
      },
    });
  },
);

schoolWebsiteRouter.get(
  '/website/settings',
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const settings = ensureWebsiteSettings(schoolId);
    const school = db.prepare('SELECT slug, name FROM schools WHERE id = ?').get(schoolId) as { slug: string; name: string };
    res.json({ settings, publicPath: `/schools/${school.slug}`, school });
  },
);

schoolWebsiteRouter.put(
  '/website/settings',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateSchoolWebsiteSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid website configuration.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    ensureWebsiteSettings(schoolId);

    db.prepare(`
      UPDATE school_website_settings
      SET
        is_published = ?,
        custom_domain = ?,
        theme_preset = ?,
        primary_color = ?,
        accent_color = ?,
        hero_title = ?,
        hero_subtitle = ?,
        about_content = ?,
        principal_name = ?,
        principal_title = ?,
        principal_message = ?,
        academics_summary = ?,
        admissions_intro = ?,
        admissions_open = ?,
        contact_hours = ?,
        updated_at = datetime('now')
      WHERE school_id = ?
    `).run(
      d.isPublished ? 1 : 0,
      d.customDomain,
      d.themePreset,
      d.primaryColor,
      d.accentColor,
      d.heroTitle,
      d.heroSubtitle,
      d.aboutContent,
      d.principalName,
      d.principalTitle,
      d.principalMessage,
      d.academicsSummary,
      d.admissionsIntro,
      d.admissionsOpen ? 1 : 0,
      d.contactHours,
      schoolId,
    );

    recordAuditLog({
      actorUserId: req.auth!.id,
      actorEmail: req.auth!.email,
      actorRole: req.auth!.roleCode,
      schoolId,
      authEnvironment: 'school',
      action: 'school.website.settings_updated',
      resourceType: 'school_website_settings',
      resourceId: schoolId,
      outcome: 'success',
      metadata: { isPublished: d.isPublished, themePreset: d.themePreset },
      ipAddress: getClientIp(req),
    });

    const settings = db.prepare('SELECT * FROM school_website_settings WHERE school_id = ?').get(schoolId);
    res.json({ settings });
  },
);

schoolWebsiteRouter.post(
  '/website/media-asset',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const { assetRole, fileName, mimeType, contentBase64 } = req.body ?? {};
    if (!['hero', 'principal'].includes(assetRole) || !fileName || !mimeType || !contentBase64) {
      res.status(400).json({ error: 'Provide assetRole (hero|principal), fileName, mimeType, and contentBase64.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    ensureWebsiteSettings(schoolId);

    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        category: 'school_document',
        originalName: String(fileName),
        claimedMimeType: String(mimeType),
        contentBase64: String(contentBase64),
        visibility: 'private_tenant',
      });

      const column = assetRole === 'hero' ? 'hero_image_file_id' : 'principal_photo_file_id';
      db.prepare(`UPDATE school_website_settings SET ${column} = ?, updated_at = datetime('now') WHERE school_id = ?`).run(
        file.id,
        schoolId,
      );

      res.status(201).json({ fileId: file.id, assetRole });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload image asset.' });
    }
  },
);

schoolWebsiteRouter.get(
  '/website/pages',
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const pages = db
      .prepare('SELECT * FROM school_website_pages WHERE school_id = ? ORDER BY display_order ASC, updated_at DESC')
      .all(req.auth!.activeSchoolId!);
    res.json({ pages });
  },
);

schoolWebsiteRouter.post(
  '/website/pages',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = upsertWebsitePageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid website page.' });
      return;
    }

    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    const existing = db
      .prepare('SELECT id FROM school_website_pages WHERE school_id = ? AND slug = ?')
      .get(schoolId, d.slug) as { id: string } | undefined;
    const id = existing?.id ?? `swp_${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO school_website_pages (id, school_id, slug, title, section_type, content, display_order, is_published, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(school_id, slug) DO UPDATE SET
        title = excluded.title,
        section_type = excluded.section_type,
        content = excluded.content,
        display_order = excluded.display_order,
        is_published = excluded.is_published,
        updated_at = datetime('now')
    `).run(id, schoolId, d.slug, d.title, d.sectionType, d.content, d.displayOrder, d.isPublished ? 1 : 0);

    const page = db.prepare('SELECT * FROM school_website_pages WHERE id = ?').get(id);
    res.status(201).json({ page });
  },
);

schoolWebsiteRouter.delete(
  '/website/pages/:pageId',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const result = db
      .prepare('DELETE FROM school_website_pages WHERE id = ? AND school_id = ?')
      .run(req.params.pageId, req.auth!.activeSchoolId!);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Website page not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolWebsiteRouter.get(
  '/website/announcements',
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const items = db
      .prepare('SELECT * FROM school_website_announcements WHERE school_id = ? ORDER BY published_at DESC')
      .all(req.auth!.activeSchoolId!);
    res.json({ announcements: items });
  },
);

schoolWebsiteRouter.post(
  '/website/announcements',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createWebsiteAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid news post.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const d = parsed.data;
    const id = `swn_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO school_website_announcements (id, school_id, title, summary, body, category, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, schoolId, d.title, d.summary, d.body, d.category, d.isPublished ? 1 : 0);
    const announcement = db.prepare('SELECT * FROM school_website_announcements WHERE id = ?').get(id);
    res.status(201).json({ announcement });
  },
);

schoolWebsiteRouter.delete(
  '/website/announcements/:id',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const result = db
      .prepare('DELETE FROM school_website_announcements WHERE id = ? AND school_id = ?')
      .run(req.params.id, req.auth!.activeSchoolId!);
    if (Number(result.changes ?? 0) === 0) {
      res.status(404).json({ error: 'Website news post not found.' });
      return;
    }
    res.json({ ok: true });
  },
);

schoolWebsiteRouter.get(
  '/website/gallery',
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const items = db
      .prepare(`
        SELECT g.*, f.original_name, f.mime_type, f.size_bytes
        FROM school_website_gallery g
        INNER JOIN stored_files f ON f.id = g.file_id
        WHERE g.school_id = ?
        ORDER BY g.display_order ASC, g.created_at DESC
      `)
      .all(req.auth!.activeSchoolId!);
    res.json({ gallery: items });
  },
);

schoolWebsiteRouter.post(
  '/website/gallery',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const { title, caption, category, fileName, mimeType, contentBase64 } = req.body ?? {};
    if (!title || !fileName || !mimeType || !contentBase64) {
      res.status(400).json({ error: 'Provide title, fileName, mimeType, and contentBase64.' });
      return;
    }
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    try {
      const file = saveValidatedFile({
        schoolId,
        uploadedByUserId: req.auth!.id,
        category: 'school_document',
        originalName: String(fileName),
        claimedMimeType: String(mimeType),
        contentBase64: String(contentBase64),
        visibility: 'private_tenant',
      });
      if (!file.mime_type.startsWith('image/')) {
        deleteStoredFileById(file.id);
        res.status(400).json({ error: 'Gallery items must be valid PNG, JPEG, or WEBP images.' });
        return;
      }
      const id = `swg_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO school_website_gallery (id, school_id, title, caption, file_id, category)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, schoolId, String(title).trim(), String(caption || '').trim(), file.id, String(category || 'Campus Life').trim());

      const item = db
        .prepare(`
          SELECT g.*, f.original_name, f.mime_type, f.size_bytes
          FROM school_website_gallery g
          INNER JOIN stored_files f ON f.id = g.file_id
          WHERE g.id = ?
        `)
        .get(id);
      res.status(201).json({ item });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to upload gallery image.' });
    }
  },
);

schoolWebsiteRouter.delete(
  '/website/gallery/:id',
  requireCsrfCheck,
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const item = db
      .prepare('SELECT id, file_id FROM school_website_gallery WHERE id = ? AND school_id = ?')
      .get(req.params.id, schoolId) as { id: string; file_id: string } | undefined;
    if (!item) {
      res.status(404).json({ error: 'Gallery item not found.' });
      return;
    }
    db.prepare('DELETE FROM school_website_gallery WHERE id = ? AND school_id = ?').run(item.id, schoolId);
    deleteStoredFileById(item.file_id);
    res.json({ ok: true });
  },
);

schoolWebsiteRouter.get(
  '/website/admissions',
  requirePermission('school.website.manage'),
  (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schoolId = req.auth!.activeSchoolId!;
    const applications = db
      .prepare(`
        SELECT aa.id, aa.application_reference, aa.applicant_first_name, aa.applicant_last_name,
               aa.guardian_name, aa.guardian_phone, aa.status, aa.created_at, c.name AS desired_class_name
        FROM admission_applications aa
        LEFT JOIN school_classes c ON c.id = aa.desired_class_id
        WHERE aa.school_id = ?
        ORDER BY aa.created_at DESC
        LIMIT 50
      `)
      .all(schoolId);
    res.json({ applications });
  },
);
