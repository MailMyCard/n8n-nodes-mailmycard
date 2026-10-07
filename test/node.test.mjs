// Why this exists: two behaviours of this package are invisible until they fail
// against the live API, and both did.
//
// 1. Send a Card used to send `<execution id>-<item index>` as the
//    Idempotency-Key. MailMyCard only accepts a v4 UUID there and answers
//    anything else with 400 "Invalid submission key", so every send from the
//    node's defaults was refused. The key is now hashed into a v4 UUID.
// 2. The trigger stored the endpoint's signing secret but never checked a
//    delivery against it, so anyone who learnt the webhook URL could start the
//    workflow with a made-up order. Deliveries are now verified the way
//    MailMyCard signs them (Standard Webhooks).
// 3. The trigger read `data.order` from each delivery, but the server sends
//    `data: { orderId, ...status fields }` with no order body
//    (src/lib/api/events.ts), so every event reached the workflow with no
//    order at all. The trigger now passes the event's own fields through and
//    fetches the order by id.
//
// Runs against the built output: `npm test` builds first.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { idempotencyUuid } = require('../dist/nodes/MailMyCard/shared/idempotency.js');
const {
	isValidSignature,
	MailMyCardTrigger,
} = require('../dist/nodes/MailMyCard/MailMyCardTrigger.node.js');

// The exact check MailMyCard's order placement applies (src/lib/orders/place-order.ts).
const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('the default idempotency key becomes a UUID the API accepts', () => {
	for (const key of ['1234-0', '1234-17', 'shopify-order-99', 'x']) {
		assert.match(idempotencyUuid('node-a', key), SERVER_UUID);
	}
});

test('the same key from the same node is the same UUID, so a retry reuses the order', () => {
	assert.equal(idempotencyUuid('node-a', '1234-0'), idempotencyUuid('node-a', '1234-0'));
	assert.notEqual(idempotencyUuid('node-a', '1234-0'), idempotencyUuid('node-a', '1234-1'));
});

test('two MailMyCard nodes in one execution do not share a key', () => {
	assert.notEqual(idempotencyUuid('node-a', '1234-0'), idempotencyUuid('node-b', '1234-0'));
});

test('a key that is already a v4 UUID is sent unchanged', () => {
	const uuid = '6c8a1f2e-3b4d-4e5f-9a6b-7c8d9e0f1a2b';
	assert.equal(idempotencyUuid('node-a', uuid), uuid);
});

const secret = `whsec_${randomBytes(32).toString('base64')}`;
const sign = (id, timestamp, body, key = secret) =>
	`v1,${createHmac('sha256', Buffer.from(key.slice(6), 'base64'))
		.update(`${id}.${timestamp}.${body}`)
		.digest('base64')}`;
const now = 1_790_000_000;
// The shape the server actually sends (src/lib/api/events.ts: `data: { orderId, ...extra }`).
const event = {
	id: 'msg_1',
	type: 'order.mailed',
	createdAt: '2026-09-28T06:00:00Z',
	data: { orderId: 'o1', status: 'mailed' },
};
const body = JSON.stringify(event);
const headers = (overrides = {}) => ({
	'webhook-id': 'msg_1',
	'webhook-timestamp': String(now),
	'webhook-signature': sign('msg_1', now, body),
	...overrides,
});

test('a delivery signed with the endpoint secret is accepted', () => {
	assert.equal(isValidSignature(secret, headers(), body, now), true);
});

test('a rotated secret list is accepted when any signature matches', () => {
	const other = `whsec_${randomBytes(32).toString('base64')}`;
	const both = `${sign('msg_1', now, body, other)} ${sign('msg_1', now, body)}`;
	assert.equal(isValidSignature(secret, headers({ 'webhook-signature': both }), body, now), true);
});

test('a forged, altered, stale or unsigned delivery is refused', () => {
	const forged = `whsec_${randomBytes(32).toString('base64')}`;
	assert.equal(
		isValidSignature(
			secret,
			headers({ 'webhook-signature': sign('msg_1', now, body, forged) }),
			body,
			now,
		),
		false,
	);
	assert.equal(
		isValidSignature(secret, headers(), body.replace('mailed', 'delivered'), now),
		false,
	);
	assert.equal(isValidSignature(secret, headers(), body, now + 301), false);
	assert.equal(
		isValidSignature(secret, headers({ 'webhook-signature': undefined }), body, now),
		false,
	);
});

// A stand-in for the n8n context `webhook()` runs in: the delivery, the stored
// secret, the node's parameters, and a recorder for the one API call it makes.
function webhookContext({
	includeOrder = true,
	order = { id: 'o1', status: 'mailed', recipient: { name: 'Jane Doe' } },
} = {}) {
	const calls = [];
	return {
		calls,
		getBodyData: () => event,
		getWorkflowStaticData: () => ({ secret }),
		getRequestObject: () => ({ rawBody: Buffer.from(body) }),
		getHeaderData: () => ({
			...headers(),
			'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
			'webhook-signature': sign('msg_1', Math.floor(Date.now() / 1000), body),
		}),
		getResponseObject: () => ({ status: () => ({ send: () => {} }) }),
		getNodeParameter: (name) => (name === 'includeOrder' ? includeOrder : undefined),
		getCredentials: async () => ({ baseUrl: 'https://mailmycard.com/api/v1' }),
		getNode: () => ({ name: 'MailMyCard Trigger' }),
		helpers: {
			httpRequestWithAuthentication: {
				call: async (_self, _cred, req) => {
					calls.push(req);
					return { order };
				},
			},
			returnJsonArray: (items) => items.map((json) => ({ json })),
		},
	};
}

test('an event reaches the workflow with its own fields and the fetched order', async () => {
	const ctx = webhookContext();
	const out = await new MailMyCardTrigger().webhook.call(ctx);
	const item = out.workflowData[0][0].json;
	assert.equal(ctx.calls.length, 1);
	assert.equal(ctx.calls[0].method, 'GET');
	assert.equal(ctx.calls[0].url, 'https://mailmycard.com/api/v1/orders/o1');
	assert.equal(item.event, 'order.mailed');
	assert.equal(item.orderId, 'o1');
	assert.equal(item.status, 'mailed');
	assert.equal(item.order.recipient.name, 'Jane Doe');
});

test('with Include Full Order off, no API call is made and the event fields still arrive', async () => {
	const ctx = webhookContext({ includeOrder: false });
	const out = await new MailMyCardTrigger().webhook.call(ctx);
	assert.equal(ctx.calls.length, 0);
	assert.equal(out.workflowData[0][0].json.orderId, 'o1');
});
