# Dodo Payments Integration Documentation

**Generated on 2026-09-03**

---

## Overview

This document captures the officially documented behavior of the Dodo Payments provider as of the latest documentation (July 2026). All sections are explicitly labeled as **CONFIRMED FROM OFFICIAL DOCS** when the information is directly sourced from Dodo Payments documentation, or **UNKNOWN / NOT DOCUMENTED** when the official documentation does not provide the detail.

---

## Checkout Creation API

- **Endpoint**: `POST Create Checkout Session`
- **Confirmed from official docs**: The endpoint exists as part of the "Checkout Sessions" collection.
- **Authentication**: `Authorization: Bearer <YOUR_API_KEY>`
  - *Confirmed*: The API requires a bearer token header for all requests.
- **Rate Limits**: Tier 0 (default) – 40 requests per second (burst) and 240 requests per minute (sustained).
  - *Confirmed*: Documented under **Rate Limits**.
- **Request fields**: *UNKNOWN / NOT DOCUMENTED*
  - The official docs list the endpoint but do not expose the JSON schema for the request body (e.g., amount, currency, success/return URLs, etc.).
- **Required request fields**: *UNKNOWN / NOT DOCUMENTED*
- **Successful response fields**: *UNKNOWN / NOT DOCUMENTED*
  - The docs show a generic success response example (`payment_id`, `status`, `total_amount`, `currency`, `created_at`) but do not tie it to the checkout creation endpoint.
- **Hosted checkout URL behavior**: *UNKNOWN / NOT DOCUMENTED*
  - No explicit description of how the returned checkout URL should be used, nor any constraints on browser return URLs.
- **Idempotency support**: *UNKNOWN / NOT DOCUMENTED*
  - The docs do not mention an idempotency‑key header or parameter for checkout creation.
- **Sandbox / Test mode**: *UNKNOWN / NOT DOCUMENTED*
  - No mention of a sandbox environment or test mode flag.
- **Return / Success URL behavior**: *UNKNOWN / NOT DOCUMENTED*
  - The docs do not describe how return URLs are handled, nor any server‑side verification requirements.

---

## Webhook Verification Algorithm

- **Webhook endpoint**: *UNKNOWN / NOT DOCUMENTED*
- **Signature header name**: *UNKNOWN / NOT DOCUMENTED*
- **Signature algorithm**: *UNKNOWN / NOT DOCUMENTED*
- **Timestamp / replay protection**: *UNKNOWN / NOT DOCUMENTED*
- **Event ID**: *UNKNOWN / NOT DOCUMENTED*
- **Event types / statuses**: *UNKNOWN / NOT DOCUMENTED*
- **Retry semantics**: *UNKNOWN / NOT DOCUMENTED*
- **Duplicate‑delivery behavior**: *UNKNOWN / NOT DOCUMENTED*

> *All above items are not present in the publicly available Dodo Payments documentation as of the fetch date.*

---

## Refund API

- **Endpoint**: `POST Create Refund`
- **Authentication**: `Authorization: Bearer <YOUR_API_KEY>` (same as other API calls).
- **Rate Limits**: Same as general API limits (40 req/s burst, 240 req/min sustained for Tier 0).
- **Request fields**: *UNKNOWN / NOT DOCUMENTED*
- **Response fields**: *UNKNOWN / NOT DOCUMENTED*
- **Refund statuses**: *UNKNOWN / NOT DOCUMENTED*
- **Failure behavior**: *UNKNOWN / NOT DOCUMENTED*

---

## Provider Event → Internal `PaymentStatus` Mapping

- *UNKNOWN / NOT DOCUMENTED*

---

## Provider Event → `AttemptState` Implications

- *UNKNOWN / NOT DOCUMENTED*

---

## Webhook Verification Algorithm (Detailed)

- *UNKNOWN / NOT DOCUMENTED*

---

## Dedupe Key

- *UNKNOWN / NOT DOCUMENTED*

---

## Checkout Creation Payload

- *UNKNOWN / NOT DOCUMENTED*

---

## Refund Flow

- *UNKNOWN / NOT DOCUMENTED*

---

## Reconciliation Edge Cases

- *UNKNOWN / NOT DOCUMENTED*

---

## Required Environment Variables

- *UNKNOWN / NOT DOCUMENTED*

---

## Security Requirements

- **API keys must be kept secret** and never exposed in client‑side code or public repositories. *(Confirmed from the "Authenticate Your API Requests" section.)*
- **All webhook payloads must be verified server‑side** before processing any state changes. *(Confirmed from the "Webhooks" brief description.)*
- **Transport security**: All API calls must be made over HTTPS. *(Implicit in modern APIs and standard practice.)*

---

## Summary of Confirmed Points

| Item | Confirmation Source |
|------|----------------------|
| Authentication header format | "Authorization: Bearer YOUR_API_KEY" – API Reference → "Authenticate Your API Requests" |
| General rate‑limit numbers (Tier 0) | API Reference → "Rate Limits" |
| Existence of Checkout Sessions, Webhooks, Refund endpoints | API Reference table of contents |
| Need for server‑side webhook verification | API Reference → "Webhooks" brief |
| API keys must be secret | API Reference → "Never expose your secret API keys" |

---

## Open Uncertainties

All items marked **UNKNOWN / NOT DOCUMENTED** above are currently not described in the public Dodo Payments documentation. These will need to be clarified with Dodo Payments support or by inspecting a sandbox implementation before a production adapter can be safely built.

---

*This document is intended for internal use while building the Dodo Payments adapter. It should be revisited whenever Dodo Payments updates its public API documentation.*
