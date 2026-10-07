import { createHmac, timingSafeEqual } from 'crypto';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';

const EVENTS = [
	{ name: 'Card Ordered', value: 'order.created' },
	{ name: 'Card Being Written', value: 'order.writing' },
	{ name: 'Card Written, Preparing to Mail', value: 'order.ready' },
	{ name: 'Card Mailed', value: 'order.mailed' },
	{ name: 'Card Delivered', value: 'order.delivered' },
	{ name: 'Order Failed', value: 'order.failed' },
	{ name: 'Order Cancelled', value: 'order.cancelled' },
];

/** Deliveries signed longer ago than this are refused, so a captured one cannot be replayed. */
const TOLERANCE_SECONDS = 300;

type Endpoint = { id: string; url: string; disabled?: boolean };

/**
 * Checks a delivery against the endpoint's secret. MailMyCard signs webhooks per
 * the Standard Webhooks spec: `webhook-signature` is `v1,<base64 HMAC-SHA256>`
 * (space-separated during a secret rotation) over `<webhook-id>.<webhook-timestamp>.<raw body>`,
 * keyed with the base64-decoded secret after its `whsec_` prefix.
 */
export function isValidSignature(
	secret: string,
	headers: Record<string, string | string[] | undefined>,
	rawBody: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	const header = (name: string) => {
		const value = headers[name];
		return Array.isArray(value) ? value[0] : value;
	};
	const id = header('webhook-id');
	const timestamp = Number(header('webhook-timestamp'));
	const signatures = header('webhook-signature');
	if (!id || !signatures || !Number.isInteger(timestamp)) return false;
	if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

	const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
	const expected = Buffer.from(
		createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64'),
	);
	return signatures
		.split(' ')
		.filter((part) => part.startsWith('v1,'))
		.map((part) => Buffer.from(part.slice(3)))
		.some(
			(candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected),
		);
}

/**
 * Starts a workflow when a card changes state. Turning the workflow on
 * registers a MailMyCard webhook endpoint for n8n's URL; turning it off
 * removes it. Deliveries are signed and checked here, and are at-least-once,
 * so dedupe on `eventId` downstream if a duplicate would matter.
 */
export class MailMyCardTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MailMyCard Trigger',
		name: 'mailMyCardTrigger',
		icon: {
			light: 'file:../../icons/mailmycard.svg',
			dark: 'file:../../icons/mailmycard.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{ $parameter["events"].join(", ") }}',
		description:
			'Starts the workflow when a handwritten card is ordered, written, mailed or delivered',
		defaults: { name: 'MailMyCard Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mailMyCardApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: EVENTS,
				default: ['order.created'],
				required: true,
				description: "Which moments in a card's life start the workflow",
			},
			{
				displayName: 'Include Full Order',
				name: 'includeOrder',
				type: 'boolean',
				default: true,
				description:
					'Whether to fetch the whole order (recipient, status, price) with each event. The event itself carries only the order ID and its new status.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (!webhookData.endpointId) return false;
				const webhookUrl = this.getNodeWebhookUrl('default');
				const credentials = await this.getCredentials('mailMyCardApi');
				let found: { endpoints?: Endpoint[] };
				try {
					found = (await this.helpers.httpRequestWithAuthentication.call(this, 'mailMyCardApi', {
						method: 'GET',
						url: `${credentials.baseUrl}/webhook-endpoints`,
						json: true,
					})) as { endpoints?: Endpoint[] };
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
				// A disabled endpoint, or one for a different URL (test vs production), is not ours to reuse.
				const ours = (found.endpoints ?? []).find(
					(e) => e.id === webhookData.endpointId && !e.disabled && e.url === webhookUrl,
				);
				if (!ours) {
					delete webhookData.endpointId;
					delete webhookData.secret;
					return false;
				}
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const credentials = await this.getCredentials('mailMyCardApi');
				let made: { id?: string; secret?: string };
				try {
					made = (await this.helpers.httpRequestWithAuthentication.call(this, 'mailMyCardApi', {
						method: 'POST',
						url: `${credentials.baseUrl}/webhook-endpoints`,
						body: { url: webhookUrl, events },
						json: true,
					})) as { id?: string; secret?: string };
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						description:
							'MailMyCard only delivers to https URLs, so n8n must be reachable over https',
					});
				}
				if (!made.id) return false;
				const webhookData = this.getWorkflowStaticData('node');
				webhookData.endpointId = made.id;
				webhookData.secret = made.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (!webhookData.endpointId) return true;
				const credentials = await this.getCredentials('mailMyCardApi');
				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'mailMyCardApi', {
						method: 'DELETE',
						url: `${credentials.baseUrl}/webhook-endpoints/${webhookData.endpointId}`,
						json: true,
					});
				} catch (error) {
					// Already removed on MailMyCard (404) is the outcome we wanted; anything else is surfaced.
					const status =
						(error as { httpCode?: string; response?: { status?: number } }).httpCode ??
						(error as { response?: { status?: number } }).response?.status;
					if (String(status) !== '404') throw new NodeApiError(this.getNode(), error as JsonObject);
				}
				delete webhookData.endpointId;
				delete webhookData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		if (secret) {
			const request = this.getRequestObject() as unknown as {
				rawBody?: Buffer;
				readRawBody?: () => Promise<void>;
			};
			if (!request.rawBody && request.readRawBody) await request.readRawBody();
			const rawBody = request.rawBody ? request.rawBody.toString('utf8') : JSON.stringify(body);
			if (!isValidSignature(secret, this.getHeaderData(), rawBody)) {
				const response = this.getResponseObject();
				response.status(401).send('Invalid webhook signature');
				return { noWebhookResponse: true };
			}
		}
		// The server sends `data: { orderId, ...status fields }` and no order body
		// (src/lib/api/events.ts), so the order is fetched here when wanted.
		const data = (body.data as IDataObject | undefined) ?? {};
		let order: IDataObject = {};
		if (data.orderId && (this.getNodeParameter('includeOrder', true) as boolean)) {
			const credentials = await this.getCredentials('mailMyCardApi');
			try {
				const found = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'mailMyCardApi',
					{
						method: 'GET',
						url: `${credentials.baseUrl}/orders/${encodeURIComponent(String(data.orderId))}`,
						json: true,
					},
				)) as { order?: IDataObject };
				order = found.order ?? {};
			} catch (error) {
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}
		return {
			workflowData: [
				this.helpers.returnJsonArray([
					{ eventId: body.id, event: body.type, occurredAt: body.createdAt, ...data, order },
				]),
			],
		};
	}
}
