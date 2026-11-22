import crypto from 'node:crypto';
import { getDb } from '../../db/client.ts';
import type { RoleCode } from '../types.ts';
import { dispatchFcmNotification, getFcmIntegrationStatus } from './fcm-adapter.ts';

export type NotificationScope = 'platform' | 'school' | 'teacher' | 'student' | 'parent' | 'direct';
export type NotificationSeverity = 'info' | 'notice' | 'urgent';

export interface NotificationItem {
  id: string;
  school_id: string | null;
  school_name?: string | null;
  scope: NotificationScope;
  target_role_code: string | null;
  target_user_id: string | null;
  created_by_name: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  fcm_delivery_state: string;
  created_at: string;
  is_read: boolean;
}

export async function createNotificationRecord(params: {
  schoolId: string | null;
  scope: NotificationScope;
  targetRoleCode?: string | null;
  targetUserId?: string | null;
  createdByUserId: string;
  createdByName: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
}): Promise<NotificationItem> {
  const db = getDb();
  const id = `ntf_${crypto.randomUUID()}`;

  const fcmResult = await dispatchFcmNotification({
    notificationId: id,
    title: params.title,
    body: params.body,
    deviceTokens: [],
  });

  db.prepare(`
    INSERT INTO notifications (
      id, school_id, scope, target_role_code, target_user_id,
      created_by_user_id, created_by_name, title, body, severity, fcm_delivery_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.schoolId,
    params.scope,
    params.targetRoleCode ?? null,
    params.targetUserId ?? null,
    params.createdByUserId,
    params.createdByName,
    params.title,
    params.body,
    params.severity,
    fcmResult.status,
  );

  const created = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Omit<
    NotificationItem,
    'is_read'
  >;

  return {
    ...created,
    is_read: false,
  };
}

export function listPlatformNotifications(userId: string): {
  notifications: NotificationItem[];
  unreadCount: number;
  fcm: ReturnType<typeof getFcmIntegrationStatus>;
} {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT
        n.id, n.school_id, sch.name AS school_name, n.scope, n.target_role_code, n.target_user_id,
        n.created_by_name, n.title, n.body, n.severity, n.fcm_delivery_state, n.created_at,
        CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END AS is_read_int
      FROM notifications n
      LEFT JOIN schools sch ON sch.id = n.school_id
      LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 60
    `)
    .all(userId) as Array<Omit<NotificationItem, 'is_read'> & { is_read_int: number }>;

  const notifications = rows.map(({ is_read_int, ...rest }) => ({
    ...rest,
    is_read: is_read_int === 1,
  }));

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    fcm: getFcmIntegrationStatus(),
  };
}

export function listScopedSchoolNotifications(params: {
  schoolId: string;
  userId: string;
  roleCode: RoleCode;
}): {
  notifications: NotificationItem[];
  unreadCount: number;
  fcm: ReturnType<typeof getFcmIntegrationStatus>;
} {
  const db = getDb();
  const isSchoolAdmin = params.roleCode === 'school_admin';

  // School admins see all notifications for their school + platform announcements.
  // Teachers, students, and parents see platform announcements, school broadcasts,
  // role-targeted notices matching their roleCode, or direct notices addressed to them.
  const rows = isSchoolAdmin
    ? (db
        .prepare(`
          SELECT
            n.id, n.school_id, n.scope, n.target_role_code, n.target_user_id,
            n.created_by_name, n.title, n.body, n.severity, n.fcm_delivery_state, n.created_at,
            CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END AS is_read_int
          FROM notifications n
          LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
          WHERE n.scope = 'platform' OR n.school_id = ?
          ORDER BY n.created_at DESC
          LIMIT 60
        `)
        .all(params.userId, params.schoolId) as Array<
        Omit<NotificationItem, 'is_read'> & { is_read_int: number }
      >)
    : (db
        .prepare(`
          SELECT
            n.id, n.school_id, n.scope, n.target_role_code, n.target_user_id,
            n.created_by_name, n.title, n.body, n.severity, n.fcm_delivery_state, n.created_at,
            CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END AS is_read_int
          FROM notifications n
          LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
          WHERE n.scope = 'platform'
             OR (
               n.school_id = ?
               AND (
                 n.scope = 'school'
                 OR (n.scope = ? AND (n.target_role_code IS NULL OR n.target_role_code = ?))
                 OR (n.scope = 'direct' AND n.target_user_id = ?)
               )
             )
          ORDER BY n.created_at DESC
          LIMIT 60
        `)
        .all(
          params.userId,
          params.schoolId,
          params.roleCode,
          params.roleCode,
          params.userId,
        ) as Array<Omit<NotificationItem, 'is_read'> & { is_read_int: number }>);

  const notifications = rows.map(({ is_read_int, ...rest }) => ({
    ...rest,
    is_read: is_read_int === 1,
  }));

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    fcm: getFcmIntegrationStatus(),
  };
}

export function markNotificationReadForUser(params: {
  notificationId: string;
  userId: string;
  schoolId: string | null;
  roleCode: RoleCode;
}): boolean {
  const db = getDb();
  const notif = db
    .prepare('SELECT id, school_id, scope, target_user_id FROM notifications WHERE id = ?')
    .get(params.notificationId) as
    | {
        id: string;
        school_id: string | null;
        scope: NotificationScope;
        target_user_id: string | null;
      }
    | undefined;

  if (!notif) return false;

  if (params.schoolId !== null && notif.scope !== 'platform') {
    if (notif.school_id !== params.schoolId) return false;
    if (
      params.roleCode !== 'school_admin' &&
      notif.scope === 'direct' &&
      notif.target_user_id !== params.userId
    ) {
      return false;
    }
    if (
      params.roleCode !== 'school_admin' &&
      notif.scope !== 'school' &&
      notif.scope !== 'direct' &&
      notif.scope !== params.roleCode
    ) {
      return false;
    }
  }

  db.prepare(`
    INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
    VALUES (?, ?)
  `).run(params.notificationId, params.userId);
  return true;
}

export function registerNotificationDeviceToken(params: {
  userId: string;
  schoolId: string | null;
  platform: 'web' | 'android' | 'ios';
  deviceToken: string;
}): { id: string; status: string } {
  const db = getDb();
  const id = `fcm_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO notification_device_tokens (id, user_id, school_id, platform, device_token, status)
    VALUES (?, ?, ?, ?, ?, 'registered_inactive')
    ON CONFLICT(device_token) DO UPDATE SET
      user_id = excluded.user_id,
      school_id = excluded.school_id,
      platform = excluded.platform,
      status = 'registered_inactive'
  `).run(id, params.userId, params.schoolId, params.platform, params.deviceToken);

  return { id, status: 'registered_inactive' };
}
