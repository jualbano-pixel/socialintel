import { brand24Provider } from './brand24';
import { talkwalkerProvider, TalkwalkerError } from './talkwalker';

const providers = { brand24: brand24Provider, talkwalker: talkwalkerProvider };
export function providerId(value = process.env.PROVIDER || 'talkwalker') { const id = String(value).toLowerCase(); return providers[id] ? id : 'talkwalker'; }
export function getProvider(value) { return providers[providerId(value)]; }
export function providerDescriptor(value) { const provider = getProvider(value); return { id: provider.id, name: provider.name, capabilities: provider.capabilities }; }
export { TalkwalkerError };
