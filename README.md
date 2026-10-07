# n8n-nodes-mailmycard

This is an n8n community node. It lets you send real handwritten cards by post from your n8n workflows with [MailMyCard](https://mailmycard.com).

MailMyCard writes your message by hand with a pen on a real card and mails it to the recipient. You design a card once in the MailMyCard dashboard, save it as a template, and then send it to anyone from a workflow: a new customer, a renewal, a review, a birthday.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) ·
[Operations](#operations) ·
[Credentials](#credentials) ·
[Compatibility](#compatibility) ·
[Usage](#usage) ·
[Resources](#resources) ·
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. In short: **Settings → Community Nodes → Install**, and enter `n8n-nodes-mailmycard`.

## Operations

The package contains two nodes.

### MailMyCard

| Operation | What it does | API |
| --- | --- | --- |
| **Send Card** | Sends one of your saved templates to a recipient's postal address. Choose the template from a list, map the address fields, and optionally set the quantity (1–50) and the delivery service (Tracked or Express; defaults to the template's). | `POST /templates/{id}/orders` |
| **Get Order** | Retrieves one order: its status, recipient, card and price. Choose the order from your recent orders or give its ID. | `GET /orders/{id}` |
| **Get Many Templates** | Retrieves the cards your account has saved as templates. | `GET /templates` |

The MailMyCard node can also be used as a tool by n8n's AI Agent.

### MailMyCard Trigger

Starts a workflow when a card changes state. Choose one or more events:

| Event | When |
| --- | --- |
| Card Ordered | `order.created` – an order was placed |
| Card Being Written | `order.writing` – the pen has started |
| Card Written, Preparing to Mail | `order.ready` |
| Card Mailed | `order.mailed` |
| Card Delivered | `order.delivered` |
| Order Failed | `order.failed` |
| Order Cancelled | `order.cancelled` |

Each item has `eventId`, `event` and `occurredAt`, followed by the order's fields (`id`, `status`, `statusLabel`, `recipient`, `card`, `quantity`, `mailClass`, `pricing`, `createdAt`, …).

## Credentials

You need a MailMyCard account and an API key.

1. Sign up at [mailmycard.com](https://mailmycard.com) and add money to your wallet. Cards and postage are paid from the wallet.
2. In the dashboard, open **Developers → API keys** and create a key. Live keys look like `mmc_live_…`; test keys (`mmc_test_…`) never post a real card.
3. In n8n, create a **MailMyCard API** credential and paste the key into **API Key**. Leave **Base URL** as `https://mailmycard.com/api/v1`.

n8n checks the key when you save the credential (by calling `GET /me`).

## Compatibility

- Requires n8n **1.85.0** or later (the first release shipping `n8n-workflow` 1.83, which this package's nodes use).
- Built and linted against `n8n-workflow` 2.40 with `@n8n/node-cli` 0.49.
- No runtime dependencies. The only Node.js module used is the built-in `crypto`.

## Usage

### Send a card to every new customer

1. Add a trigger for new customers, for example **Shopify Trigger** (`orders/create`) or **Stripe Trigger** (`customer.created`).
2. Add a **MailMyCard** node, operation **Send Card**.
3. Pick your thank-you template under **Template**.
4. Map the address fields from the trigger, for example **Recipient Name** → `{{ $json.shipping_address.name }}`, **Recipient Country Code** → `{{ $json.shipping_address.country_code }}`.

Required address fields are name, address line 1, city, postal code and a two-letter country code (`US`, `GB`, `IN`, …). Line 2 and state/region are optional.

### No second card on a retry

**Send Card** sends an `Idempotency-Key` header. By default the key is built from the execution ID and the item's position (`{{ $execution.id }}-{{ $itemIndex }}`), so when n8n retries the node inside the same execution (for example with **Retry On Fail**), MailMyCard returns the order it already created instead of posting a second card. MailMyCard needs the key to be a UUID, so the node turns the text into one: the same text from the same node always gives the same UUID. A key that is already a UUID is sent unchanged.

To make the guarantee survive a whole new execution, set **Idempotency Key** to something stable from your data, such as `{{ $json.order_id }}`. Leave it empty to send no key.

### Reacting to card events

Add a **MailMyCard Trigger**, choose events, and activate the workflow. On activation the node registers a webhook endpoint on your MailMyCard account for n8n's URL; on deactivation it removes it. MailMyCard only delivers to `https` URLs, so your n8n instance must be reachable over https.

Every delivery is signed ([Standard Webhooks](https://www.standardwebhooks.com/)); the trigger checks the signature and refuses deliveries that are unsigned, altered, or more than five minutes old. Deliveries are at-least-once, so dedupe on `eventId` if a duplicate would matter.

## Resources

- [MailMyCard API documentation](https://mailmycard.com/developers)
- [MailMyCard OpenAPI description](https://mailmycard.com/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

See [CHANGELOG.md](CHANGELOG.md).

- **1.0.0** – First release: Send Card, Get Order, Get Many Templates, and the MailMyCard Trigger.

## Development

```sh
npm install
npm run lint        # n8n's community node linter
npm run typecheck
npm test            # builds, then tests idempotency keys and webhook signatures
npm run dev         # a local n8n with this node loaded
```

## License

[MIT](LICENSE.md)
