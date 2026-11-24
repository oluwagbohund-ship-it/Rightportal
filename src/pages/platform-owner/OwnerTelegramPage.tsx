import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import { ConfirmDialog } from '../../components/ui/confirm-dialog.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Select } from '../../components/ui/select.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { apiRequest } from '../../lib/api.ts';

interface TelegramStatusResponse {
  configured: boolean;
  tokenMasked: string | null;
  botInfo: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
    can_join_groups?: boolean;
    can_read_all_group_messages?: boolean;
    supports_inline_queries?: boolean;
  } | null;
  webhookInfo: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    ip_address?: string;
  } | null;
  suggestedWebhookUrl: string;
  apiError: string | null;
  stats: {
    totalLinks: number;
    studentLinks: number;
    parentLinks?: number;
    teacherLinks: number;
    adminLinks?: number;
    workforceLinks?: number;
    schoolsRepresented: number;
  };
}

interface TelegramLinkItem {
  telegram_chat_id: string;
  user_id: string;
  school_id: string | null;
  role: string;
  telegram_username: string | null;
  linked_at: string;
  school_name: string | null;
  school_code: string | null;
  user_full_name: string;
  identifier: string;
  email: string | null;
}

export function OwnerTelegramPage() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [links, setLinks] = useState<TelegramLinkItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Dialogs
  const [unlinkChatId, setUnlinkChatId] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingWebhook, setDeletingWebhook] = useState(false);

  const fetchStatusAndLinks = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);
    try {
      const [statusRes, linksRes] = await Promise.all([
        apiRequest<TelegramStatusResponse>('/api/owner/telegram/status'),
        apiRequest<{ links: TelegramLinkItem[] }>('/api/owner/telegram/links'),
      ]);
      setStatus(statusRes);
      setLinks(linksRes.links || []);
      if (!webhookUrl && statusRes.suggestedWebhookUrl) {
        setWebhookUrl(statusRes.suggestedWebhookUrl);
      }
      if (isManualRefresh) {
        showToast({ variant: 'success', title: 'Refreshed', description: 'Bot status and linked accounts updated.' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Telegram details.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchStatusAndLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim() && !status?.configured) {
      showToast({ variant: 'error', title: 'Token Required', description: 'Enter a valid bot token.' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        webhookRegistered?: boolean;
        webhookWarning?: string | null;
      }>('/api/owner/telegram/configure', {
        method: 'POST',
        body: JSON.stringify({
          botToken: botToken.trim() || undefined,
          webhookUrl: webhookUrl.trim() || undefined,
        }),
      });
      if (res.webhookRegistered === false) {
        showToast({
          variant: 'info',
          title: 'Bot Saved — Webhook Pending',
          description: res.message,
        });
      } else {
        showToast({ variant: 'success', title: 'Connected Successfully', description: res.message });
      }
      setBotToken('');
      await fetchStatusAndLinks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Configuration failed.';
      setError(msg);
      showToast({ variant: 'error', title: 'Connection Failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncWebhook = async (action: 'set' | 'delete') => {
    if (action === 'delete') {
      setDeletingWebhook(true);
    } else {
      setSaving(true);
    }
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/owner/telegram/webhook', {
        method: 'POST',
        body: JSON.stringify({
          action,
          webhookUrl: action === 'set' ? webhookUrl.trim() || undefined : undefined,
        }),
      });
      showToast({ variant: 'success', title: 'Webhook Updated', description: res.message });
      await fetchStatusAndLinks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Webhook update failed.';
      showToast({ variant: 'error', title: 'Failed', description: msg });
    } finally {
      setDeletingWebhook(false);
      setSaving(false);
    }
  };

  const handleClearToken = async () => {
    setClearing(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/owner/telegram/clear', {
        method: 'POST',
      });
      showToast({ variant: 'success', title: 'Cleared', description: res.message });
      setShowClearConfirm(false);
      await fetchStatusAndLinks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear token.';
      showToast({ variant: 'error', title: 'Error', description: msg });
    } finally {
      setClearing(false);
    }
  };

  const handleUnlink = async () => {
    if (!unlinkChatId) return;
    setUnlinking(true);
    try {
      await apiRequest(`/api/owner/telegram/links/${unlinkChatId}`, {
        method: 'DELETE',
      });
      showToast({ variant: 'success', title: 'Unlinked', description: 'Account unlinked from Telegram.' });
      setUnlinkChatId(null);
      await fetchStatusAndLinks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unlink account.';
      showToast({ variant: 'error', title: 'Error', description: msg });
    } finally {
      setUnlinking(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    showToast({ variant: 'success', title: 'Copied', description: `${label} copied to clipboard.` });
  };

  const filteredLinks = useMemo(() => {
    return links.filter((item) => {
      const matchRole =
        roleFilter === 'all' ||
        (roleFilter === 'workforce'
          ? ['platform_owner', 'workforce_admin', 'workforce_support'].includes(item.role)
          : item.role === roleFilter);
      if (!matchRole) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.user_full_name?.toLowerCase().includes(q) ||
        item.identifier?.toLowerCase().includes(q) ||
        item.telegram_username?.toLowerCase().includes(q) ||
        item.school_name?.toLowerCase().includes(q) ||
        item.telegram_chat_id.includes(q)
      );
    });
  }, [links, searchQuery, roleFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Telegram Bot Management"
        description="Configure the universal platform Telegram bot token, automate webhook registration, and monitor Students, Parents, Teachers, School Admins, and Platform Workforce chat sessions."
        actions={
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStatusAndLinks(true)}
              disabled={refreshing || loading}
              className="gap-2 whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
            {status?.botInfo?.username ? (
              <a
                href={`https://t.me/${status.botInfo.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-600 transition whitespace-nowrap"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open @{status.botInfo.username}
              </a>
            ) : null}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {status?.apiError ? (
        <Alert variant="info">
          <strong>Telegram API Notice:</strong> {status.apiError}
        </Alert>
      ) : null}

      {/* KPI Overview Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-[#2563EB]">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase text-slate-500">
              Bot Status
            </CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              {status?.configured && status.botInfo ? (
                <>
                  <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-700">Online</span>
                </>
              ) : status?.configured ? (
                <>
                  <span className="flex h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-amber-700">Configured (Unverified)</span>
                </>
              ) : (
                <>
                  <span className="flex h-3 w-3 rounded-full bg-slate-400" />
                  <span className="text-slate-600">Disconnected</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              {status?.botInfo?.username
                ? `@${status.botInfo.username} (${status.botInfo.first_name})`
                : 'No Telegram bot connected'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase text-slate-500">
              Webhook Delivery
            </CardDescription>
            <CardTitle className="text-xl font-bold text-slate-900">
              {status?.webhookInfo?.url ? (
                <span className="text-emerald-600 flex items-center gap-1.5 text-base font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Active Webhook
                </span>
              ) : (
                <span className="text-amber-600 text-base font-semibold">No Webhook</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600 truncate">
              {status?.webhookInfo?.url || 'Awaiting setup'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase text-slate-500">
              Linked Accounts
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {status?.stats?.totalLinks ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              {status?.stats?.studentLinks ?? 0} Students • {status?.stats?.parentLinks ?? 0} Parents •{' '}
              {status?.stats?.teacherLinks ?? 0} Teachers •{' '}
              {(status?.stats?.adminLinks ?? 0) + (status?.stats?.workforceLinks ?? 0)} Admins/Ops
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-600">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase text-slate-500">
              Schools Participating
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {status?.stats?.schoolsRepresented ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">Tenants with active chat sessions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#2563EB]" />
              <CardTitle>Bot Credentials & Webhook Setup</CardTitle>
            </div>
            <CardDescription>
              Set or update your Telegram Bot token. The system automatically tests the token against Telegram and registers the webhook URL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAndConnect} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="owner-telegram-token">Telegram Bot Token</Label>
                  {status?.tokenMasked ? (
                    <span className="text-xs font-mono text-slate-500">
                      Active: {status.tokenMasked}
                    </span>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id="owner-telegram-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder={
                      status?.configured
                        ? 'Enter new token to replace existing'
                        : 'e.g. 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz'
                    }
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    required={!status?.configured}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Obtain your bot token from <strong className="text-slate-700">@BotFather</strong> on Telegram by sending <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800">/newbot</code>.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="owner-telegram-webhook">Webhook Endpoint URL</Label>
                  {status?.suggestedWebhookUrl ? (
                    <button
                      type="button"
                      onClick={() => setWebhookUrl(status.suggestedWebhookUrl)}
                      className="text-xs font-medium text-[#2563EB] hover:underline"
                    >
                      Use Recommended URL
                    </button>
                  ) : null}
                </div>
                <Input
                  id="owner-telegram-webhook"
                  type="url"
                  placeholder="https://your-domain.onrender.com/api/telegram/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500">
                  Must be an accessible HTTPS endpoint where Telegram will deliver real-time messages.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving || (!botToken.trim() && !status?.configured)}>
                    {saving ? 'Validating & Registering...' : 'Save & Register Webhook'}
                  </Button>
                  {status?.configured ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleSyncWebhook('set')}
                      disabled={saving}
                      title="Re-register webhook URL with Telegram"
                    >
                      <Radio className="mr-1.5 h-4 w-4 text-emerald-600" />
                      Re-Sync Webhook
                    </Button>
                  ) : null}
                </div>

                {status?.configured ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleSyncWebhook('delete')}
                      disabled={deletingWebhook || saving}
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      {deletingWebhook ? 'Removing...' : 'Delete Webhook'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowClearConfirm(true)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Clear Credentials
                    </Button>
                  </div>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Telegram Diagnostic Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <CardTitle>Live Diagnostics</CardTitle>
            </div>
            <CardDescription>Verified status directly from Telegram API servers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {status?.botInfo ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Bot Username:</span>
                  <span className="font-semibold text-slate-900">@{status.botInfo.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bot Name:</span>
                  <span className="font-semibold text-slate-900">{status.botInfo.first_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bot ID:</span>
                  <span className="font-mono text-slate-700">{status.botInfo.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Group Support:</span>
                  <span className="font-medium text-emerald-600">
                    {status.botInfo.can_join_groups ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-slate-500">
                Connect a bot token to view live details.
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="font-semibold text-slate-800">Webhook Diagnostic Report</p>
              <div className="flex justify-between">
                <span className="text-slate-500">Registered:</span>
                <span className="font-medium text-slate-800">
                  {status?.webhookInfo?.url ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pending Updates:</span>
                <span className="font-mono text-slate-800">
                  {status?.webhookInfo?.pending_update_count ?? 0}
                </span>
              </div>
              {status?.webhookInfo?.last_error_message ? (
                <div className="border-t border-slate-200 pt-2 text-red-600">
                  <p className="font-medium">Last Webhook Error:</p>
                  <p className="mt-0.5 font-mono text-[11px] leading-tight break-all">
                    {status.webhookInfo.last_error_message}
                  </p>
                </div>
              ) : null}
            </div>

            {status?.botInfo?.username ? (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(`https://t.me/${status.botInfo!.username}`, 'Bot Share Link')}
                  className="w-full gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Share Link for Schools
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Linked Accounts Directory */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#2563EB]" />
                Active Linked Telegram Accounts ({filteredLinks.length})
              </CardTitle>
              <CardDescription>
                Auditable directory of Students, Parents, Teachers, School Admins, and Platform Staff connected to the universal bot.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search user, ID or school..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs"
                />
              </div>
              <div className="w-40">
                <Select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  aria-label="Filter by role"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Students</option>
                  <option value="parent">Parents</option>
                  <option value="teacher">Teachers</option>
                  <option value="school_admin">School Admins</option>
                  <option value="workforce">Platform Workforce</option>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading linked accounts...</p>
          ) : filteredLinks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <Bot className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">No linked Telegram accounts found</p>
              <p className="mt-1 text-xs text-slate-500">
                {searchQuery || roleFilter !== 'all'
                  ? 'Try clearing your search query or role filter.'
                  : 'Users link via the Connect Telegram button on their portal or by sending /link in Telegram.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">User & Identifier</th>
                    <th className="py-2.5 px-3 font-semibold">Role</th>
                    <th className="py-2.5 px-3 font-semibold">Tenant / Scope</th>
                    <th className="py-2.5 px-3 font-semibold">Telegram Identity</th>
                    <th className="py-2.5 px-3 font-semibold">Linked At</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLinks.map((item) => (
                    <tr key={item.telegram_chat_id} className="hover:bg-slate-50/75">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900">{item.user_full_name || 'Portal User'}</p>
                        <p className="font-mono text-[11px] text-slate-500">{item.identifier || item.user_id}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                            item.role === 'student'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : item.role === 'parent'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : item.role === 'teacher'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : item.role === 'school_admin'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-900 text-white border border-slate-900'
                          }`}
                        >
                          {item.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-slate-800">{item.school_name || 'Platform Operations'}</p>
                        {item.school_code ? (
                          <span className="font-mono text-[11px] text-slate-500">[{item.school_code}]</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-slate-900">
                          {item.telegram_username ? `@${item.telegram_username}` : 'Chat Session'}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">Chat ID: {item.telegram_chat_id}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(item.linked_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUnlinkChatId(item.telegram_chat_id)}
                          className="text-red-600 hover:bg-red-50 border-red-200 h-7 text-xs"
                        >
                          Unlink
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Command Reference Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-slate-700" />
            <CardTitle>Universal Bot Commands Reference</CardTitle>
          </div>
          <CardDescription>
            Role-aware interactive buttons and slash commands supported across Students, Parents, Teachers, School Admins, and Platform Staff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/start , /menu</p>
              <p className="mt-1 text-slate-600">Opens the interactive role-specific button menu or guided login.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/link &lt;email/ID&gt;</p>
              <p className="mt-1 text-slate-600">Verifies credentials to connect any Student, Parent, Teacher, Admin, or Owner.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/idlogin , /idcard</p>
              <p className="mt-1 text-slate-600">Student Digital ID sign-in & live QR PNG card retrieval.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/login</p>
              <p className="mt-1 text-slate-600">Generates a 1-click single-use sign-in link straight to the user dashboard.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/attendance , /results</p>
              <p className="mt-1 text-slate-600">Students & Parents inspect attendance logs and published grades.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/fees , /wards</p>
              <p className="mt-1 text-slate-600">Balances & receipts for Students/Parents; linked wards list.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/classes , /checkin</p>
              <p className="mt-1 text-slate-600">Teachers inspect assigned classes or scan/paste ID tokens to mark Present.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <p className="font-mono font-bold text-[#1E3A8A]">/overview , /admissions</p>
              <p className="mt-1 text-slate-600">School Admins & Platform Owner monitor snapshots, finance, and schools.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirm Unlink Dialog */}
      <ConfirmDialog
        open={Boolean(unlinkChatId)}
        title="Unlink Telegram Account"
        description="Are you sure you want to disconnect this user from the portal bot? The user will need to run /link again to re-connect."
        confirmLabel="Unlink Account"
        destructive
        busy={unlinking}
        onConfirm={() => void handleUnlink()}
        onCancel={() => setUnlinkChatId(null)}
      />

      {/* Confirm Clear Credentials Dialog */}
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Bot Credentials"
        description="This will delete the stored Telegram bot token from the platform settings and remove the webhook. The bot will no longer respond to messages until re-configured."
        confirmLabel="Clear Credentials"
        destructive
        busy={clearing}
        onConfirm={() => void handleClearToken()}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
