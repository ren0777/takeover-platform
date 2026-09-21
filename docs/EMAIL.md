# Production email

TakeOver's production email adapter uses Resend's HTTPS API directly. It sends plain-text transactional messages through `POST https://api.resend.com/emails` and implements the existing `EmailProvider` interface for contact verification, management links, access-request review, and access decisions.

## Configuration

The runtime coordinator should construct `createProductionEmailProvider` with:

- `apiKey`: a Resend API key restricted to sending from the production domain.
- `fromEmail`: a sender address on a domain verified in Resend, optionally including a display name such as `TakeOver <security@example.com>`.
- `webAppOrigin`: the exact public HTTPS origin. Capability secrets are placed in URL fragments so they are not sent to the web server in an HTTP request target.
- `timeoutMs`: an optional positive request timeout; the default is 10 seconds.

The API key and verified sender are deployment secrets/configuration. Never expose them to the browser, commit them, or include them in logs. Domain verification must be completed in Resend before enabling the adapter in production.

## Delivery behavior

A successful Resend response must contain a non-empty message ID. The adapter returns that ID and the local acceptance timestamp; this means Resend accepted the request, not that the recipient received the email. Provider rejection, timeout, network failure, invalid JSON, and malformed success responses fail closed with a safe `ProductionEmailDeliveryError`.

The adapter makes one request per operation and does not retry. A timeout or network failure can occur after the provider accepted a request, so an automatic retry could create duplicate mail while inventing certainty about delivery. Callers must preserve their existing durable state and use an explicit reissue workflow when appropriate.

Error messages exclude recipients, capability links, raw tokens, provider response bodies, and API credentials. Operational logging should record only safe identifiers and the stable `EMAIL_DELIVERY_FAILED` code.

## Development transport

`EMAIL_PROVIDER=development` retains messages in a bounded in-memory capture and sends nothing. By default it never touches the application logger; `GET /__dev/email-captures/:messageId` exposes a capture only when development mode, `DEV_EMAIL_CAPTURE_ENABLED=true` and a loopback `API_HOST` all hold. For an out-of-process stack such as the local Compose overlay, `DEV_EMAIL_LOG_ENABLED=true` additionally writes each capability link to the API log as an `email.development.captured` event. `parseApiConfig` rejects `EMAIL_PROVIDER=development`, `DEV_EMAIL_CAPTURE_ENABLED=true` and `DEV_EMAIL_LOG_ENABLED=true` under `NODE_ENV=production`, so production keeps failing closed whenever Resend is not configured. See [LAUNCH.md](LAUNCH.md) for the Compose overlay.

## External launch gates

Production enablement still requires a verified sending domain/address, a least-privilege Resend sending key in the deployment secret store, and an authorized delivery test. Unit tests use an injected fetch implementation and never call Resend or load real credentials.

References: [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email), [Resend API errors](https://resend.com/docs/api-reference/errors), and [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).
