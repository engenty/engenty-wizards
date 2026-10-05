/**
 * What the app shows for now. Off: the parts whose service is not there yet — built-in
 * connectors without an OAuth client, and the link to the product's own site (CLOUD_URL does not
 * resolve). The account is on: its service is there, and a local install links to it under
 * Settings → Account.
 */
export const features = {
  account: true,
  unsetConnectors: false,
  site: false,
} as const;
