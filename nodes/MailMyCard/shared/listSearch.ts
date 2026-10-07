import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';

async function apiGet(
	this: ILoadOptionsFunctions,
	path: string,
	qs: IDataObject = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('mailMyCardApi');
	return (await this.helpers.httpRequestWithAuthentication.call(this, 'mailMyCardApi', {
		method: 'GET',
		url: `${credentials.baseUrl}${path}`,
		qs,
		json: true,
	})) as IDataObject;
}

const matches = (filter: string | undefined, ...texts: Array<unknown>) =>
	!filter ||
	texts.some((text) =>
		String(text ?? '')
			.toLowerCase()
			.includes(filter.toLowerCase()),
	);

/** Saved templates for the Template picker, newest first, filtered by name. */
export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await apiGet.call(this, '/templates');
	const templates = (response.templates as IDataObject[] | undefined) ?? [];
	const results: INodeListSearchItems[] = templates
		.filter((template) => matches(filter, template.name, template.summary))
		.map((template) => ({
			name: template.summary ? `${template.name} (${template.summary})` : String(template.name),
			value: String(template.id),
		}));
	return { results };
}

/** Recent orders for the Order picker, a page of 25 at a time. */
export async function searchOrders(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const offset = paginationToken ? Number(paginationToken) : 0;
	const response = await apiGet.call(this, '/orders', { limit: 25, offset });
	const orders = (response.orders as IDataObject[] | undefined) ?? [];
	const results: INodeListSearchItems[] = orders
		.map((order) => {
			const recipient = (order.recipient as IDataObject | undefined) ?? {};
			return { order, recipient };
		})
		.filter(({ order, recipient }) => matches(filter, order.id, recipient.name, order.statusLabel))
		.map(({ order, recipient }) => ({
			name: `${recipient.name ?? 'Unknown recipient'} (${order.statusLabel ?? order.status}, ${String(order.createdAt ?? '').slice(0, 10)})`,
			value: String(order.id),
		}));
	const next =
		response.hasMore && typeof response.nextOffset === 'number'
			? String(response.nextOffset)
			: undefined;
	return { results, paginationToken: next };
}
