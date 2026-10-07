import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/** An API key from the MailMyCard dashboard; every request carries it as a bearer token. */
export class MailMyCardApi implements ICredentialType {
	name = 'mailMyCardApi';

	displayName = 'MailMyCard API';

	icon: Icon = { light: 'file:../icons/mailmycard.svg', dark: 'file:../icons/mailmycard.dark.svg' };

	documentationUrl = 'https://mailmycard.com/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'From the MailMyCard dashboard, Developers, API keys. Looks like mmc_live_… (or mmc_test_… for a test key).',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://mailmycard.com/api/v1',
			description: 'Change only to point at a staging server',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				'User-Agent': 'n8n (n8n-nodes-mailmycard)',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
			method: 'GET',
		},
	};
}
