import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicEventRecord,
  AcademicTermRecord,
  ExtendedAcademicSessionRecord,
} from '../../../types/app.ts';

export function AcademicSessionDetailsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ExtendedAcademicSessionRecord | null>(null);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [events, setEvents] = useState<AcademicEventRecord[]>([]);

  const [termName, setTermName] = useState('First Term');
  const [termOrder, setTermOrder] = useState('1');
  const [termStart, setTermStart] = useState('2026-09-07');
  const [termEnd, setTermEnd] = useState('2026-12-18');
  const [creatingTerm, setCreatingTerm] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        session: ExtendedAcademicSessionRecord;
        terms: AcademicTermRecord[];
        events: AcademicEventRecord[];
      }>(`/api/school/academics/sessions/${sessionId}`);
      setSession(res.session);
      setTerms(res.terms ?? []);
      setEvents(res.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load academic session details.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setCreatingTerm(true);
    try {
      await apiRequest('/api/school/academics/terms', {
        method: 'POST',
        body: JSON.stringify({
          academicSessionId: sessionId,
          name: termName,
          termOrder: Number(termOrder),
          startDate: termStart,
          endDate: termEnd,
          status: 'active',
          isCurrent: terms.length === 0,
        }),
      });
      showToast({ variant: 'success', title: 'Academic term added to session' });
      await loadDetails();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Failed to create term',
        description: err instanceof Error ? err.message : 'Unable to add term.',
      });
    } finally {
      setCreatingTerm(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={session ? `${session.name} — Session Workspace` : 'Session Details'}
        description="View terms, examination timelines, and calendar events scoped to this academic session."
        actions={
          <Link to="/dashboard/school-admin/academics/sessions">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>All Sessions</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !session ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading session details...' : 'Session not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Session Name</p>
                <p className="font-bold text-[#0F172A]">{session.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Lifecycle Status</p>
                <p className="font-semibold uppercase text-[#1E3A8A]">{session.status}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Start Date</p>
                <p className="font-medium tabular-nums">{session.start_date}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">End Date</p>
                <p className="font-medium tabular-nums">{session.end_date}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Terms Inside {session.name} ({terms.length})</CardTitle>
                <CardDescription>Each academic term governs continuous assessments and result publications</CardDescription>
              </CardHeader>
              <CardContent>
                {terms.length === 0 ? (
                  <p className="text-sm text-slate-500">No terms defined yet inside this session.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Term Name</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {terms.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="tabular-nums font-mono text-xs">{t.term_order}</TableCell>
                          <TableCell className="font-semibold text-[#0F172A]">
                            {t.name}
                            {t.is_current === 1 ? ' (Current)' : ''}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-slate-600">
                            {t.start_date} → {t.end_date}
                          </TableCell>
                          <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                            {t.status}
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
                <CardTitle>Add Term to Session</CardTitle>
                <CardDescription>Prevented automatically from overlapping existing terms</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddTerm} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="td-name">Term Name</Label>
                    <Input
                      id="td-name"
                      value={termName}
                      onChange={(e) => setTermName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="td-order">Sequence Order</Label>
                    <Input
                      id="td-order"
                      type="number"
                      min={1}
                      max={12}
                      value={termOrder}
                      onChange={(e) => setTermOrder(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="td-start">Start</Label>
                      <Input
                        id="td-start"
                        type="date"
                        value={termStart}
                        onChange={(e) => setTermStart(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="td-end">End</Label>
                      <Input
                        id="td-end"
                        type="date"
                        value={termEnd}
                        onChange={(e) => setTermEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={creatingTerm} className="w-full">
                    {creatingTerm ? 'Adding Term...' : 'Add Term'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Session Calendar Events ({events.length})</CardTitle>
                <CardDescription>Events linked to {session.name}</CardDescription>
              </div>
              <Link to="/dashboard/school-admin/academics/calendar">
                <Button type="button" size="sm" variant="outline">
                  Manage Calendar
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No academic events linked to this session yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="font-medium text-[#0F172A]">{ev.title}</TableCell>
                        <TableCell className="text-xs capitalize text-slate-600">
                          {ev.event_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-600">
                          {ev.start_date} → {ev.end_date}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{ev.description || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
