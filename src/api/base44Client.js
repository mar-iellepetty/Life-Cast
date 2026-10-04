// Compatibility facade for the recreated UI; credentials stay on the local server.
import { assistant, intake } from './lifecastApi.js';
let saved = null;
export const base44 = {
  entities: { Scenario: {
    filter: async () => ({ items: saved ? [saved] : [] }),
    create: async (payload) => { saved = { ...payload, id: crypto.randomUUID() }; return saved; },
    update: async (id, payload) => { saved = { ...payload, id }; return saved; },
  } },
  functions: { invoke: async (name, payload) => {
    if (name === 'parseLifeSituation') return { data: await intake(payload.text) };
    if (name === 'lifecastAssistant') return { data: await assistant(payload) };
    throw new Error(`Unsupported LifeCast function: ${name}`);
  } },
};
