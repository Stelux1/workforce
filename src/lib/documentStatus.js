// Status dokumenta se računa iz roka važenja (ranije se nigde nije računao — svuda „unknown", QA §9.3 #8).
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

export const EXPIRING_SOON_DAYS = 30;

export function documentStatus(expirationDate, today = new Date()) {
  if (!expirationDate) return "no_expiry";
  const days = differenceInCalendarDays(parseISO(expirationDate), startOfDay(today));
  if (days < 0) return "expired";
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "valid";
}
