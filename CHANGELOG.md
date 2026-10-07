# Changelog

All notable changes to this package are recorded here. Versions follow [semver](https://semver.org).

## 1.0.0

First public release.

- **MailMyCard** node: Send Card, Get Order, Get Many Templates. Usable as an AI Agent tool.
- **MailMyCard Trigger**: starts a workflow on `order.created`, `order.writing`, `order.ready`, `order.mailed`, `order.delivered`, `order.failed` and `order.cancelled`. Registers its webhook endpoint on activation and removes it on deactivation.
- Send Card sends an `Idempotency-Key` (a UUID derived from the execution and item by default) so a retry returns the same order instead of posting a second card.
- The trigger verifies each delivery's Standard Webhooks signature and refuses unsigned, altered or stale ones.
- **MailMyCard API** credential (API key as a bearer token), tested against `GET /me`.
