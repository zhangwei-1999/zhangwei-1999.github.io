export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<{ results: T[] }[]>;
}

export interface Env {
  DB: D1Database;
  /** One Cloudflare secret, never a checked-in vars entry. */
  SECRETS: string;
  ALLOWED_ORIGINS: string;
  ALBUM_SLUGS: string;
  ENVIRONMENT?: "local" | "production";
}

export type CredentialContext = "admin-login" | "admin-reset" | `album:${string}`;
export interface LegacyPasswordVerifier { version?: 1; salt: string; hash: string; iterations: number }
export interface HybridPasswordVerifier {
  version: 2;
  algorithm: "PBKDF2-HMAC-SHA256+HMAC-SHA256";
  context: CredentialContext;
  salt: string;
  iterations: number;
  hash: string;
}
export type PasswordVerifier = LegacyPasswordVerifier | HybridPasswordVerifier;
export interface Secrets {
  adminVerifier: PasswordVerifier;
  resetVerifier: PasswordVerifier;
  albums: Record<string, { verifier: PasswordVerifier; dataKey: string }>;
  auditKey: string;
  ipHmacKey: string;
  dashboardKey: string;
  /** A separate random server-only key; mandatory for every v2 verifier. */
  passwordPepper?: string;
}

export type AuditKind = "visit" | "unlock_success" | "unlock_failure" | "unlock_blocked"
  | "admin_login_success" | "admin_login_failure" | "admin_login_blocked" | "admin_reset_failure";

export interface AuditEvent {
  id: string;
  at: number;
  album: string;
  kind: AuditKind;
  ip: string;
  visitorId: string;
  location: {
    accuracy: "network-approximate";
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  language?: string;
  timezone?: string;
  referrerHost?: string;
  userAgent?: string;
  failureCount?: number;
  blockedUntil?: number;
  /** Only verified wrong shared album phrases; never admin or successful inputs. */
  attemptedPhrase?: string;
  attemptTruncated?: boolean;
}

export interface AuditTotals {
  visits: number;
  failedUnlocks: number;
  successfulUnlocks: number;
  blockedAttempts: number;
  uniqueVisitors: number;
}

export interface DashboardData {
  events: AuditEvent[];
  totals: AuditTotals;
  albums: ({ slug: string } & AuditTotals)[];
  generatedAt: string;
  truncated: boolean;
}

/** The first page includes full SQL totals; later pages only decrypt events. */
export interface DashboardPage {
  events: AuditEvent[];
  totals?: AuditTotals;
  albums?: ({ slug: string } & AuditTotals)[];
  generatedAt: string;
  truncated: boolean;
  nextCursor: string | null;
}

export interface RequestContext {
  ip: string;
  identity: string;
  location: AuditEvent["location"];
  userAgent?: string;
}
