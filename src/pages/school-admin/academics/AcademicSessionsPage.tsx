import React, { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Eye, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ExtendedAcademicSessionRecord, SchoolAcademicSettingsRecord } from '../../../types/app.ts';

export function AcademicSessionsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ExtendedAcademicSessionRecord[]>([]);
  const [settings, setSettings] = useState<SchoolAcademicSettingsRecord | null>(null);

  // Create session form
  const [name, setName] = useState('2026/2027');
  const [term, setTerm] = useState<'First Term' | 'Second Term' | 'Third Term' | 'Annual'>('First Term');
  const [startDate, setStartDate] = useState('2026-09-07');
  const [endDate, setEndDate] = useState('2027-07-16');
  const [isCurrent, setIsCurrent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        sessions: ExtendedAcademicSessionRecord[];
        settings: SchoolAcademicSettingsRecord;
      }>('/api/school/academics/sessions');
      setSessions(res.sessions ?? []);
      setSettings(res.settings ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load academic sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest('/api/school/sessions', {
        method: 'POST',
        body: JSON.stringify({ name, term, startDate, endDate, isCurrent }),
      });
      showToast({ variant: 'success', title: 'Academic session created' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Creation failed',
        description: err instanceof Error ? err.message : 'Unable to create session.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (sessionId: string) => {
    setActingId(sessionId);
    try {
      await apiRequest(`/api/school/sessions/${sessionId}/activate`, { method: 'PATCH' });
      showToast({ variant: 'success', title: 'Current academic session updated' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Activation failed',
        description: err instanceof Error ? err.message : 'Unable to activate session.',
      });
    } finally {
      setActingId(null);
    }
  };

  const handleLifecycleChange = async (sessionId: string, status: 'active' | 'closed' | 'archived') => {
    setActingId(sessionId);
    try {
      await apiRequest(`/api/school/academics/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast({ variant: 'success', title: `Session marked ${status}` });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Lifecycle update failed',
        description: err instanceof Error ? err.message : 'Unable to update session lifecycle.',
      });
    } finally {
      setActingId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    try {
      await apiRequest('/api/school/academics/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sessionNamingConvention: settings.session_naming_convention,
          termNamingConvention: settings.term_naming_convention,
          defaultTermsPerSession: Number(settings.default_terms_per_session),
          allowOverlappingSessions: settings.allow_overlapping_sessions === 1,
          allowOverlappingTerms: settings.allow_overlapping_terms === 1,
          scoreRoundingMode: settings.score_rounding_mode,
          tieRankingMode: settings.tie_ranking_mode,
          missingScorePolicy: settings.missing_score_policy,
          promotionMinAverage: Number(settings.promotion_min_average),
          promotionMinPassSubjects: Number(settings.promotion_min_pass_subjects),
        }),
      });
      showToast({ variant: 'success', title: 'Academic computation & promotion policies saved' });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Sessions & Institutional Policy"
        description="Manage school academic years, lifecycle states (active, closed, archived), overlap guards, score rounding rules, and promotion criteria."
        actions={
          <Link to="/dashboard/school-admin/academics/terms">
            <Button type="button" size="sm" variant="outline">
              Manage Terms
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Academic Sessions ({sessions.length})</span>
            </CardTitle>
            <CardDescription>Click View to manage terms and calendar events inside a session</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading academic sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-slate-500">No academic sessions configured yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Date Span</TableHead>
                    <TableHead>Terms / Events</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-semibold text-[#0F172A]">{s.name}</p>
                        <p className="text-xs text-slate-500">
                          {s.term}
                          {s.is_current === 1 ? ' · Current Active' : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {s.start_date} → {s.end_date}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {s.terms_count ?? 0} term(s) · {s.events_count ?? 0} event(s)
                      </TableCell>
                      <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                        {s.status}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Link to={`/dashboard/school-admin/academics/sessions/${s.id}`}>
                            <Button type="button" size="sm" variant="outline">
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Open</span>
                            </Button>
                          </Link>
                          {s.is_current !== 1 && s.status === 'active' ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={actingId === s.id}
                              onClick={() => void handleActivate(s.id)}
                            >
                              Set Current
                            </Button>
                          ) : null}
                          {s.status === 'active' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={actingId === s.id}
                              onClick={() => void handleLifecycleChange(s.id, 'closed')}
                            >
                              Close
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={actingId === s.id}
                              onClick={() => void handleLifecycleChange(s.id, 'active')}
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create New Session</CardTitle>
            <CardDescription>Open a new school year</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sess-name">Session Name</Label>
                <Input
                  id="sess-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="2026/2027"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sess-term">Primary Term Scope</Label>
                <Select
                  id="sess-term"
                  value={term}
                  onChange={(e) => setTerm(e.target.value as typeof term)}
                >
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                  <option value="Annual">Annual</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sess-start">Start Date</Label>
                  <Input
                    id="sess-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sess-end">End Date</Label>
                  <Input
                    id="sess-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                />
                <span>Set as current active session</span>
              </label>
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Creating Session...' : 'Create Academic Session'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Institutional Academic Policy Settings */}
      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Academic Computation &amp; Promotion Policy</span>
            </CardTitle>
            <CardDescription>
              School-wide defaults controlling result computation, tie ranking, overlap validation, and promotion thresholds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="pol-round">Score Rounding Rule</Label>
                <Select
                  id="pol-round"
                  value={settings.score_rounding_mode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      score_rounding_mode: e.target.value as SchoolAcademicSettingsRecord['score_rounding_mode'],
                    })
                  }
                >
                  <option value="two_decimals">Two Decimal Places (e.g. 74.67)</option>
                  <option value="one_decimal">One Decimal Place (e.g. 74.7)</option>
                  <option value="nearest_whole">Nearest Whole Number (e.g. 75)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pol-rank">Tie Ranking Rule</Label>
                <Select
                  id="pol-rank"
                  value={settings.tie_ranking_mode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tie_ranking_mode: e.target.value as SchoolAcademicSettingsRecord['tie_ranking_mode'],
                    })
                  }
                >
                  <option value="standard_competition">Standard Competition (1, 1, 3)</option>
                  <option value="dense">Dense Ranking (1, 1, 2)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pol-missing">Pending / Unscored Component Policy</Label>
                <Select
                  id="pol-missing"
                  value={settings.missing_score_policy}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      missing_score_policy: e.target.value as SchoolAcademicSettingsRecord['missing_score_policy'],
                    })
                  }
                >
                  <option value="exclude_from_weight">Re-normalize across entered weights</option>
                  <option value="treat_pending_as_zero_on_compute">Treat missing component as 0 on compute</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pol-prom-avg">Promotion Minimum Average (%)</Label>
                <Input
                  id="pol-prom-avg"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={settings.promotion_min_average}
                  onChange={(e) =>
                    setSettings({ ...settings, promotion_min_average: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pol-prom-pass">Minimum Passing Subjects Required</Label>
                <Input
                  id="pol-prom-pass"
                  type="number"
                  min={0}
                  max={30}
                  value={settings.promotion_min_pass_subjects}
                  onChange={(e) =>
                    setSettings({ ...settings, promotion_min_pass_subjects: Number(e.target.value) })
                  }
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.allow_overlapping_sessions === 1}
                    onChange={(e) =>
                      setSettings({ ...settings, allow_overlapping_sessions: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Allow overlapping session dates</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.allow_overlapping_terms === 1}
                    onChange={(e) =>
                      setSettings({ ...settings, allow_overlapping_terms: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Allow overlapping term dates</span>
                </label>
              </div>

              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <Button type="submit" disabled={savingSettings}>
                  {savingSettings ? 'Saving Policies...' : 'Save Academic Policy Settings'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
