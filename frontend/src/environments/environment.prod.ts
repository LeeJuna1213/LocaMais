const runtimeConfig = globalThis as typeof globalThis & { __LOCAMAIS_API_URL__?: string };
const configuredApiUrl = runtimeConfig.__LOCAMAIS_API_URL__?.trim();

export const environment = {
  production: true,
  // Can be set by the host page before Angular loads when the API has a
  // different public origin. Same-origin /api is the production default.
  apiUrl: configuredApiUrl || `${globalThis.location?.origin ?? ''}/api`,
};
