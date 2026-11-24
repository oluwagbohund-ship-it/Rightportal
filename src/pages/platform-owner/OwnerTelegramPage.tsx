import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Building2,
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
  WifiOff,
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
import { Skeleton, TableSkeleton } from '../../components/ui/skeleton.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.tsx';
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

const BOT_COMMANDS = [
  { cmd: '/start · /menu', desc: 'Opens the interactive role-specific button menu or guided sign-in.' },
  { cmd: '/link <email/ID>', desc: 'Verifies credentials to connect any Student, Parent, Teacher, Admin, or Owner.' },
  { cmd: '/idlogin · /idcard', desc: 'Student Digital ID sign-in and live QR PNG card retrieval.' },
  { cmd: '/login', desc: 'Generates a 1-click single-use sign-in link straight to the user dashboard.' },
  { cmd: '/attendance · /results', desc: 'Students and Parents inspect attendance logs and published grades.' },
  { cmd: '/fees · /wards', desc: 'Balances and receipts for Students/Parents plus linked wards overview.' },
  { cmd: '/classes · /checkin', desc: 'Teachers inspect assigned classes or scan ID tokens to mark Present.' },
  { cmd: '/overview · /admissions', desc: 'School Admins and Platform Owner monitor snapshots, finance, and schools.' },
];

