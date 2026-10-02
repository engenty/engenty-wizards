import { canSpend } from "../billing/credits.js";
import { ServiceError } from "./errors.js";

export async function requireCredits(userId: string) {
  if (!(await canSpend(userId))) {
    throw new ServiceError("no_credits", "Dein Guthaben ist aufgebraucht.");
  }
}
