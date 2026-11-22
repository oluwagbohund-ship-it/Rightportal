import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2 } from 'lucide-react';
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
import type { AcademicTermRecord, ExtendedAcademicSessionRecord } from '../../../types/app.ts';

export function TermsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ExtendedAcademicSessionRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);

  const [sessionId, setSessionId] = useState('');
  const [name, setName] = useState('Second Term');
  const [termOrder, setTermOrder] = useState('2');
  const [startDate, setStartDate] = useState('2027-01-11');
  const [endDate, setEndDate] = useState('2027-04-02');
  const [examStartDate, setExamStartDate] = useState('');
  const [examEndDate, setExamEndDate] = useState('');
  const [resultPublicationDate, setResultPublicationDate] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        sessions: ExtendedAcademicSessionRecord[];
        terms: AcademicTermRecord[];
      }>('/api/school/academics/sessions');
      setSessions(res.sessions ?? []);
      setTerms(res.terms ?? []);
      if (!sessionId && res.sessions?.length > 0) {
        setSessionId(res.sessions[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load academic terms.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setCreating(true);
    try {
      await apiRequest('/api/school/academics/terms', {
        method: 'POST',
        body: JSON.stringify({
          academicSessionId: sessionId,
          name,
          termOrder: Number(termOrder),
          startDate,
          endDate,
          examStartDate: examStartDate || undefined,
          examEndDate: examEndDate || undefined,
          resultPublicationDate: resultPublicationDate || undefined,
          status: 'active',
          isCurrent,
        }),
      });
      showToast({ variant: 'success', title: 'Academic term created' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Unable to create term',
        description: err instanceof Error ? err.message : 'Term validation failed.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (termId: string) => {
    setActingId(termId);
    try {
      await apiRequest(`/api/school/academics/terms/${termId}/activate`, { method: 'PATCH' });
      showToast({ variant: 'success', title: 'Active school term updated' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Activation failed',
        description: err instanceof Error ? err.message : 'Unable to activate term.',
      });
    } finally {
      setActingId(null);
    }
  };

  const handleUpdateStatus = async (termId: string, status: 'active' | 'closed' | 'archived') => {
    setActingId(termId);
    try {
      await apiRequest(`/api/school/academics/terms/${termId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast({ variant: 'success', title: `Term marked ${status}` });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update term.',
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Terms Management"
        description="Configure term boundaries, examination windows, target result publication dates, and active institutional term."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Configured Terms ({terms.length})</span>
            </CardTitle>
            <CardDescription>Closing or archiving a term locks score editing for completed periods</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading terms...</p>
            ) : terms.length === 0 ? (
              <p className="text-sm text-slate-500">No terms created yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session / Term</TableHead>
                    <TableHead>Term Dates</TableHead>
                    <TableHead>Exam Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <p className="font-semibold text-[#0F172A]">
                          {t.name}
                          {t.is_current === 1 ? ' · Active' : ''}
                        </p>
                        <p className="text-xs text-slate-500">{t.session_name}</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {t.start_date} → {t.end_date}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {t.exam_start_date && t.exam_end_date
                          ? `${t.exam_start_date} → ${t.exam_end_date}`
                          : 'Not scheduled'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                        {t.status}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {t.is_current !== 1 && t.status !== 'archived' ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={actingId === t.id}
                              onClick={() => void handleActivate(t.id)}
                            >
                              Set Active
                            </Button>
                          ) : null}
                          {t.status === 'active' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={actingId === t.id}
                              onClick={() => void handleUpdateStatus(t.id, 'closed')}
                            >
                              Close
                            </Button>
                          ) : t.status === 'closed' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={actingId === t.id}
                              onClick={() => void handleUpdateStatus(t.id, 'active')}
                            >
                              Reopen
                            </Button>
                          ) : null}
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
            <CardTitle>Create Term</CardTitle>
            <CardDescription>Attach a new term to an existing academic session</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTerm} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="tm-sess">Academic Session</Label>
                <Select
                  id="tm-sess"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  required
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="tm-name">Term Name</Label>
                  <Input
                    id="tm-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-order">Order</Label>
                  <Input
                    id="tm-order"
                    type="number"
                    min={1}
                    max={12}
                    value={termOrder}
                    onChange={(e) => setTermOrder(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tm-start">Start Date</Label>
                  <Input
                    id="tm-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-end">End Date</Label>
                  <Input
                    id="tm-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tm-ex-start">Exam Start (opt.)</Label>
                  <Input
                    id="tm-ex-start"
                    type="date"
                    value={examStartDate}
                    onChange={(e) => setExamStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-ex-end">Exam End (opt.)</Label>
                  <Input
                    id="tm-ex-end"
                    type="date"
                    value={examEndDate}
                    onChange={(e) => setExamEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm-pub-date">Planned Result Date (opt.)</Label>
                <Input
                  id="tm-pub-date"
                  type="date"
                  value={resultPublicationDate}
                  onChange={(e) => setResultPublicationDate(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                />
                <span>Set immediately as current active term</span>
              </label>
              <Button type="submit" disabled={creating || !sessionId} className="w-full">
                {creating ? 'Creating Term...' : 'Create Academic Term'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
