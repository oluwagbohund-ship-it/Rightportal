import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { BrandLoader } from '../brand/BrandLoader.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { getDashboardPathForRole } from '../../lib/utils.ts';
import type { AuthEnvironment, RoleCode } from '../../types/app.ts';

interface ProtectedRouteProps {
  environment: AuthEnvironment;
  allowedRoles: RoleCode[];
}

export function ProtectedRoute({ environment, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <BrandLoader fullScreen label="Verifying authenticated session..." />;
  }

  if (!user) {
    const loginTarget = environment === 'workers' ? '/login/workers' : '/login/school';
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="error">
              You must sign in to access this protected workspace.
            </Alert>
            <Link to={loginTarget} className="block">
              <Button type="button" className="w-full">
                Go to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user.authEnvironment !== environment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied (403)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="error">
              {environment === 'workers'
                ? 'School accounts are not authorized to access the DT Workers & Platform Owner console.'
                : 'Internal DT Workforce accounts cannot access tenant School Portal dashboards.'}
            </Alert>
            <Link to={getDashboardPathForRole(user.roleCode)} className="block">
              <Button type="button" className="w-full">
                Return to Your Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!allowedRoles.includes(user.roleCode)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Role Access Restricted (403)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="error">
              Your current role ({user.roleName}) does not have permission to view this route.
            </Alert>
            <Link to={getDashboardPathForRole(user.roleCode)} className="block">
              <Button type="button" className="w-full">
                Open Your Assigned Workspace
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
