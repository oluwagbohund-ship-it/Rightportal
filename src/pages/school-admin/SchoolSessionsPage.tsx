import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Select } from '../../components/ui/select.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord } from '../../types/app.ts';

export function SchoolSessionsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AcademicSessionRecord[]>([]);

  const [sesName, setSesName] = useState('2026/2027 Academic Session');
  const [sesTerm, setSesTerm] = useState<'First Term' | 'Second Term' | 'Third Term' | 'Annual'>(
    'First Term',
  );
  const [sesStart, setSesStart] = useState('2026-09-14');
  const [sesEnd, setSesEnd] = useState('2026-12-18');
  const [sesCurrent, setSesCurrent] = useState(true);
  const [sesSaving, setSesSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ sessions: AcademicSessionRecord[] }>('/api/school/sessions')
      .then((res) => {
        if (!active) return;
        setSessions(res.sessions);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load academic sessions.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setSesSaving(true);
    try {
      await apiRequest('/api/school/sessions', {
        method: 'POST',
        body: JSON.stringify({
          name: sesName,
          term: sesTerm,
          startDate: sesStart,
          endDate: sesEnd,
          isCurrent: sesCurrent,
        }),
      });
      setActionMsg('Academic session created.');
      const res = await apiRequest<{ sessions: AcademicSessionRecord[] }>('/api/school/sessions');
      setSessions(res.sessions);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to create session.');
    } finally {
      setSesSaving(false);
    }
  };

  const handleActivateSession = async (sessionId: string) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiRequest(`/api/school/sessions/${sessionId}/activate`, { method: 'PATCH' });
      const res = await apiRequest<{ sessions: AcademicSessionRecord[] }>('/api/school/sessions');
      setSessions(res.sessions);
      setActionMsg('Active academic session updated.');
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to activate session.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Sessions"
        description="Define academic calendars and designate the active current term strictly within your school tenant."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Create Academic Session</CardTitle>
            <CardDescription>
              Define academic terms strictly within {user?.activeSchoolName ?? 'your school'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleCreateSession(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ses-name">Session Name</Label>
                <Input
                  id="ses-name"
                  required
                  value={sesName}
                  onChange={(e) => setSesName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ses-term">Term</Label>
                <Select
                  id="ses-term"
                  value={sesTerm}
                  onChange={(e) =>
                    setSesTerm(
                      e.target.value as 'First Term' | 'Second Term' | 'Third Term' | 'Annual',
                    )
                  }
                >
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                  <option value="Annual">Annual</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ses-start">Start Date</Label>
                  <Input
                    id="ses-start"
                    type="date"
                    required
                    value={sesStart}
                    onChange={(e) => setSesStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ses-end">End Date</Label>
                  <Input
                    id="ses-end"
                    type="date"
                    required
                    value={sesEnd}
                    onChange={(e) => setSesEnd(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sesCurrent}
                  onChange={(e) => setSesCurrent(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Set as active current term</span>
              </label>
              <Button type="submit" disabled={sesSaving} className="w-full">
                {sesSaving ? 'Creating Session...' : 'Add Academic Session'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Configured Sessions</CardTitle>
            <CardDescription>
              Academic terms registered for {user?.activeSchoolName ?? 'this tenant'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading academic sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-slate-500">No academic sessions created yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs">{s.term}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {s.start_date} → {s.end_date}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {s.is_current === 1 ? 'Current' : 'Inactive'}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.is_current !== 1 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleActivateSession(s.id)}
                          >
                            Set Active
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">Active</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
