import React, { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, Copy, ExternalLink, Link2Off, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api.ts';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';

interface PublicBotInfo {
  enabled: boolean;
  botUsername: string | null;
  botUrl: string | null;
}

interface TelegramLinkSummary {
  chatId: string;
  username: string | null;
  linkedAt: string;
}

interface UserTelegramStatus {
  botConfigured: boolean;
  botUsername: string | null;
  botUrl: string | null;
  linked: boolean;
  links: TelegramLinkSummary[];
}

interface ConnectTokenResponse {
  botConfigured: boolean;
  botUsername: string | null;
  command: string;
  deepLinkUrl: string | null;
  expiresInMinutes: number;
}

interface TelegramBotConnectCardProps {
  mode: 'login' | 'portal';
  audience?: 'school' | 'workers' | 'owner';
  darkSurface?: boolean;
}

export function TelegramBotConnectCard({
  mode,
  audience = 'school',
  darkSurface = false,
}: TelegramBotConnectCardProps) {
  const [loading, setLoading] = useState(true);
  const [botInfo, setBotInfo] = useState<PublicBotInfo | null>(null);
  const [userStatus, setUserStatus] = useState<UserTelegramStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectData, setConnectData] = useState<ConnectTokenResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      if (mode === 'login') {
        const res = await fetch('/api/telegram/public-info');
        const data = (await res.json()) as PublicBotInfo;
        setBotInfo(data);
      } else {
        const data = await apiRequest<UserTelegramStatus>('/api/auth/telegram-status');
        setUserStatus(data);
        setBotInfo({
          enabled: data.botConfigured,
          botUsername: data.botUsername,
          botUrl: data.botUrl,
        });
      }
    } catch {
      setBotInfo({ enabled: false, botUsername: null, botUrl: null });
      setUserStatus(null);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleGenerateConnectLink = async () => {
    setGenerating(true);
    setError(null);
    setStatusMessage(null);
    setCopied(false);
    try {
      const res = await apiRequest<ConnectTokenResponse>('/api/auth/telegram-connect-token', {
        method: 'POST',
      });
      setConnectData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate Telegram connection link.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    setStatusMessage(null);
    try {
      await apiRequest<{ ok: boolean; removedCount: number }>('/api/auth/telegram-link', {
        method: 'DELETE',
      });
      setConnectData(null);
      setStatusMessage('Telegram account disconnected from this portal profile.');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disconnect Telegram account.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCopyCommand = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return null;
  }

  if (mode === 'login') {
    if (!botInfo?.enabled) {
      return null;
    }

    const audienceCopy =
      audience === 'workers'
        ? 'Platform Owner & DT Workforce can sign in directly through the official bot.'
        : 'Students, Parents, Teachers & School Admins can sign in or check records via Telegram.';

    return (
      <div
        className={
          darkSurface
            ? 'rounded-xl border border-slate-700 bg-slate-900/90 p-4 text-slate-100 shadow-lg'
            : 'rounded-xl border border-slate-200 bg-white p-4 text-[#0F172A] shadow-xs'
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={
                darkSurface
                  ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-[#60A5FA]'
                  : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1E3A8A]'
              }
            >
              <Bot className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-tight">
                Sign In with Telegram {botInfo.botUsername ? `(@${botInfo.botUsername})` : ''}
              </p>
              <p className={darkSurface ? 'text-xs text-slate-300' : 'text-xs text-slate-600'}>
                {audienceCopy} Open Telegram and send <code className="font-mono">/start</code> or{' '}
                <code className="font-mono">/login</code>.
              </p>
            </div>
          </div>

          {botInfo.botUrl ? (
            <a
              href={botInfo.botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Open Bot</span>
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (!botInfo?.enabled) {
    if (audience === 'owner') {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1E3A8A]">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-base">Universal Telegram Bot Not Configured</CardTitle>
                <CardDescription>
                  Connect one Telegram bot token to enable 1-click sign-in and portal actions for all schools and users.
                </CardDescription>
              </div>
            </div>
            <Link to="/dashboard/owner/telegram">
              <Button type="button" size="sm">
                Configure Telegram Bot
              </Button>
            </Link>
          </CardHeader>
        </Card>
      );
    }
    return null;
  }

  const isLinked = Boolean(userStatus?.linked && userStatus.links.length > 0);
  const primaryLink = userStatus?.links?.[0] ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isLinked ? 'bg-emerald-50 text-emerald-700' : 'bg-[#EFF6FF] text-[#1E3A8A]'
            }`}
          >
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                Universal Telegram Bot {botInfo.botUsername ? `(@${botInfo.botUsername})` : ''}
              </CardTitle>
              {isLinked ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Connected</span>
                </span>
              ) : null}
            </div>
            <CardDescription>
              {isLinked && primaryLink ? (
                <span>
                  Linked to{' '}
                  <strong className="text-slate-800">
                    {primaryLink.username ? `@${primaryLink.username}` : `Chat ${primaryLink.chatId}`}
                  </strong>{' '}
                  (Chat ID <span className="font-mono">{primaryLink.chatId}</span>
                  {userStatus && userStatus.links.length > 1
                    ? ` · ${userStatus.links.length} chats active`
                    : ''}
                  ). Portal alerts and 1-click sign-in are active.
                </span>
              ) : (
                'Link this portal account to Telegram for 1-click dashboard sign-in and instant role alerts without typing passwords.'
              )}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isLinked && botInfo.botUrl ? (
            <a
              href={botInfo.botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Open Bot</span>
            </a>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={isLinked ? 'outline' : 'default'}
            disabled={generating || disconnecting}
            onClick={() => void handleGenerateConnectLink()}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {generating
                ? 'Generating Link...'
                : isLinked
                  ? 'Link Another Device'
                  : 'Connect Telegram Account'}
            </span>
          </Button>
          {isLinked ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disconnecting || generating}
              onClick={() => void handleDisconnect()}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{disconnecting ? 'Disconnecting...' : 'Disconnect'}</span>
            </Button>
          ) : null}
          {audience === 'owner' ? (
            <Link to="/dashboard/owner/telegram">
              <Button type="button" size="sm" variant="outline">
                Manage Bot
              </Button>
            </Link>
          ) : null}
        </div>
      </CardHeader>

      {error || statusMessage || connectData ? (
        <CardContent className="space-y-3 border-t border-slate-100 pt-4">
          {error ? <Alert variant="error">{error}</Alert> : null}
          {statusMessage ? <Alert variant="success">{statusMessage}</Alert> : null}

          {connectData ? (() => {
            const startParam = connectData.command.replace(/^\/start\s+/, '');
            const effectiveUsername = connectData.botUsername || botInfo.botUsername;
            const effectiveDeepLink =
              connectData.deepLinkUrl ||
              (effectiveUsername ? `https://t.me/${effectiveUsername}?start=${encodeURIComponent(startParam)}` : null);
            return (
              <div className="rounded-lg border border-blue-200 bg-[#EFF6FF]/60 p-4 space-y-3 text-xs">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-[#1E3A8A]">
                      One-Time Connection Link Ready (expires in {connectData.expiresInMinutes} minutes)
                    </p>
                    <p className="mt-0.5 text-slate-600">
                      {effectiveDeepLink
                        ? 'Launch Telegram with the button to connect automatically, or copy and send the command below.'
                        : 'Copy the one-time command below and send it inside your portal bot chat on Telegram.'}
                    </p>
                  </div>
                  {effectiveDeepLink ? (
                    <a
                      href={effectiveDeepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 font-semibold text-white hover:bg-blue-600 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Launch @{effectiveUsername}</span>
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <code className="font-mono text-[11px] text-[#0F172A] break-all">
                    {connectData.command}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCommand(connectData.command)}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        <span>Copy Command</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })() : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
