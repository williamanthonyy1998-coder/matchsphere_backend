"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compatibleIntents = compatibleIntents;
const client_1 = require("@prisma/client");
const compatible = {
    REQUEST: [client_1.ListingIntent.OFFER],
    SERVICE_REQUEST: [client_1.ListingIntent.SERVICE_OFFER],
    JOB_APPLICATION: [client_1.ListingIntent.JOB_OPENING],
    PARTNERSHIP_REQUEST: [client_1.ListingIntent.PARTNERSHIP_OFFER]
};
function compatibleIntents(requirementIntent) { return compatible[requirementIntent] || []; }
