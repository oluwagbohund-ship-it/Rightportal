import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';

export function AboutPage() {
  const [imgFailed, setImgFailed] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 space-y-14">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-6 space-y-5 flex flex-col justify-center">
          <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
            About Dave Timi EdTech Systems
          </p>
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A]"
            style={{ textWrap: 'balance' }}
          >
            Engineering dependable software infrastructure for schools.
          </h1>
          <p className="text-slate-600 leading-relaxed">
            Dave Timi EdTech Systems was conceived and architected by David Oluwagbohun around a clear mandate: Build • Innovate • Transform. Rather than stitching together disconnected spreadsheets and fragile portals, schools deserve a unified operating foundation that treats security, data ownership, and institutional clarity as first-class primitives.
          </p>
          <p className="text-slate-600 leading-relaxed">
            Phase 1 establishes the multi-tenant core—authentication boundaries, role-based access control, school onboarding, academic session governance, audit logging, and the modular DT AI CORE blueprint—so every subsequent academic module stands on verified production architecture.
          </p>
          <div className="pt-2">
            <Button type="button" onClick={() => navigate('/register')}>
              Onboard Your School
            </Button>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="h-72 sm:h-96 lg:h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
            {!imgFailed ? (
              <img
                src="/src/assets/images/about_architecture_systems_1795306658803.jpg"
                alt="Institutional systems architecture studio"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-8 text-white">
                <p className="text-sm font-medium">Dave Timi EdTech Architecture</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <p className="text-xs font-mono text-slate-500">01. Build</p>
            <CardTitle>Verified Foundations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 leading-relaxed">
            Strict TypeScript, relational constraints, parameterized queries, and verifiable session authorization before any surface feature ships.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-mono text-slate-500">02. Innovate</p>
            <CardTitle>Structured Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 leading-relaxed">
            DT AI CORE is architected as a modular, tenant-respecting analytical layer ready to activate once live classroom datasets are connected.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-mono text-slate-500">03. Transform</p>
            <CardTitle>Institutional Clarity</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 leading-relaxed">
            Role-specific dashboards eliminate interface noise for School Administrators, Teachers, Students, and Parents across desktop and Android devices.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
