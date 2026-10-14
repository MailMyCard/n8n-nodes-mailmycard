# Changelog

All notable changes to this package are recorded here. Versions follow [semver](https://semver.org).

## 1.0.3

- Use n8n's supported Marketing & Content category to pass the community package scanner.

## 1.0.2

- Correct repository URL capitalization to match GitHub Actions provenance.
- Align issue and credential-documentation links with the canonical repository URL.

## 1.0.1 (unpublished)

- Attempted a GitHub Actions release; npm rejected the provenance because the repository URL capitalization did not match.

## 1.0.0

First public release.

- **MailMyCard** node: Send Card, Get Order, Get Many Templates. Usable as an AI Agent tool.
- **MailMyCard Trigger**: starts a workflow on `order.created`, `order.writing`, `order.ready`, `order.mailed`, `order.delivered`, `order.failed` and `order.cancelled`. Registers its webhook endpoint on activation and removes it on deactivation.
- Send Card sends an `Idempotency-Key` (a UUID derived from the execution and item by default) so a retry returns the same order instead of posting a second card.
- The trigger verifies each delivery's Standard Webhooks signature and refuses unsigned, altered or stale ones.
- **MailMyCard API** credential (API key as a bearer token), tested against `GET /me`.
