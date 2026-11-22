export type UserType = 'workforce' | 'school_member';

export type AuthEnvironment = 'workers' | 'school';

export type WorkforceRoleCode =
  | 'platform_owner'
  | 'workforce_admin'
  | 'workforce_support';

export type SchoolRoleCode =
  | 'school_admin'
  | 'teacher'
  | 'student'
  | 'parent';

export type RoleCode = WorkforceRoleCode | SchoolRoleCode;

export type SchoolStatus = 'pending_verification' | 'active' | 'suspended';

export type MembershipStatus = 'active' | 'invited' | 'suspended';

export type AuditOutcome = 'success' | 'denied' | 'failure';

export type AcademicTerm = 'First Term' | 'Second Term' | 'Third Term' | 'Annual';

export interface AuthContextUser {
  id: string;
  email: string;
  fullName: string;
  userType: UserType;
  roleCode: RoleCode;
  roleName: string;
  permissions: string[];
  authEnvironment: AuthEnvironment;
  activeSchoolId: string | null;
  activeSchoolName: string | null;
  activeSchoolCode: string | null;
  activeSchoolStatus: SchoolStatus | null;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  authEnvironment: AuthEnvironment;
  activeSchoolId: string | null;
  expiresAt: string;
  revokedAt: string | null;
}
