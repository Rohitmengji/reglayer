/** View models for the SSO admin UI — shapes returned by /api/sso/* endpoints. */

export type RolloutStage = "DISABLED" | "INTERNAL" | "BETA" | "GA";
export type VerificationStatus = "PENDING" | "VERIFIED" | "FAILED";
export type MappableRole = "ADMIN" | "MEMBER" | "VIEWER";

export interface SsoDomainView {
  id: string;
  domain: string;
  verificationStatus: VerificationStatus;
  isPrimary: boolean;
}

export interface SsoConnectionView {
  id: string;
  label: string;
  protocol: "SAML" | "OIDC";
  defaultRole: string;
  rolloutStage: RolloutStage;
  enforcementPolicy: string;
  healthStatus: string;
  certificateExpiresAt: string | null;
  disabledAt: string | null;
  lastSSOLoginAt: string | null;
  createdAt: string;
  domains: SsoDomainView[];
}

export interface RoleMappingView {
  idpGroup: string;
  role: MappableRole;
}
