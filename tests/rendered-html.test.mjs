import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function loadWorker(tag) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(tag, `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtimeEnv = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const runtimeContext = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the PDF Mail Merge product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>PDF Mail Merge from Excel or CSV<\/title>/i);
  assert.match(html, /PDF mail merge from Excel or CSV\./);
  assert.match(html, /No Acrobat/);
  assert.match(html, /First 3 free/);
  assert.match(html, /Choose your PDF template and recipient data/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("includes legal routes and removes starter preview assets", async () => {
  const [privacy, terms, packageJson] = await Promise.all([
    render("/privacy"),
    render("/terms"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.equal(privacy.status, 200);
  assert.equal(terms.status, 200);
  assert.match(await privacy.text(), /PDF and spreadsheet contents are processed locally/);
  assert.match(await terms.text(), /USD 19 payment unlocks unlimited batches/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
});

test("checkout fails closed when a Stripe key is unavailable", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const worker = await loadWorker("checkout-closed");
    const response = await worker.fetch(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: "test-device" }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Checkout is being connected/);
  } finally {
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
  }
});

test("checkout sends Stripe the exact product, price, device, and return URLs", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_contract";
  let stripeRequest;
  globalThis.fetch = async (input, init) => {
    stripeRequest = { url: String(input), init };
    return Response.json({ url: "https://checkout.stripe.test/session" });
  };

  try {
    const worker = await loadWorker("checkout-contract");
    const response = await worker.fetch(
      new Request("https://formbatch.example/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: "device-123" }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, "https://checkout.stripe.test/session");
    assert.equal(stripeRequest.url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(stripeRequest.init.headers.Authorization, "Bearer sk_test_contract");
    const parameters = new URLSearchParams(stripeRequest.init.body);
    assert.equal(parameters.get("line_items[0][price_data][unit_amount]"), "1900");
    assert.equal(parameters.get("line_items[0][price_data][currency]"), "usd");
    assert.equal(parameters.get("line_items[0][price_data][product_data][name]"), "PDF Mail Merge 30-day access");
    assert.equal(parameters.get("metadata[device_id]"), "device-123");
    assert.equal(parameters.get("metadata[product]"), "formbatch_30_day_access");
    assert.equal(parameters.get("success_url"), "https://formbatch.example/?session_id={CHECKOUT_SESSION_ID}");
    assert.equal(parameters.get("cancel_url"), "https://formbatch.example/?checkout=cancelled");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});

test("verification accepts a paid matching device and rejects a forged device", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_verify";
  globalThis.fetch = async () =>
    Response.json({
      payment_status: "paid",
      created: 1_700_000_000,
      metadata: { device_id: "device-123", product: "formbatch_30_day_access" },
    });

  try {
    const worker = await loadWorker("verify-contract");
    const paidResponse = await worker.fetch(
      new Request("https://formbatch.example/api/checkout/verify?session_id=cs_test_paid&device_id=device-123"),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(paidResponse.status, 200);
    assert.deepEqual(await paidResponse.json(), {
      paid: true,
      expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
    });

    const forgedResponse = await worker.fetch(
      new Request("https://formbatch.example/api/checkout/verify?session_id=cs_test_paid&device_id=another-device"),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(forgedResponse.status, 402);
    assert.match(await forgedResponse.text(), /No completed PDF Mail Merge payment/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});
