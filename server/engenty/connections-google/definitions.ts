import type { ConnectorDefinition } from "../shims/connections-sdk.js";
import { calendarConnector } from "./connectors/calendar.js";
import { contactsConnector } from "./connectors/contacts.js";
import { driveConnector } from "./connectors/drive.js";
import { gmailConnector } from "./connectors/gmail.js";

/** All connectors this module registers, in registration order. */
export const googleConnectors: ConnectorDefinition[] = [
  gmailConnector,
  driveConnector,
  calendarConnector,
  contactsConnector,
];
