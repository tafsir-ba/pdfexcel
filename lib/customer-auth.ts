const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const CUSTOMER_SESSION_COOKIE = "formbatch_customer_session";

export type CustomerSession = {
  customerId: number;
  email: string;
  exp: number;
};

function customerSessionSecret() {
  const dedicated = process.env.CUSTOMER_SESSION_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim();
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET is required in production for customer sessions.");
  }
  return process.env.STRIPE_SECRET_KEY || "dev-customer-secret";
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(customerSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signature);
}

export async function createCustomerSessionToken(
  session: Omit<CustomerSession, "exp">,
  ttlMs = 30 * 24 * 60 * 60 * 1000,
) {
  const body: CustomerSession = { ...session, exp: Date.now() + ttlMs };
  const payload = btoa(JSON.stringify(body));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function readCustomerSessionToken(token: string | undefined | null): Promise<CustomerSession | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await sign(payload);
  if (expected !== signature) return null;
  try {
    const session = JSON.parse(atob(payload)) as CustomerSession;
    if (!session?.customerId || !session.email || !session.exp || session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function customerSessionCookieHeader(token: string, maxAgeSeconds = 30 * 24 * 60 * 60, secure?: boolean) {
  const useSecure = secure ?? process.env.NODE_ENV === "production";
  const secureFlag = useSecure ? "; Secure" : "";
  return `${CUSTOMER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
}

export function clearCustomerSessionCookieHeader(secure?: boolean) {
  const useSecure = secure ?? process.env.NODE_ENV === "production";
  const secureFlag = useSecure ? "; Secure" : "";
  return `${CUSTOMER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}

export function validateCustomerPassword(password: string) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 128) return "Password is too long.";
  return null;
}
