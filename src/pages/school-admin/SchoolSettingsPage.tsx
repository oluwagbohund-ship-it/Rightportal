import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SchoolSettingsConfig } from '../../types/app.ts';

function computeClientPreview(
  template: string,
  prefix: string,
  schoolCode: string,
  seq: number,
): string {
  const cleanPrefix = (prefix || 'ADM').toUpperCase();
  const cleanCode = (schoolCode || 'SCH').toUpperCase();
  const year = String(new Date().getUTCFullYear());
  const padded = String(Math.max(1, seq)).padStart(4, '0');
  return (template || '{PREFIX}/{YEAR}/{SEQ}')
    .replaceAll('{PREFIX}', cleanPrefix)
    .replaceAll('{CODE}', cleanCode)
    .replaceAll('{YEAR}', year)
    .replaceAll('{SEQ}', padded);
}

export function SchoolSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [admissionNumberPrefix, setAdmissionNumberPrefix] = useState('ADM');
  const [admissionNumberFormat, setAdmissionNumberFormat] = useState('{PREFIX}/{YEAR}/{SEQ}');
  const [admissionNextSeq, setAdmissionNextSeq] = useState('1');
  const [applicationRefPrefix, setApplicationRefPrefix] = useState('APP');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramStatus, setTelegramStatus] = useState<{
    bot_configured: boolean;
    linked_accounts_count: number;
    bot_username: string;
  } | null>(null);
  const [configuringTelegram, setConfiguringTelegram] = useState(false);

  useEffect(() => {
    apiRequest<{ bot_configured: boolean; linked_accounts_count: number; bot_username: string }>('/api/telegram/status')
      .then((res) => setTelegramStatus(res))
      .catch(() => {});
  }, []);

  const handleConfigureTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramToken.trim()) return;
    setConfiguringTelegram(true);
    try {
      const res = await apiRequest<{ bot_username: string; message: string }>('/api/telegram/configure', {
        method: 'POST',
        body: JSON.stringify({ bot_token: telegramToken.trim() }),
      });
      showToast({ variant: 'success', title: 'Telegram Bot Connected', description: res.message });
      setTelegramToken('');
      const statusRes = await apiRequest<{ bot_configured: boolean; linked_accounts_count: number; bot_username: string }>('/api/telegram/status');
      setTelegramStatus(statusRes);
    } catch (err) {
      showToast({ variant: 'error', title: 'Connection Failed', description: err instanceof Error ? err.message : 'Invalid token' });
    } finally {
      setConfiguringTelegram(false);
    }
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ settings: SchoolSettingsConfig }>('/api/school/settings')
      .then((res) => {
        if (!active) return;
        setAdmissionNumberPrefix(res.settings.admissionNumberPrefix);
        setAdmissionNumberFormat(res.settings.admissionNumberFormat);
        setAdmissionNextSeq(String(res.settings.admissionNextSeq));
        setApplicationRefPrefix(res.settings.applicationRefPrefix);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load numbering settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const livePreview = computeClientPreview(
    admissionNumberFormat,
    admissionNumberPrefix,
    user?.activeSchoolCode ?? 'SCH',
    Number(admissionNextSeq) || 1,
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiRequest<{ settings: SchoolSettingsConfig }>('/api/school/settings', {
        method: 'PUT',
        body: JSON.stringify({
          admissionNumberPrefix: admissionNumberPrefix.trim().toUpperCase(),
          admissionNumberFormat: admissionNumberFormat.trim(),
          admissionNextSeq: Math.max(1, Number(admissionNextSeq) || 1),
          applicationRefPrefix: applicationRefPrefix.trim().toUpperCase(),
        }),
      });
      setAdmissionNumberPrefix(res.settings.admissionNumberPrefix);
      setAdmissionNumberFormat(res.settings.admissionNumberFormat);
      setAdmissionNextSeq(String(res.settings.admissionNextSeq));
      setApplicationRefPrefix(res.settings.applicationRefPrefix);
      showToast({
        variant: 'success',
        title: 'Settings saved',
        description: `Next auto-generated admission number: ${res.settings.previewAdmissionNumber}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save settings.';
      setError(msg);
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Settings & Numbering Formats"
        description="Configure tenant-wide admission number rules, sequence counters, and application reference prefixes."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Admission &amp; Application Identifier Rules</CardTitle>
            <CardDescription>
              Supported tokens: <code className="font-mono text-xs">{'{PREFIX}'}</code>,{' '}
              <code className="font-mono text-xs">{'{CODE}'}</code>,{' '}
              <code className="font-mono text-xs">{'{YEAR}'}</code>,{' '}
              <code className="font-mono text-xs">{'{SEQ}'}</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading school settings...</p>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="set-adm-prefix">Admission Number Prefix</Label>
                    <Input
                      id="set-adm-prefix"
                      required
                      maxLength={12}
                      value={admissionNumberPrefix}
                      onChange={(e) => setAdmissionNumberPrefix(e.target.value)}
                      placeholder="ADM"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="set-app-prefix">Admission Application Prefix</Label>
                    <Input
                      id="set-app-prefix"
                      required
                      maxLength={12}
                      value={applicationRefPrefix}
                      onChange={(e) => setApplicationRefPrefix(e.target.value)}
                      placeholder="APP"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="set-adm-format">Admission Number Template</Label>
                    <Input
                      id="set-adm-format"
                      required
                      maxLength={48}
                      value={admissionNumberFormat}
                      onChange={(e) => setAdmissionNumberFormat(e.target.value)}
                      placeholder="{PREFIX}/{YEAR}/{SEQ}"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="set-adm-seq">Next Sequence Number</Label>
                    <Input
                      id="set-adm-seq"
                      type="number"
                      min={1}
                      max={9999999}
                      required
                      value={admissionNextSeq}
                      onChange={(e) => setAdmissionNextSeq(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      '{PREFIX}/{YEAR}/{SEQ}',
                      '{CODE}-{YEAR}-{SEQ}',
                      '{PREFIX}-{SEQ}',
                    ].map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAdmissionNumberFormat(preset)}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live Format Preview</CardTitle>
              <CardDescription>Preview of the next auto-generated identifier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Next Admission Number</p>
                <p className="mt-1 font-mono text-lg font-bold text-[#1E3A8A] tabular-nums">
                  {livePreview}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Application Reference Pattern</p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#0F172A] tabular-nums">
                  {(applicationRefPrefix || 'APP').toUpperCase()}-{new Date().getUTCFullYear()}-0001
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🤖 Telegram Bot Integration</CardTitle>
              <CardDescription>
                Connect your Telegram Bot token to enable full portal management via chat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConfigureTelegram} className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-slate-700">Status:</p>
                  <p>
                    {telegramStatus?.bot_configured ? (
                      <span className="text-emerald-600 font-medium">✓ Connected (Bot: @{telegramStatus.bot_username})</span>
                    ) : (
                      <span className="text-amber-600 font-medium">⚠️ Not Configured</span>
                    )}
                  </p>
                  <p className="text-slate-500">Linked Accounts: {telegramStatus?.linked_accounts_count || 0}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="telegram-token-input">Telegram Bot Token</Label>
                  <Input
                    id="telegram-token-input"
                    type="password"
                    placeholder="e.g. 9211896050:AAG8gS..."
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-500">
                    Get your bot token from <span className="font-mono text-slate-700">@BotFather</span> on Telegram.
                  </p>
                </div>

                <Button type="submit" disabled={configuringTelegram || !telegramToken.trim()} className="w-full">
                  {configuringTelegram ? 'Connecting & Setting Webhook...' : 'Connect Bot & Set Webhook'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
