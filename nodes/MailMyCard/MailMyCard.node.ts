import { NodeConnectionTypes } from 'n8n-workflow';
import type { INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { setIdempotencyKey } from './shared/idempotency';
import { searchOrders, searchTemplates } from './shared/listSearch';

const UUID_PATTERN =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const sendCard = { operation: ['sendCard'] };

/** The recipient's address, as fields a workflow maps from the previous step. */
const addressFields = (prefix: string, label: string): INodeProperties[] =>
	(
		[
			['name', 'Name', `${label}'s full name, as written on the envelope`, 'e.g. Nathan Smith'],
			['line1', 'Address Line 1', 'House number and street', 'e.g. 1 Main Street'],
			['line2', 'Address Line 2', 'Apartment, suite or unit, if any', 'e.g. Apt 4B'],
			['city', 'City', 'Town or city', 'e.g. Springfield'],
			['region', 'State / Region', 'State, province or region, if the country uses one', 'e.g. IL'],
			['postal', 'Postal Code', 'ZIP or postal code', 'e.g. 62701'],
			['country', 'Country Code', 'Two-letter ISO 3166-1 code, e.g. US, GB, IN', 'e.g. US'],
		] as const
	).map(([key, name, description, placeholder]) => ({
		displayName: `${label} ${name}`,
		name: `${prefix}_${key}`,
		type: 'string',
		default: '',
		required: !['line2', 'region'].includes(key),
		description,
		placeholder,
		displayOptions: { show: sendCard },
		routing: {
			send: {
				type: 'body',
				property: `${prefix}.${key}`,
				value:
					key === 'country'
						? '={{ $value.trim().toUpperCase() }}'
						: ['line2', 'region'].includes(key)
							? '={{ $value || undefined }}'
							: '={{ $value }}',
			},
		},
	}));

export class MailMyCard implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MailMyCard',
		name: 'mailMyCard',
		icon: {
			light: 'file:../../icons/mailmycard.svg',
			dark: 'file:../../icons/mailmycard.dark.svg',
		},
		group: ['output'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Send real handwritten cards by post from a saved template',
		defaults: { name: 'MailMyCard' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mailMyCardApi', required: true }],
		requestDefaults: {
			baseURL: '={{ $credentials.baseUrl }}',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'sendCard',
				options: [
					{
						name: 'Get Order',
						value: 'getOrder',
						action: 'Get order',
						description: 'Retrieve one order: its status, recipient and price',
						routing: {
							request: { method: 'GET', url: '=/orders/{{ $parameter.orderId }}' },
							output: {
								postReceive: [{ type: 'rootProperty', properties: { property: 'order' } }],
							},
						},
					},
					{
						name: 'Get Many Templates',
						value: 'listTemplates',
						action: 'Get many templates',
						description: 'Retrieve the cards this account has saved as templates',
						routing: {
							request: { method: 'GET', url: '/templates' },
							output: {
								postReceive: [{ type: 'rootProperty', properties: { property: 'templates' } }],
							},
						},
					},
					{
						name: 'Send Card',
						value: 'sendCard',
						action: 'Send card',
						description: 'Send one of your saved templates to a recipient as a handwritten card',
						routing: {
							request: { method: 'POST', url: '=/templates/{{ $parameter.templateId }}/orders' },
							output: {
								postReceive: [{ type: 'rootProperty', properties: { property: 'order' } }],
							},
						},
					},
				],
			},
			{
				displayName: 'Template',
				name: 'templateId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'A card saved as a template in the MailMyCard dashboard',
				displayOptions: { show: sendCard },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a template...',
						typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. 3f0c9f8e-2b7a-4c1d-9e4f-5a6b7c8d9e0f',
						validation: [
							{
								type: 'regex',
								properties: { regex: UUID_PATTERN, errorMessage: 'Not a valid template ID' },
							},
						],
					},
				],
			},
			...addressFields('recipient', 'Recipient'),
			{
				displayName: 'Quantity',
				name: 'quantity',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 50 },
				description:
					'Copies to send to this recipient. The card and delivery cost for each copy is paid from your dollar wallet.',
				displayOptions: { show: sendCard },
				routing: { send: { type: 'body', property: 'quantity', value: '={{ $value }}' } },
			},
			{
				displayName: 'Delivery',
				name: 'mailClass',
				type: 'options',
				default: '',
				description: 'How the card is posted',
				options: [
					{ name: "Template's Default", value: '' },
					{ name: 'Tracked', value: 'tracked' },
					{ name: 'Express', value: 'express' },
				],
				displayOptions: { show: sendCard },
				routing: {
					send: { type: 'body', property: 'mailClass', value: '={{ $value || undefined }}' },
				},
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '={{ $execution.id }}-{{ $itemIndex }}',
				description:
					'Sent as the Idempotency-Key header (as a UUID derived from this text), so a retry of this execution returns the same order instead of posting a second card. Leave empty to send none.',
				displayOptions: { show: sendCard },
				routing: { send: { preSend: [setIdempotencyKey] } },
			},
			{
				displayName: 'Order',
				name: 'orderId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The order to retrieve',
				displayOptions: { show: { operation: ['getOrder'] } },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select an order...',
						typeOptions: { searchListMethod: 'searchOrders', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. 9b1e2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
						validation: [
							{
								type: 'regex',
								properties: { regex: UUID_PATTERN, errorMessage: 'Not a valid order ID' },
							},
						],
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchTemplates, searchOrders },
	};
}
