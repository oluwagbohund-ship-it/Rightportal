import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AcademicTermRecord, SchoolClassRecord } from '../../../types/app.ts';

interface BroadsheetPayload {
  school: { name: string; code: string };
  term: { id: string; term_name: string; session_name: string };
  classRow: { id: string; name: string };
  subjects: Array<{ id: string; code: string; name: string }>;
  rows: Array<{
    student_id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    arm_name: string | null;
    subjects_count: number;
    subjects_passed: number;
    total_score_obtained: number;
    average_score: number;
    overall_grade: string;
    class_position: number | null;
    status: string;
    subjectScores: Record<string, { score: number; grade: string }>;
  }>;
}

export function BroadsheetsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [broadsheet, setBroadsheet] = useState<BroadsheetPayload | null>(null);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, clsRes] = await Promise.all([
        apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      ]);
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');
      setTerms(loadedTerms);
      setClasses(loadedClasses);
      if (!termId && loadedTerms.length > 0) {
        const cur = loadedTerms.find((t) => t.is_current === 1) ?? loadedTerms[0];
        setTermId(cur.id);
      }
      if (!classId && loadedClasses.length > 0) setClassId(loadedClasses[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load broadsheet options.');
    } finally {
      setLoading(false);
    }
  }, [classId, termId]);

  const loadBroadsheet = useCallback(async () => {
    if (!termId || !classId) {
      setBroadsheet(null);
      return;
    }
    try {
      const res = await apiRequest<BroadsheetPayload>(
        `/api/school/academics/broadsheet?academicTermId=${termId}&classId=${classId}`,
      );
      setBroadsheet(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate broadsheet.');
    }
  }, [classId, termId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadBroadsheet();
  }, [loadBroadsheet]);

  const csvUrl = `/api/school/academics/broadsheet/export.csv?academicTermId=${termId}&classId=${classId}`;
  const pdfUrl = `/api/school/academics/broadsheet/export.pdf?academicTermId=${termId}&classId=${classId}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Class Broadsheets"
        description="Cross-subject master ranking matrix with automated CSV spreadsheet export, PDF print sheets, and position totals."
        actions={
          termId && classId && broadsheet && broadsheet.rows.length > 0 ? (
            <div className="no-print flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                <span>Print Broadsheet</span>
              </Button>
              <a href={csvUrl} download>
                <Button type="button" size="sm" variant="outline">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Export CSV</span>
                </Button>
              </a>
              <a href={pdfUrl} download>
                <Button type="button" size="sm">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Export PDF</span>
                </Button>
              </a>
            </div>
          ) : null
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card className="no-print">
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bs-term">Academic Term</Label>
            <Select id="bs-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.session_name} · {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bs-cls">Class</Label>
            <Select id="bs-cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="print-sheet">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>
              {broadsheet
                ? `${broadsheet.school.name} — ${broadsheet.classRow.name} (${broadsheet.term.session_name} · ${broadsheet.term.term_name})`
                : 'Broadsheet Matrix'}
            </span>
          </CardTitle>
          <CardDescription>
            {broadsheet
              ? `${broadsheet.rows.length} student(s) ranked across ${broadsheet.subjects.length} subject(s)`
              : 'Select term and class to inspect the broadsheet'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading broadsheet...</p>
          ) : !broadsheet || broadsheet.rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              No computed results exist for this class and term yet. Compute class results first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#0F172A] text-white">
                    <th className="px-2.5 py-2 font-semibold tabular-nums">Pos</th>
                    <th className="px-2.5 py-2 font-semibold">Admission No</th>
                    <th className="px-2.5 py-2 font-semibold">Student Name</th>
                    {broadsheet.subjects.map((sub) => (
                      <th key={sub.id} className="px-2.5 py-2 font-semibold text-center" title={sub.name}>
                        {sub.code}
                      </th>
                    ))}
                    <th className="px-2.5 py-2 font-semibold text-right tabular-nums">Avg (%)</th>
                    <th className="px-2.5 py-2 font-semibold text-center">Grade</th>
                    <th className="px-2.5 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border border-slate-200">
                  {broadsheet.rows.map((row) => (
                    <tr key={row.student_id} className="hover:bg-slate-50">
                      <td className="px-2.5 py-2 font-bold tabular-nums text-[#1E3A8A]">
                        {row.class_position ?? '—'}
                      </td>
                      <td className="px-2.5 py-2 font-mono">{row.admission_number}</td>
                      <td className="px-2.5 py-2 font-semibold text-[#0F172A] whitespace-nowrap">
                        {row.first_name} {row.last_name}
                      </td>
                      {broadsheet.subjects.map((sub) => {
                        const cell = row.subjectScores[sub.id];
                        return (
                          <td key={sub.id} className="px-2.5 py-2 text-center tabular-nums">
                            {cell ? (
                              <span>
                                {cell.score}{' '}
                                <span className="text-[10px] font-semibold text-[#1E3A8A]">
                                  {cell.grade}
                                </span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-2 text-right font-bold tabular-nums text-[#0F172A]">
                        {row.average_score}%
                      </td>
                      <td className="px-2.5 py-2 text-center font-bold text-[#1E3A8A]">
                        {row.overall_grade}
                      </td>
                      <td className="px-2.5 py-2 uppercase font-semibold text-slate-600">
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