export function OwnerTelegramPage() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [links, setLinks] = useState<TelegramLinkItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

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
        eyebrow="Integrations & Operations"
        title="Platform Telegram Bot Management"
        description="Configure the universal platform Telegram bot token, automate webhook registration, and monitor Students, Parents, Teachers, School Admins, and Platform Workforce chat sessions."
        actions={
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStatusAndLinks(true)}
              disabled={refreshing || loading}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh Status</span>
            </Button>
            {status?.botInfo?.username ? (
              <a
                href={`https://t.me/${status.botInfo.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 text-xs font-medium text-white hover:bg-[#1D4ED8] transition-colors whitespace-nowrap"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Open @{status.botInfo.username}</span>
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

      {/* Clean KPI Overview Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">
              Bot Connection
            </CardDescription>
            <Bot className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-28 my-1" />
            ) : status?.configured && status.botInfo ? (
              <p className="inline-flex items-center gap-1.5 font-display text-xl font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Online</span>
              </p>
            ) : status?.configured ? (
              <p className="font-display text-xl font-bold text-amber-700">Configured</p>
            ) : (
              <p className="inline-flex items-center gap-1.5 font-display text-xl font-bold text-slate-600">
                <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Disconnected</span>
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-500 truncate">
              {status?.botInfo?.username
                ? `@${status.botInfo.username} (${status.botInfo.first_name})`
                : 'No Telegram bot token active'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">
              Webhook Delivery
            </CardDescription>
            <Radio className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-28 my-1" />
            ) : status?.webhookInfo?.url ? (
              <p className="inline-flex items-center gap-1.5 font-display text-xl font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Active</span>
              </p>
            ) : (
              <p className="font-display text-xl font-bold text-amber-700">Awaiting Setup</p>
            )}
            <p className="mt-1.5 text-xs text-slate-500 truncate font-mono">
              {status?.webhookInfo?.url || 'HTTPS webhook endpoint'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">
              Linked Accounts
            </CardDescription>
            <Users className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-14 my-1" />
            ) : (
              <p className="font-display text-2xl font-bold text-[#0F172A] tabular-nums">
                {status?.stats?.totalLinks ?? 0}
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
              {status?.stats?.studentLinks ?? 0} Students · {status?.stats?.parentLinks ?? 0} Parents ·{' '}
              {status?.stats?.teacherLinks ?? 0} Teachers ·{' '}
              {(status?.stats?.adminLinks ?? 0) + (status?.stats?.workforceLinks ?? 0)} Admins/Ops
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">
              Schools Connected
            </CardDescription>
            <Building2 className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-14 my-1" />
            ) : (
              <p className="font-display text-2xl font-bold text-[#0F172A] tabular-nums">
                {status?.stats?.schoolsRepresented ?? 0}
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-500">Tenants with active chat sessions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#1E3A8A]" aria-hidden="true" />
              <CardTitle>Bot Credentials &amp; Webhook Setup</CardTitle>
            </div>
            <CardDescription>
              Set or update your universal Telegram Bot token. Credentials are validated with Telegram servers before registering the webhook endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSaveAndConnect} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Obtain a bot token from <strong className="text-slate-700">@BotFather</strong> on Telegram using{' '}
                  <code className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                    /newbot
                  </code>
                  .
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
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
                  Accessible HTTPS endpoint where Telegram delivers real-time bot updates.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
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
                      <Radio className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <span>Re-Sync Webhook</span>
                    </Button>
                  ) : null}
                </div>

                {status?.configured ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSyncWebhook('delete')}
                      disabled={deletingWebhook || saving}
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      {deletingWebhook ? 'Removing...' : 'Delete Webhook'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowClearConfirm(true)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>Clear Credentials</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Live Diagnostics */}
        <Card>
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <CardTitle>Live Diagnostics</CardTitle>
            </div>
            <CardDescription>Verified details from Telegram servers</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4 text-xs">
            {status?.botInfo ? (
              <dl className="divide-y divide-slate-100 border border-slate-200 rounded-lg px-3.5">
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Bot Username</dt>
                  <dd className="font-semibold text-[#0F172A]">@{status.botInfo.username}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Display Name</dt>
                  <dd className="font-semibold text-[#0F172A]">{status.botInfo.first_name}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Telegram ID</dt>
                  <dd className="font-mono text-slate-700 tabular-nums">{status.botInfo.id}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500">Group Support</dt>
                  <dd className="font-medium text-emerald-700">
                    {status.botInfo.can_join_groups ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-slate-500">
                Connect a bot token to inspect live bot metadata.
              </div>
            )}

            <dl className="divide-y divide-slate-100 border border-slate-200 rounded-lg px-3.5">
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500">Webhook Registered</dt>
                <dd className="font-semibold text-[#0F172A]">
                  {status?.webhookInfo?.url ? 'Yes' : 'No'}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-slate-500">Pending Updates</dt>
                <dd className="font-mono text-[#0F172A] tabular-nums">
                  {status?.webhookInfo?.pending_update_count ?? 0}
                </dd>
              </div>
              {status?.webhookInfo?.last_error_message ? (
                <div className="py-2.5 text-red-600 space-y-1">
                  <dt className="font-semibold">Last Webhook Error</dt>
                  <dd className="font-mono text-[11px] leading-tight break-all">
                    {status.webhookInfo.last_error_message}
                  </dd>
                </div>
              ) : null}
            </dl>

            {status?.botInfo?.username ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(`https://t.me/${status.botInfo!.username}`, 'Bot Share Link')}
                className="w-full"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy Share Link for Schools</span>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Linked Accounts Directory */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#1E3A8A]" aria-hidden="true" />
                <span>Active Linked Telegram Accounts ({filteredLinks.length})</span>
              </CardTitle>
              <CardDescription>
                Auditable directory of Students, Parents, Teachers, School Admins, and Platform Staff connected to the universal bot.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                <Input
                  placeholder="Search user, ID or school..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs"
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
        <CardContent className="pt-4">
          {loading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : filteredLinks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center space-y-1.5">
              <Bot className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-[#0F172A]">No linked Telegram accounts found</p>
              <p className="text-xs text-slate-500">
                {searchQuery || roleFilter !== 'all'
                  ? 'Clear your search query or role filter to view all connected accounts.'
                  : 'Users link via the Connect Telegram button in their portal or by sending /link inside Telegram.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User &amp; Identifier</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tenant / Scope</TableHead>
                  <TableHead>Telegram Identity</TableHead>
                  <TableHead>Linked On</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.map((item) => (
                  <TableRow key={item.telegram_chat_id}>
                    <TableCell>
                      <p className="font-semibold text-[#0F172A] text-xs">{item.user_full_name || 'Portal User'}</p>
                      <p className="font-mono text-[11px] text-slate-500">{item.identifier || item.user_id}</p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${
                          item.role === 'student'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : item.role === 'parent'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : item.role === 'teacher'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : item.role === 'school_admin'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-[#0F172A] text-white border-[#0F172A]'
                        }`}
                      >
                        {item.role.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium text-slate-800">{item.school_name || 'Platform Operations'}</p>
                      {item.school_code ? (
                        <span className="font-mono text-[11px] text-slate-500">{item.school_code}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium text-[#0F172A]">
                        {item.telegram_username ? `@${item.telegram_username}` : 'Chat Session'}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                        Chat ID: {item.telegram_chat_id}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 tabular-nums">
                      {new Date(item.linked_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUnlinkChatId(item.telegram_chat_id)}
                        className="text-red-600 hover:bg-red-50 border-red-200"
                      >
                        Unlink
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Command Reference */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-slate-700" aria-hidden="true" />
            <CardTitle>Universal Bot Commands Reference</CardTitle>
          </div>
          <CardDescription>
            Role-aware interactive buttons and slash commands supported across Students, Parents, Teachers, School Admins, and Platform Staff.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {BOT_COMMANDS.map((item) => (
              <div key={item.cmd} className="rounded-lg border border-slate-200 p-3.5 bg-white">
                <p className="font-mono font-semibold text-[#1E3A8A]">{item.cmd}</p>
                <p className="mt-1.5 text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(unlinkChatId)}
        title="Unlink Telegram Account"
        description="Disconnect this user from the portal bot? They can reconnect anytime with /link."
        confirmLabel="Unlink Account"
        destructive
        busy={unlinking}
        onConfirm={() => void handleUnlink()}
        onCancel={() => setUnlinkChatId(null)}
      />

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Bot Credentials"
        description="This deletes the stored Telegram bot token from platform settings and removes the webhook until reconfigured."
        confirmLabel="Clear Credentials"
        destructive
        busy={clearing}
        onConfirm={() => void handleClearToken()}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
