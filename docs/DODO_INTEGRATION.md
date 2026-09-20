# Dodo Payments Integration Documentation

**Generated on 2026-09-03**

## Overview
This document describes the integration of the Dodo Payments provider as a Pay‑What‑You‑Want (PWYW) payment adapter.

## Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `DODO_API_KEY` | API key for Dodo Payments. Must be set in production. | `my-secret-key` |
| `DODO_BASE_URL` | Base URL for Dodo API. Must be HTTPS. | `https://test.dodopayments.com/` |
| `DODO_PRODUCT_IDS` | JSON object mapping three‑letter ISO currency codes (uppercase) to Dodo product IDs. At least one entry is required when `DODO_API_KEY` is set. | `{"USD":"prod_usd","INR":"prod_inr"}` |

**Important:** No `DODO_DEFAULT_PRODUCT_ID` is used. The adapter selects the product ID based on the checkout currency using `DODO_PRODUCT_IDS`. If a currency is not present, the checkout fails with an error.

## Checkout Creation Payload
When creating a checkout, the adapter sends a POST request to `${DODO_BASE_URL}/checkouts` with the following JSON body:

```json
{
  "product_cart": [
    {
      "product_id": "<product-id-for-currency>",
      "quantity": 1,
      "amount": <amountMinor>
    }
  ],
  "return_url": "<trusted-return-url>",
  "cancel_url": "<trusted-return-url>",
  "metadata": {
    "checkout_id": "<internal-checkout-id>",
    "quote_id": "<internal-quote-id>",
    "amount_minor": <amountMinor>,
    "currency": "<currency>"
  }
}
```
- `amount` is the smallest‑currency unit (`amountMinor`) from the TakeOver system.
- `product_id` is looked up from `DODO_PRODUCT_IDS` using the `currency`.
- `return_url` and `cancel_url` are both set to the trusted return URL supplied by TakeOver.
- `metadata` contains the internal identifiers for traceability.

## Response Mapping
The Dodo API must return a JSON object containing:
- `session_id` (or equivalent) → `providerCheckoutId`
- `checkout_url` (HTTPS) → `providerCheckoutUrl`

The adapter validates that both fields are non‑empty strings and that `checkout_url` uses the `https:` protocol. If validation fails, an error is thrown.

## Error Handling
- **Unsupported currency** → immediate error, no network request.
- **Missing `session_id` or `checkout_url`** → error.
- **Non‑HTTPS `checkout_url`** → error.
- **HTTP status ≥ 400** → error with response body.
- **Network failure** → error propagated.
- **Request timeout (10 seconds)** → error `Dodo checkout request timed out`.

The adapter performs **no automatic retries**.

## Security
- All API calls are made over HTTPS.
- The `DODO_API_KEY` must be kept secret and never exposed to the client.
- The `checkout_url` returned by Dodo is validated to be HTTPS before being returned to the client.

## Deprecation
`DODO_DEFAULT_PRODUCT_ID` is retained only for backward compatibility and is **not** used by the current implementation.
