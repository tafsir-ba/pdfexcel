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

test("server-renders the PDF Batch product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = (await response.text()).replaceAll("<!-- -->", "");
  assert.match(html, /<title>Batch Fill PDF Forms from Excel or CSV/i);
  assert.match(html, /Upload a fillable PDF and an Excel or CSV file/);
  assert.match(html, /No Acrobat/);
  assert.match(html, /Generate 3 PDFs free/);
  assert.match(html, /Add your PDF form and spreadsheet/);
  assert.match(html, /Map fields/);
  assert.match(html, /Download the batch/);
  assert.match(html, /Each spreadsheet row becomes one filled PDF/);
  assert.match(html, /PDF Batch/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
  assert.doesNotMatch(html, /PDF Mail Merge/);
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
  const privacyHtml = await privacy.text();
  const termsHtml = await terms.text();
  assert.match(privacyHtml, /Paid account files/i);
  assert.match(privacyHtml, /generated ZIP archives/i);
  assert.match(termsHtml, /payment unlocks unlimited batches/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../app/robots.ts", import.meta.url));
  await access(new URL("../app/sitemap.ts", import.meta.url));
  await access(new URL("../lib/llms-txt.ts", import.meta.url));
});

test("serves crawlability routes and high-intent landing pages", async () => {
  const paths = [
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/fill-pdf-from-excel",
    "/fill-pdf-from-csv",
    "/bulk-fill-pdf-forms",
    "/generate-certificates-from-excel",
    "/mail-merge-pdf",
    "/pricing",
    "/security",
    "/about",
    "/contact",
    "/changelog",
  ];
  for (const path of paths) {
    const response = await render(path);
    assert.equal(response.status, 200, path);
    const body = await response.text();
    if (path === "/robots.txt") {
      assert.match(body, /Sitemap:\s*https:\/\/pdfbatch\.app\/sitemap\.xml/i);
      assert.match(body, /OAI-SearchBot/i);
      assert.match(body, /Google-Extended/i);
      assert.match(body, /Disallow:\s*\/admin/i);
    } else if (path === "/sitemap.xml") {
      assert.match(body, /https:\/\/pdfbatch\.app\/mail-merge-pdf/);
      assert.match(body, /https:\/\/pdfbatch\.app\/security/);
      assert.match(body, /<loc>https:\/\/pdfbatch\.app\/?<\/loc>|<loc>https:\/\/pdfbatch\.app<\/loc>/);
    } else if (path === "/llms.txt") {
      assert.match(response.headers.get("content-type") ?? "", /text\/plain/i);
      assert.match(body, /PDF Batch/i);
      assert.match(body, /sitemap\.xml/i);
    } else {
      assert.match(body, /PDF Batch/i);
      assert.match(body, /Start free preview|Open the tool|Try the free preview|See pricing/i);
    }
  }
});

test("admin routes are noindex and do not inherit homepage canonical", async () => {
  const response = await render("/admin/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /noindex/i);
  assert.match(html, /<title>[^<]*Admin/i);
  assert.doesNotMatch(html, /rel="canonical" href="https:\/\/pdfbatch\.app\/"/);
});

test("admin login page is served for operators", async () => {
  const response = await render("/admin/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Admin sign in/i);
  assert.match(html, /Admin views never show file contents/i);
});

test("production webhook rejects missing STRIPE_WEBHOOK_SECRET", async () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const worker = await loadWorker("webhook-prod-secret");
    const response = await worker.fetch(
      new Request("http://localhost/api/checkout/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "evt_test", type: "ping" }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 503);
    assert.match(await response.text(), /STRIPE_WEBHOOK_SECRET/);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret) process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    else delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

test("webhook with secret rejects invalid signatures", async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  try {
    const worker = await loadWorker("webhook-bad-sig");
    const response = await worker.fetch(
      new Request("http://localhost/api/checkout/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=deadbeef",
        },
        body: JSON.stringify({ id: "evt_bad", type: "ping" }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Invalid signature/);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret) process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    else delete process.env.STRIPE_WEBHOOK_SECRET;
  }
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
      new Request("http://127.0.0.1/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "pdfbatch.app",
        },
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
    assert.equal(parameters.get("line_items[0][price_data][product_data][name]"), "PDF Batch 30-day access");
    assert.equal(parameters.get("metadata[device_id]"), "device-123");
    assert.equal(parameters.get("metadata[product]"), "formbatch_30_day_access");
    assert.equal(parameters.get("payment_method_types[0]"), "card");
    assert.equal(parameters.get("customer_creation"), "always");
    assert.equal(parameters.get("success_url"), "https://pdfbatch.app/?session_id={CHECKOUT_SESSION_ID}");
    assert.equal(parameters.get("cancel_url"), "https://pdfbatch.app/?checkout=cancelled");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});

test("public pricing API returns the live plan display fields", async () => {
  const worker = await loadWorker("pricing-public");
  const response = await worker.fetch(
    new Request("https://formbatch.example/api/pricing"),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.amountCents, "number");
  assert.ok(body.amountCents > 0);
  assert.equal(typeof body.displayPrice, "string");
  assert.match(body.displayPrice, /\$|USD|€|£|\d/);
  assert.equal(typeof body.durationDays, "number");
  assert.equal(typeof body.freeGenerationLimit, "number");
  assert.equal(typeof body.productKey, "string");
});

test("health endpoint responds without auth", async () => {
  const worker = await loadWorker("health");
  const response = await worker.fetch(
    new Request("https://formbatch.example/api/health"),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("verification accepts a paid session on the original or another device", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_verify";
  const created = Math.floor(Date.now() / 1000) - 60;
  globalThis.fetch = async () =>
    Response.json({
      payment_status: "paid",
      created,
      customer_details: { email: "buyer@example.com" },
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
    const paidBody = await paidResponse.json();
    assert.equal(paidBody.paid, true);
    assert.equal(paidBody.expiresAt, created * 1000 + 30 * 24 * 60 * 60 * 1000);
    assert.equal(paidBody.email, "buyer@example.com");
    assert.equal(paidBody.needsAccount, true);
    assert.equal(paidResponse.headers.get("set-cookie"), null);

    // Same Checkout session can finish account setup / unlock on another screen.
    const otherDevice = await worker.fetch(
      new Request("https://formbatch.example/api/checkout/verify?session_id=cs_test_paid&device_id=another-device"),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(otherDevice.status, 200);
    assert.equal((await otherDevice.json()).paid, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});

test("verification sets a session cookie when the paid account already has a password", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const previousSqlite = process.env.ADMIN_SQLITE_PATH;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_verify_session";
  process.env.ADMIN_SESSION_SECRET = "test-admin-secret";
  process.env.ADMIN_SQLITE_PATH = `./data/test-verify-session-${process.pid}-${Date.now()}.sqlite`;
  const created = Math.floor(Date.now() / 1000) - 60;
  const email = `returning-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const sessionId = `cs_test_returning_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  globalThis.fetch = async () =>
    Response.json({
      payment_status: "paid",
      created,
      amount_total: 1900,
      currency: "usd",
      customer_details: { email },
      metadata: { device_id: "device-returning", product: "formbatch_30_day_access" },
    });

  try {
    const worker = await loadWorker("verify-returning-session");
    const register = await worker.fetch(
      new Request("https://formbatch.example/api/account/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          deviceId: "device-returning",
          password: "password-returning",
        }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(register.status, 200, await register.clone().text());

    const verify = await worker.fetch(
      new Request(
        `https://formbatch.example/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}&device_id=device-returning`,
      ),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(verify.status, 200, await verify.clone().text());
    const body = await verify.json();
    assert.equal(body.paid, true);
    assert.equal(body.needsAccount, false);
    assert.equal(body.email, email);
    const cookie = verify.headers.get("set-cookie") || "";
    assert.match(cookie, /formbatch_customer_session=/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
    if (previousSecret) process.env.ADMIN_SESSION_SECRET = previousSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
    if (previousSqlite) process.env.ADMIN_SQLITE_PATH = previousSqlite;
    else delete process.env.ADMIN_SQLITE_PATH;
  }
});

test("account register refuses password overwrite when account already exists", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_register";
  process.env.ADMIN_SESSION_SECRET = "test-admin-secret";
  const created = Math.floor(Date.now() / 1000) - 60;
  const email = `owner-${process.pid}-${Date.now()}@example.com`;
  globalThis.fetch = async () =>
    Response.json({
      payment_status: "paid",
      created,
      amount_total: 500,
      currency: "usd",
      customer_details: { email },
      metadata: { device_id: "device-reg", product: "formbatch_30_day_access" },
    });

  try {
    const worker = await loadWorker("account-register");
    const first = await worker.fetch(
      new Request("https://formbatch.example/api/account/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "cs_test_register",
          deviceId: "device-reg",
          password: "password-one",
        }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(first.status, 200, await first.clone().text());
    const firstBody = await first.json();
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.email, email);

    const second = await worker.fetch(
      new Request("https://formbatch.example/api/account/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "cs_test_register",
          deviceId: "device-other",
          password: "password-two",
        }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(second.status, 409);
    assert.match(await second.text(), /Sign in instead/i);

    const login = await worker.fetch(
      new Request("https://formbatch.example/api/account/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "password-one",
          deviceId: "device-other",
        }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(login.status, 200, await login.clone().text());
    const loginBody = await login.json();
    assert.equal(loginBody.ok, true);
    assert.equal(loginBody.email, email);
    assert.equal(typeof loginBody.expiresAt, "number");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
    if (previousSecret) process.env.ADMIN_SESSION_SECRET = previousSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
  }
});

test("account restore accepts a paid Stripe session id", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_restore";
  process.env.ADMIN_SESSION_SECRET = "test-admin-secret";
  const created = Math.floor(Date.now() / 1000) - 60;
  const email = `restore-${process.pid}-${Date.now()}@example.com`;
  globalThis.fetch = async () =>
    Response.json({
      payment_status: "paid",
      created,
      amount_total: 100,
      currency: "usd",
      customer_details: { email },
      metadata: { device_id: "device-old", product: "formbatch_30_day_access" },
    });

  try {
    const worker = await loadWorker("account-restore");
    const response = await worker.fetch(
      new Request("https://pdfbatch.app/api/account/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "https://pdfbatch.app/?session_id=cs_test_restore_abc",
          deviceId: "device-new",
        }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.email, email);
    assert.equal(body.needsPassword, true);
    assert.equal(typeof body.expiresAt, "number");
    assert.match(response.headers.get("set-cookie") || "", /formbatch_customer_session=/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
    if (previousSecret) process.env.ADMIN_SESSION_SECRET = previousSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
  }
});

test("account login rejects wrong password and missing entitlement", async () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = "test-admin-secret";
  try {
    const worker = await loadWorker("account-login-miss");
    const response = await worker.fetch(
      new Request("https://formbatch.example/api/account/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "wrong-password",
          deviceId: "device-x",
        }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 401);
    assert.match(await response.text(), /Incorrect email or password/i);
  } finally {
    if (previousSecret) process.env.ADMIN_SESSION_SECRET = previousSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
  }
});

test("verification rejects an expired paid session", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_test_expired";
  globalThis.fetch = async () =>
    Response.json({
      payment_status: "paid",
      created: 1_700_000_000,
      metadata: { device_id: "device-123", product: "formbatch_30_day_access" },
    });

  try {
    const worker = await loadWorker("verify-expired");
    const response = await worker.fetch(
      new Request("https://formbatch.example/api/checkout/verify?session_id=cs_test_old&device_id=device-123"),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 402);
    assert.match(await response.text(), /expired/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey) process.env.STRIPE_SECRET_KEY = previousKey;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});
