import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/admin-auth.ts";
import { validateCustomerPassword } from "../lib/customer-auth.ts";

test("customer password validation rejects short secrets", () => {
  assert.match(validateCustomerPassword("short") || "", /at least 8/i);
  assert.equal(validateCustomerPassword("long-enough-secret"), null);
});

test("customer password hashing round-trips", async () => {
  const stored = await hashPassword("correct-horse-battery");
  assert.equal(await verifyPassword("correct-horse-battery", stored), true);
  assert.equal(await verifyPassword("wrong-password", stored), false);
});
