# FormBatch

FormBatch turns a fillable PDF and a CSV spreadsheet into a ZIP of completed
PDFs. The first three rows are free; a Stripe payment unlocks full batches of up
to 250 rows for 30 days on the purchasing device.

All document processing happens in the browser. Uploaded PDFs, CSV data, and
generated documents are not sent to the application server.

## Prerequisites

- Node.js `>=22.13.0`

## Local Development

```bash
pnpm install
pnpm dev
pnpm test
```

Set `STRIPE_SECRET_KEY` in the host environment to enable checkout. The payment
routes create and verify Stripe Checkout Sessions without exposing the secret to
the browser.

## Validation

`pnpm test` builds the production bundle and verifies PDF filling, ZIP delivery,
initial rendering, legal pages, and the payment route's fail-closed behavior.
