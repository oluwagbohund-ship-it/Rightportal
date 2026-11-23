import type { NextFunction, Request, Response } from 'express';
import { recordAuditLog } from './audit.ts';
import {
  buildSessionCookieHeader,
  hasPermission,
  isOriginTrusted,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
} from './security.ts';
import { resolveSessionWithMetadata, rotateSessionToken } from './session-service.ts';
import type { AuthContextUser, AuthEnvironment } from './types.ts';

export interface AuthenticatedRequest extends Request {
  auth?: AuthContextUser;
  sessionId?: string;
}

export function isRequestHttps(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https') {
    return true;
  }
  return req.secure;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? '';
  }
  return req.ip ?? '';
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
}

export function requireCsrfCheck(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  const ok = isOriginTrusted({
    originHeader: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    hostHeader: typeof req.headers.host === 'string' ? req.headers.host : undefined,
    forwardedHostHeader:
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host']
        : undefined,
    requestedWithHeader:
      typeof req.headers['x-requested-with'] === 'string'
        ? req.headers['x-requested-with']
        : undefined,
  });

  if (!ok) {
    res.status(403).json({ error: 'Request origin verification failed.' });
    return;
  }
  next();
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const cookies = parseCookieHeader(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const resolved = resolveSessionWithMetadata(rawToken);
  if (!resolved) {
    res.status(401).json({ error: 'Session is invalid or has expired.' });
    return;
  }

  if (resolved.needsRotation) {
    const rotated = rotateSessionToken(rawToken, {
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? '',
    });
    if (rotated) {
      res.setHeader(
        'Set-Cookie',
        buildSessionCookieHeader(rotated.rawToken, {
          maxAgeSeconds: rotated.maxAgeSeconds,
          isHttps: isRequestHttps(req),
        }),
      );
    }
  }

  req.auth = resolved.user;
  req.sessionId = resolved.sessionId;
  next();
}

export function requireEnvironment(env: AuthEnvironment) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.auth.authEnvironment !== env) {
      recordAuditLog({
        actorUserId: req.auth.id,
        actorEmail: req.auth.email,
        actorRole: req.auth.roleCode,
        schoolId: req.auth.activeSchoolId,
        authEnvironment: req.auth.authEnvironment,
        action: 'environment.boundary.violation',
        resourceType: 'auth_environment',
        resourceId: env,
        outcome: 'denied',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({ error: 'Access denied for this portal environment.' });
      return;
    }
    if (env === 'school' && !req.auth.activeSchoolId) {
      res.status(403).json({ error: 'No active school tenant bound to session.' });
      return;
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!hasPermission(req.auth.permissions, permission)) {
      recordAuditLog({
        actorUserId: req.auth.id,
        actorEmail: req.auth.email,
        actorRole: req.auth.roleCode,
        schoolId: req.auth.activeSchoolId,
        authEnvironment: req.auth.authEnvironment,
        action: 'rbac.permission.denied',
        resourceType: 'permission',
        resourceId: permission,
        outcome: 'denied',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({ error: 'Insufficient role permissions for this operation.' });
      return;
    }
    next();
  };
}
