import { createHash } from 'crypto';
import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * MailMyCard only accepts a v4-shaped UUID as an Idempotency-Key and answers
 * anything else with 400 "Invalid submission key". The node's key is free text
 * (by default the execution id and item index), so it is hashed into one: the
 * same text from the same node always gives the same UUID, and so the same order.
 *
 * The node's id is part of the hash so two MailMyCard nodes in one workflow,
 * run in one execution, do not share keys: without it the second node would get
 * the first node's order back, or a 409 if its card differed. A key that is
 * already a v4 UUID is sent unchanged, so a UUID shared with another system still
 * lines up with it.
 */
export function idempotencyUuid(nodeId: string, key: string): string {
	if (UUID_V4.test(key)) return key.toLowerCase();
	const hex = createHash('sha256').update(`n8n:${nodeId}:${key}`).digest('hex');
	const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Sets the Idempotency-Key header on Send a Card. An empty key sends none. */
export async function setIdempotencyKey(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const key = String(this.getNodeParameter('idempotencyKey', '') ?? '').trim();
	if (!key) return requestOptions;
	requestOptions.headers = {
		...(requestOptions.headers ?? {}),
		'Idempotency-Key': idempotencyUuid(this.getNode().id, key),
	};
	return requestOptions;
}
