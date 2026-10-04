import type { StarterListing } from "./types.js";

/**
 * The base set's place in the marketplace, by starter id. A starter that changes gets its
 * `revision` raised here; a new starter gets a line.
 */
export const STARTER_LISTINGS: Record<string, StarterListing> = {
  tweet: { revision: 1, industries: ["any"], useCases: ["marketing"] },
  "facebook-video-ad": { revision: 1, industries: ["retail", "agency"], useCases: ["marketing"] },
  "property-film": { revision: 1, industries: ["realEstate"], useCases: ["marketing"] },
  "research-briefing": { revision: 1, industries: ["any"], useCases: ["research"] },
  dashboard: { revision: 1, industries: ["any"], useCases: ["research"] },
  invoice: { revision: 1, industries: ["any"], useCases: ["accounting"] },
  offer: { revision: 1, industries: ["any"], useCases: ["sales"] },
  damage: { revision: 1, industries: ["trades", "realEstate"], useCases: ["operations"] },
  "window-offer": { revision: 1, industries: ["trades"], useCases: ["sales"] },
  receipts: { revision: 1, industries: ["any"], useCases: ["accounting"] },
  "menu-plan": {
    revision: 1,
    industries: ["gastronomy", "publicSector"],
    useCases: ["operations"],
  },
  "web-faq": { revision: 1, industries: ["health"], useCases: ["website", "service"] },
  "web-price": { revision: 1, industries: ["trades"], useCases: ["website", "sales"] },
  "web-advisor": { revision: 1, industries: ["retail"], useCases: ["website", "sales"] },
  "web-appointment": {
    revision: 1,
    industries: ["professional"],
    useCases: ["website", "service"],
  },
  "web-complaint": { revision: 1, industries: ["retail"], useCases: ["website", "service"] },
  "web-application": { revision: 1, industries: ["any"], useCases: ["website", "hr"] },
  "web-event": {
    revision: 1,
    industries: ["gastronomy", "events"],
    useCases: ["website", "sales"],
  },
  "web-dayplan": { revision: 1, industries: ["hospitality"], useCases: ["website", "service"] },
  "web-sitecheck": { revision: 1, industries: ["agency"], useCases: ["website", "marketing"] },
  "web-funding": {
    revision: 1,
    industries: ["trades", "professional"],
    useCases: ["website", "sales"],
  },
};
