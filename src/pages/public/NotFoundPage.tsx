import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { Button } from '../../components/ui/button.tsx';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center space-y-4">
      <div className="flex justify-center">
        <Logo variant="app-icon" size="lg" />
      </div>
      <p className="text-xs font-mono text-slate-500">404 · Route Not Found</p>
      <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">Page Not Found</h1>
      <p className="text-sm text-slate-600">
        The requested route does not exist on Dave Timi EdTech Systems.
      </p>
      <div className="pt-2">
        <Link to="/">
          <Button type="button">Return to Homepage</Button>
        </Link>
      </div>
    </div>
  );
}
