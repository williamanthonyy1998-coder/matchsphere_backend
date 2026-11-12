import { ListingIntent } from "@prisma/client";
const compatible: Record<string, ListingIntent[]> = {
  REQUEST: [ListingIntent.OFFER],
  SERVICE_REQUEST: [ListingIntent.SERVICE_OFFER],
  JOB_APPLICATION: [ListingIntent.JOB_OPENING],
  PARTNERSHIP_REQUEST: [ListingIntent.PARTNERSHIP_OFFER]
};
export function compatibleIntents(requirementIntent: ListingIntent) { return compatible[requirementIntent] || []; }
