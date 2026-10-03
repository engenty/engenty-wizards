/**
 * What the app shows for now. Off: the parts whose service is not there yet — the account
 * (ACCOUNT_URL does not resolve), built-in connectors without an OAuth client, and the link to
 * the product's own site (CLOUD_URL does not resolve).
 */
export const features = {
  account: false,
  unsetConnectors: false,
  site: false,
} as const;
