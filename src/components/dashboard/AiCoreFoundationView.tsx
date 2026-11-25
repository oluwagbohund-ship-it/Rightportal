import React from 'react';
import { Cpu, PauseCircle } from 'lucide-react';
import { Alert } from '../ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { AiAssistantCopilot } from './AiAssistantCopilot.tsx';
import type { AiCoreBlueprint } from '../../types/app.ts';

interface AiCoreFoundationViewProps {
  blueprint: AiCoreBlueprint | null;
  loading: boolean;
  error: string | null;
}

export function AiCoreFoundationView({
  blueprint,
  loading,
  error,
}: AiCoreFoundationViewProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">
          Loading DT AI CORE architecture specification...
        </CardContent>
      </Card>
    );
  }

  if (error || !blueprint) {
    return <Alert variant="error">{error ?? 'Unable to load DT AI CORE architecture.'}</Alert>;
  }

  return (
    <div className="space-y-6">
      <AiAssistantCopilot />

      <Alert variant="info" title={`${blueprint.engineName} — ${blueprint.architecturePhase}`}>
        AI inference, predictive scoring, and automated administrative generation are intentionally disabled in Phase 1. Module boundaries and permission gates are established here for Phase 2 and Phase 3 activation.
      </Alert>

      <div className="grid gap-5 md:grid-cols-2">
        {blueprint.modules.map((mod) => (
          <Card key={mod.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-mono">{mod.phaseTarget} · Scope: {mod.tenantScope}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Inactive</span>
                </span>
              </div>
              <CardTitle className="mt-1 flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <span>{mod.name}</span>
              </CardTitle>
              <CardDescription>{mod.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
              <p>
                <span className="font-semibold text-[#0F172A]">Permission Gate:</span>{' '}
                <span className="font-mono">{mod.requiredPermission}</span>
              </p>
              <p>
                <span className="font-semibold text-[#0F172A]">Data Dependencies:</span>{' '}
                {mod.dataDependencies.join(', ')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
