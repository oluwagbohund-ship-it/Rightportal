import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Trash2 } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicEventRecord,
  AcademicEventType,
  AcademicTermRecord,
  ExtendedAcademicSessionRecord,
} from '../../../types/app.ts';

export function AcademicCalendarPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AcademicEventRecord[]>([]);
  const [sessions, setSessions] = useState<ExtendedAcademicSessionRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [filterType, setFilterType] = useState<string>('all');

  // Create form
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<AcademicEventType>('school_activity');
  const [sessionId, setSessionId] = useState('');
  const [termId, setTermId] = useState('');
  const [startDate, setStartDate] = useState('2026-10-12');
  const [endDate, setEndDate] = useState('2026-10-12');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<AcademicEventRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evRes, sessRes] = await Promise.all([
        apiRequest<{ events: AcademicEventRecord[] }>('/api/school/academics/events'),
        apiRequest<{ sessions: ExtendedAcademicSessionRecord[]; terms: AcademicTermRecord[] }>(
          '/api/school/academics/sessions',
        ),
      ]);
      setEvents(evRes.events ?? []);
      setSessions(sessRes.sessions ?? []);
      setTerms(sessRes.terms ?? []);
      if (!sessionId && sessRes.sessions?.length > 0) {
        setSessionId(sessRes.sessions[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load academic calendar.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest('/api/school/academics/events', {
        method: 'POST',
        body: JSON.stringify({
          academicSessionId: sessionId || null,
          academicTermId: termId || null,
          title,
          eventType,
          startDate,
          endDate,
          description,
        }),
      });
      setTitle('');
      setDescription('');
      showToast({ variant: 'success', title: 'Academic calendar event added' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Unable to save event',
        description: err instanceof Error ? err.message : 'Validation failed.',
      });
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/school/academics/events/${pendingDelete.id}`, {
        method: 'DELETE',
      });
      showToast({ variant: 'success', title: 'Calendar event removed' });
      setPendingDelete(null);
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to remove event.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const filteredEvents =
    filterType === 'all' ? events : events.filter((ev) => ev.event_type === filterType);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Institutional Academic Calendar"
        description="Manage resumption dates, holidays, mid-term breaks, continuous assessments, examination windows, and school closing activities."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <span>Scheduled Calendar Events ({filteredEvents.length})</span>
              </CardTitle>
              <CardDescription>Visible to teachers, students, and parents across your school</CardDescription>
            </div>
            <div className="w-full sm:w-52">
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All Event Categories</option>
                <option value="resumption">Resumption</option>
                <option value="holiday">Public / School Holiday</option>
                <option value="midterm_break">Mid-term Break</option>
                <option value="assessment">Continuous Assessment</option>
                <option value="examination">Examination Period</option>
                <option value="closing">Term Closing</option>
                <option value="school_activity">School Activity</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading academic calendar...</p>
            ) : filteredEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No academic events match the selected filter.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date Window</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>
                        <p className="font-semibold text-[#0F172A]">{ev.title}</p>
                        {ev.description ? (
                          <p className="text-xs text-slate-500">{ev.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs capitalize text-[#1E3A8A] font-medium">
                        {ev.event_type.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {ev.start_date === ev.end_date
                          ? ev.start_date
                          : `${ev.start_date} → ${ev.end_date}`}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {[ev.session_name, ev.term_name].filter(Boolean).join(' · ') || 'General'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setPendingDelete(ev)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
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
            <CardTitle>Add Calendar Event</CardTitle>
            <CardDescription>Publish an institutional academic milestone</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="ev-title">Event Title</Label>
                <Input
                  id="ev-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="First Continuous Assessment Week"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-type">Category</Label>
                <Select
                  id="ev-type"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as AcademicEventType)}
                >
                  <option value="resumption">Resumption</option>
                  <option value="holiday">Holiday</option>
                  <option value="midterm_break">Mid-term Break</option>
                  <option value="assessment">Assessment</option>
                  <option value="examination">Examination</option>
                  <option value="closing">Closing</option>
                  <option value="school_activity">School Activity</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-sess">Session (optional)</Label>
                <Select id="ev-sess" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  <option value="">All / Unlinked</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-term">Term (optional)</Label>
                <Select id="ev-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
                  <option value="">All Terms</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.session_name} · {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-start">Start Date</Label>
                  <Input
                    id="ev-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-end">End Date</Label>
                  <Input
                    id="ev-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-desc">Description (optional)</Label>
                <Input
                  id="ev-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Schedule instructions or notice"
                />
              </div>
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Publishing Event...' : 'Publish Calendar Event'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Calendar Event"
        description={`Remove "${pendingDelete?.title ?? ''}" from the school academic calendar?`}
        confirmLabel="Remove Event"
        destructive
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
