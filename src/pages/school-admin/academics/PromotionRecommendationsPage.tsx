import React, { useCallback, useEffect, useState } from 'react';
import { Check, TrendingUp, X } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicTermRecord,
  ExtendedAcademicSessionRecord,
  PromotionRecommendationRecord,
  SchoolClassRecord,
} from '../../../types/app.ts';

export function PromotionRecommendationsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ExtendedAcademicSessionRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [recommendations, setRecommendations] = useState<PromotionRecommendationRecord[]>([]);

  const [sessionId, setSessionId] = useState('');
  const [termId, setTermId] = useState('');
  const [fromClassId, setFromClassId] = useState('');
  const [targetToClassId, setTargetToClassId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, clsRes] = await Promise.all([
        apiRequest<{ sessions: ExtendedAcademicSessionRecord[]; terms: AcademicTermRecord[] }>(
          '/api/school/academics/sessions',
        ),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      ]);
      const loadedSessions = sessRes.sessions ?? [];
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');

      setSessions(loadedSessions);
      setTerms(loadedTerms);
      setClasses(loadedClasses);

      if (!sessionId && loadedSessions.length > 0) {
        const cur = loadedSessions.find((s) => s.is_current === 1) ?? loadedSessions[0];
        setSessionId(cur.id);
      }
      if (!fromClassId && loadedClasses.length > 0) {
        setFromClassId(loadedClasses[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load promotion setup.');
    } finally {
      setLoading(false);
    }
  }, [fromClassId, sessionId]);

  const loadRecommendations = useCallback(async () => {
    try {
      const qs = sessionId ? `?academicSessionId=${sessionId}` : '';
      const res = await apiRequest<{ recommendations: PromotionRecommendationRecord[] }>(
        `/api/school/academics/promotions/recommendations${qs}`,
      );
      setRecommendations(res.recommendations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load promotion recommendations.');
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !fromClassId) return;
    setGenerating(true);
    try {
      const res = await apiRequest<{ generated: number }>(
        '/api/school/academics/promotions/recommendations/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            academicSessionId: sessionId,
            academicTermId: termId || null,
            fromClassId,
            targetToClassId: targetToClassId || null,
          }),
        },
      );
      showToast({
        variant: 'success',
        title: 'Promotion recommendations generated',
        description: `Evaluated ${res.generated} student(s). Class placements remain unchanged until you approve.`,
      });
      await loadRecommendations();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Generation failed',
        description: err instanceof Error ? err.message : 'Unable to evaluate class.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDecision = async (
    rec: PromotionRecommendationRecord,
    decision: 'approved' | 'rejected',
  ) => {
    setDecidingId(rec.id);
    try {
      await apiRequest(`/api/school/academics/promotions/recommendations/${rec.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          toClassId: rec.recommended_to_class_id || targetToClassId || null,
          notes:
            decision === 'approved'
              ? `Explicitly approved by School Admin (${rec.recommendation})`
              : 'Deferred by School Admin',
        }),
      });
      showToast({
        variant: 'success',
        title:
          decision === 'approved'
            ? 'Student placement & promotion history updated'
            : 'Recommendation rejected / deferred',
      });
      await loadRecommendations();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Decision failed',
        description: err instanceof Error ? err.message : 'Unable to apply decision.',
      });
    } finally {
      setDecidingId(null);
    }
  };

  const sessionTerms = terms.filter((t) => !sessionId || t.academic_session_id === sessionId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Promotion & Progression Recommendations"
        description="Generate rules-based end-of-year promotion evaluations. Students are never auto-promoted until a School Administrator explicitly approves."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Generate Class Promotion Recommendations</span>
          </CardTitle>
          <CardDescription>
            Evaluates computed averages and subject pass counts against school academic promotion policy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pr-sess">Academic Session</Label>
              <Select id="pr-sess" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-term">Term Filter (opt.)</Label>
              <Select id="pr-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
                <option value="">All Terms in Session</option>
                {sessionTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-from">Source Class</Label>
              <Select
                id="pr-from"
                value={fromClassId}
                onChange={(e) => setFromClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-to">Destination Class (opt.)</Label>
              <Select
                id="pr-to"
                value={targetToClassId}
                onChange={(e) => setTargetToClassId(e.target.value)}
              >
                <option value="">Auto-detect Next Level</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={generating || !sessionId || !fromClassId}>
              {generating ? 'Evaluating...' : 'Generate Evaluation'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promotion Recommendations Ledger ({recommendations.length})</CardTitle>
          <CardDescription>
            Approving writes an immutable record to student class history and updates active student placement
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading promotion recommendations...</p>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-slate-500">
              No promotion evaluations generated for this session yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>From → Recommended To</TableHead>
                  <TableHead className="text-right tabular-nums">Avg / Passed</TableHead>
                  <TableHead>Engine Recommendation</TableHead>
                  <TableHead>Approval Status</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>
                      <p className="font-semibold text-[#0F172A]">
                        {rec.first_name} {rec.last_name}
                      </p>
                      <p className="font-mono text-xs text-slate-500">{rec.admission_number}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {rec.from_class_name} →{' '}
                      <strong className="text-[#1E3A8A]">
                        {rec.recommended_to_class_name || 'Specify Target'}
                      </strong>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <strong>{rec.average_score}%</strong> · {rec.subjects_passed}/{rec.subjects_total}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-semibold capitalize text-[#0F172A]">
                        {rec.recommendation.replace('_', ' ')}
                      </p>
                      <p className="text-slate-500">{rec.recommendation_reason}</p>
                    </TableCell>
                    <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                      {rec.approval_status}
                    </TableCell>
                    <TableCell className="text-right">
                      {rec.approval_status === 'pending' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            disabled={decidingId === rec.id}
                            onClick={() => void handleDecision(rec, 'approved')}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Approve</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={decidingId === rec.id}
                            onClick={() => void handleDecision(rec, 'rejected')}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Reject</span>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {rec.decided_at ? rec.decided_at.slice(0, 10) : 'Decided'}
                        </span>
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
  );
}
