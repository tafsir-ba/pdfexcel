import assert from "node:assert/strict";
import test from "node:test";
import {
  can,
  createSessionToken,
  hashPassword,
  readSessionToken,
  sanitizeFilename,
  sha256Hex,
  verifyPassword,
  rolePermissions,
} from "../lib/admin-auth.ts";

test("password hashing verifies matching passwords and rejects mismatches", async () => {
  const stored = await hashPassword("correct-horse");
  assert.equal(await verifyPassword("correct-horse", stored), true);
  assert.equal(await verifyPassword("wrong-password", stored), false);
});

test("RBAC grants match role matrix for observability actions", () => {
  assert.equal(can("owner", "pricing:write"), true);
  assert.equal(can("support", "claims:write"), true);
  assert.equal(can("support", "pricing:write"), false);
  assert.equal(can("finance", "transactions:read"), true);
  assert.equal(can("finance", "entitlements:read"), false);
  assert.equal(can("finance", "claims:write"), false);
  assert.equal(can("readonly", "entitlements:write"), false);
  assert.equal(can("readonly", "usage:read"), true);
  assert.ok(rolePermissions("support").includes("claims:read"));
  assert.equal(rolePermissions("finance").includes("entitlements:read"), false);
});

test("filename sanitization and hashing never retain raw path characters", async () => {
  assert.equal(sanitizeFilename("../secret invoice!!.pdf"), "secret-invoice.pdf");
  const digest = await sha256Hex("invoice.pdf");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, "invoice.pdf");
});

test("admin session tokens expire and reject tampering", async () => {
  const token = await createSessionToken(
    { adminId: 7, email: "owner@example.com", role: "owner" },
    60_000,
  );
  const session = await readSessionToken(token);
  assert.ok(session);
  assert.equal(session.adminId, 7);
  assert.equal(session.role, "owner");

  const [payload] = token.split(".");
  assert.equal(await readSessionToken(`${payload}.deadbeef`), null);

  const expired = await createSessionToken(
    { adminId: 7, email: "owner@example.com", role: "owner" },
    -1,
  );
  assert.equal(await readSessionToken(expired), null);
});

test("production rejects missing ADMIN_SESSION_SECRET", async () => {
  const previous = process.env.NODE_ENV;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const previousStripe = process.env.STRIPE_SECRET_KEY;
  process.env.NODE_ENV = "production";
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    await assert.rejects(
      () => createSessionToken({ adminId: 1, email: "a@b.c", role: "owner" }),
      /ADMIN_SESSION_SECRET/,
    );
  } finally {
    process.env.NODE_ENV = previous;
    if (previousSecret) process.env.ADMIN_SESSION_SECRET = previousSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
    if (previousStripe) process.env.STRIPE_SECRET_KEY = previousStripe;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});

test("entitlement window math extends from the later of now or current end", () => {
  const now = Date.parse("2026-08-06T12:00:00.000Z");
  const currentEndsAt = "2026-08-20T12:00:00.000Z";
  const days = 10;
  const base = Math.max(now, Date.parse(currentEndsAt));
  const endsAt = new Date(base + days * 86400000).toISOString();
  assert.equal(endsAt, "2026-08-30T12:00:00.000Z");
});
