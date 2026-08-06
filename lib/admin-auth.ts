const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{1,2}/g)!.map((part) => Number.parseInt(part, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return `${toHex(salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength))}.${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(".");
  if (!saltHex || !hashHex) return false;
  const next = await hashPassword(password, saltHex);
  return next === stored;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(digest);
}

export function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

export type AdminRole = "owner" | "support" | "finance" | "readonly";

export type AdminSession = {
  adminId: number;
  email: string;
  role: AdminRole;
  exp: number;
};

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.STRIPE_SECRET_KEY || "dev-admin-secret";
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signature);
}

export async function createSessionToken(session: Omit<AdminSession, "exp">, ttlMs = 12 * 60 * 60 * 1000) {
  const body: AdminSession = { ...session, exp: Date.now() + ttlMs };
  const payload = btoa(JSON.stringify(body));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function readSessionToken(token: string | undefined | null): Promise<AdminSession | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await sign(payload);
  if (expected !== signature) return null;
  try {
    const session = JSON.parse(atob(payload)) as AdminSession;
    if (!session?.adminId || !session.exp || session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "formbatch_admin_session";

export function sessionCookieHeader(token: string, secure = process.env.NODE_ENV === "production") {
  const secureFlag = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 60 * 60}${secureFlag}`;
}

export function clearSessionCookieHeader(secure = process.env.NODE_ENV === "production") {
  const secureFlag = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}

export function parseCookies(header: string | null) {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    out[key] = rest.join("=");
  }
  return out;
}

const ROLE_PERMISSIONS: Record<AdminRole, Set<string>> = {
  owner: new Set(["*"]),
  support: new Set([
    "dashboard:read",
    "transactions:read",
    "entitlements:read",
    "entitlements:write",
    "usage:read",
    "claims:read",
    "claims:write",
    "export:read",
  ]),
  finance: new Set([
    "dashboard:read",
    "transactions:read",
    "pricing:read",
    "pricing:write",
    "usage:read",
    "export:read",
  ]),
  readonly: new Set([
    "dashboard:read",
    "transactions:read",
    "entitlements:read",
    "pricing:read",
    "usage:read",
    "claims:read",
  ]),
};

export function can(role: AdminRole, permission: string) {
  const grants = ROLE_PERMISSIONS[role];
  return grants.has("*") || grants.has(permission);
}
