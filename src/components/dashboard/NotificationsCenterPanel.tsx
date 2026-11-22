import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Send } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { formatUtcTimestamp } from '../../lib/utils.ts';
import type {
  FcmStatus,
  NotificationItem,
  NotificationScope,
  NotificationSeverity,
  SchoolMemberRecord,
  SchoolRecord,
} from '../../types/app.ts';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select } from '../ui/select.tsx';

interface NotificationsCenterPanelProps {
  mode: 'owner' | 'school_admin' | 'school_member';
  schools?: SchoolRecord[];
  members?: SchoolMemberRecord[];
}

export function NotificationsCenterPanel({
  mode,
  schools,
  members,
}: NotificationsCenterPanelProps) {
  const apiBase = mode === 'owner' ? '/api/owner/notifications' : '/api/school/notifications';
  const canPublish = mode === 'owner' || mode === 'school_admin';

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [fcm, setFcm] = useState<FcmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [scope, setScope] = useState<NotificationScope>(mode === 'owner' ? 'platform' : 'school');
  const [schoolId, setSchoolId] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [severity, setSeverity] = useState<NotificationSeverity>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiRequest<{
        notifications: NotificationItem[];
        unreadCount: number;
        fcm: FcmStatus;
      }>(apiBase);
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
      setFcm(res.fcm);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setPublishing(true);
    try {
      await apiRequest(apiBase, {
        method: 'POST',
        body: JSON.stringify({
          scope,
          schoolId: mode === 'owner' && scope === 'school' ? schoolId : undefined,
          targetUserId: mode === 'school_admin' && scope === 'direct' ? targetUserId : undefined,
          severity,
          title,
          body,
        }),
      });
      setTitle('');
      setBody('');
      setActionMsg('Notification published and persisted.');
      await loadNotifications();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to publish notification.');
    } finally {
      setPublishing(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    setActionErr(null);
    try {
      await apiRequest(`${apiBase}/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to mark notification as read.');
    }
  };

  return (
    <div className="space-y-6">
      {fcm ? (
        <Alert variant="info" title={fcm.architecturePhase}>
          <span className="text-xs text-slate-600">
            {fcm.reason} Push dispatch active: {fcm.pushDispatchActive ? 'Yes' : 'No'}.
          </span>
        </Alert>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      <div className={canPublish ? 'grid gap-6 lg:grid-cols-12' : ''}>
        {canPublish ? (
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Publish Notification</CardTitle>
              <CardDescription>
                {mode === 'owner'
                  ? 'Broadcast announcements across all institutions or target a specific school.'
                  : 'Deliver scoped announcements to your school, a role group, or an individual member.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handlePublish(e)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="notif-scope">Audience Scope</Label>
                    <Select
                      id="notif-scope"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as NotificationScope)}
                    >
                      {mode === 'owner' ? (
                        <>
                          <option value="platform">Platform-Wide Broadcast</option>
                          <option value="school">Specific School Tenant</option>
                        </>
                      ) : (
                        <>
                          <option value="school">Entire School</option>
                          <option value="teacher">Teachers Only</option>
                          <option value="student">Students Only</option>
                          <option value="parent">Parents Only</option>
                          <option value="direct">Direct Member</option>
                        </>
                      )}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notif-severity">Priority</Label>
                    <Select
                      id="notif-severity"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as NotificationSeverity)}
                    >
                      <option value="info">Information</option>
                      <option value="notice">Notice</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                  </div>
                </div>

                {mode === 'owner' && scope === 'school' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="notif-target-school">Target School</Label>
                    <Select
                      id="notif-target-school"
                      required
                      value={schoolId}
                      onChange={(e) => setSchoolId(e.target.value)}
                    >
                      <option value="">Select a school...</option>
                      {(schools ?? []).map((sch) => (
                        <option key={sch.id} value={sch.id}>
                          {sch.name} ({sch.code})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                {mode === 'school_admin' && scope === 'direct' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="notif-target-user">Recipient Member</Label>
                    <Select
                      id="notif-target-user"
                      required
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                    >
                      <option value="">Select school member...</option>
                      {(members ?? []).map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name} ({m.role_name})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="notif-title">Headline</Label>
                  <Input
                    id="notif-title"
                    required
                    minLength={3}
                    maxLength={140}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Term Examination Timetable Update"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notif-body">Message Body</Label>
                  <textarea
                    id="notif-body"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={4}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Provide clear instructions or institutional updates..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  />
                </div>

                <Button type="submit" disabled={publishing} className="w-full">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>{publishing ? 'Publishing...' : 'Send Notification'}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className={canPublish ? 'lg:col-span-7' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Notification Feed</CardTitle>
                <CardDescription>
                  Server-filtered announcements visible to your account and role.
                </CardDescription>
              </div>
              <p className="text-xs font-semibold text-[#1E3A8A] tabular-nums whitespace-nowrap">
                {unreadCount} unread
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <Bell className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-600">No notifications in your feed yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {notifications.map((item) => (
                  <li key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold uppercase tracking-wide text-[#1E3A8A]">
                            {item.scope}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              item.severity === 'urgent'
                                ? 'font-semibold text-red-700'
                                : item.severity === 'notice'
                                  ? 'font-semibold text-amber-700'
                                  : 'text-slate-600'
                            }
                          >
                            {item.severity}
                          </span>
                          {item.school_name ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.school_name}</span>
                            </>
                          ) : null}
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatUtcTimestamp(item.created_at)}</span>
                        </div>
                        <p className="text-sm font-semibold text-[#0F172A]">
                          {item.title}
                          {!item.is_read ? ' (Unread)' : ''}
                        </p>
                      </div>

                      {!item.is_read ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleMarkRead(item.id)}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Mark Read</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Read</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                      {item.body}
                    </p>
                    <p className="text-xs text-slate-400">Issued by {item.created_by_name}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
