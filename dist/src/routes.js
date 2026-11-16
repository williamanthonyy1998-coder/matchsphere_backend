"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const prisma_1 = require("./lib/prisma");
const env_1 = require("./config/env");
const auth_1 = require("./middleware/auth");
const intents_1 = require("./utils/intents");
const client_1 = require("@prisma/client");
exports.router = (0, express_1.Router)();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error(e);
    if (e?.code === "P2002")
        return res.status(409).json({ success: false, message: "A record with this value already exists." });
    if (e?.name === "ZodError")
        return res.status(400).json({ success: false, message: "Validation failed", errors: e.issues });
    return res.status(500).json({ success: false, message: "Internal server error" });
});
const tokenFor = (user) => jsonwebtoken_1.default.sign({ role: user.role }, env_1.env.jwtSecret, { subject: user.id, expiresIn: env_1.env.jwtExpiresIn });
const publicUser = (u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, countryCode: u.countryCode });
exports.router.post("/auth/register", wrap(async (req, res) => {
    const data = zod_1.z.object({ email: zod_1.z.string().email().max(254), password: zod_1.z.string().min(10).max(100), firstName: zod_1.z.string().min(1).max(80), lastName: zod_1.z.string().max(80).optional(), countryCode: zod_1.z.string().length(2).optional() }).parse(req.body);
    const passwordHash = await bcryptjs_1.default.hash(data.password, 12);
    const user = await prisma_1.prisma.user.create({ data: { ...data, email: data.email.toLowerCase(), passwordHash } });
    res.status(201).json({ success: true, data: { user: publicUser(user), token: tokenFor(user) } });
}));
exports.router.post("/auth/login", wrap(async (req, res) => {
    const data = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string() }).parse(req.body);
    const user = await prisma_1.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user || !(await bcryptjs_1.default.compare(data.password, user.passwordHash)))
        return res.status(401).json({ success: false, message: "Invalid email or password" });
    if (user.status !== "ACTIVE")
        return res.status(403).json({ success: false, message: "Account is not active" });
    res.json({ success: true, data: { user: publicUser(user), token: tokenFor(user) } });
}));
exports.router.get("/auth/me", auth_1.authenticate, wrap(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user)
        return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: publicUser(user) });
}));
exports.router.get("/categories", wrap(async (_req, res) => {
    const categories = await prisma_1.prisma.category.findMany({ where: { isActive: true, parentId: null }, include: { children: true, attributes: true }, orderBy: { sortOrder: "asc" } });
    res.json({ success: true, data: categories });
}));
exports.router.post("/listings", auth_1.authenticate, wrap(async (req, res) => {
    const d = zod_1.z.object({ categoryId: zod_1.z.string().uuid(), intent: zod_1.z.enum(["OFFER", "SERVICE_OFFER", "JOB_OPENING", "PARTNERSHIP_OFFER"]), title: zod_1.z.string().min(4).max(160), description: zod_1.z.string().min(10).max(10000), countryCode: zod_1.z.string().length(2), region: zod_1.z.string().optional(), city: zod_1.z.string().optional(), price: zod_1.z.number().nonnegative().optional(), currency: zod_1.z.string().length(3).optional(), isNegotiable: zod_1.z.boolean().optional(), attributes: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional() }).parse(req.body);
    const listing = await prisma_1.prisma.listing.create({ data: { ...d, ownerId: req.user.id, status: client_1.RecordStatus.PENDING_REVIEW, price: d.price === undefined ? undefined : new client_1.Prisma.Decimal(d.price) } });
    await prisma_1.prisma.auditLog.create({ data: { actorId: req.user.id, action: "LISTING_CREATED", entityType: "Listing", entityId: listing.id } });
    res.status(201).json({ success: true, data: listing });
}));
exports.router.get("/users/me/listings", auth_1.authenticate, wrap(async (req, res) => {
    const rows = await prisma_1.prisma.listing.findMany({ where: { ownerId: req.user.id }, include: { category: true }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: rows });
}));
exports.router.get("/listings", wrap(async (req, res) => {
    const where = { status: client_1.RecordStatus.APPROVED };
    if (typeof req.query.categoryId === "string")
        where.categoryId = req.query.categoryId;
    if (typeof req.query.countryCode === "string")
        where.countryCode = req.query.countryCode.toUpperCase();
    const rows = await prisma_1.prisma.listing.findMany({ where, include: { category: true, owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
    res.json({ success: true, data: rows });
}));
exports.router.post("/requirements", auth_1.authenticate, wrap(async (req, res) => {
    const d = zod_1.z.object({ categoryId: zod_1.z.string().uuid(), intent: zod_1.z.enum(["REQUEST", "SERVICE_REQUEST", "JOB_APPLICATION", "PARTNERSHIP_REQUEST"]), title: zod_1.z.string().min(4).max(160), description: zod_1.z.string().max(10000).optional(), countryCode: zod_1.z.string().length(2), region: zod_1.z.string().optional(), city: zod_1.z.string().optional(), minPrice: zod_1.z.number().nonnegative().optional(), maxPrice: zod_1.z.number().nonnegative().optional(), currency: zod_1.z.preprocess((value) => {
            if (typeof value !== "string" || !value.trim())
                return undefined;
            return value.trim().toUpperCase();
        }, zod_1.z.string().length(3).optional()), attributes: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional() }).parse(req.body);
    if (d.minPrice !== undefined && d.maxPrice !== undefined && d.minPrice > d.maxPrice)
        return res.status(400).json({ success: false, message: "Minimum price cannot exceed maximum price" });
    const row = await prisma_1.prisma.requirement.create({ data: { ...d, ownerId: req.user.id, status: client_1.RecordStatus.PENDING_REVIEW, minPrice: d.minPrice === undefined ? undefined : new client_1.Prisma.Decimal(d.minPrice), maxPrice: d.maxPrice === undefined ? undefined : new client_1.Prisma.Decimal(d.maxPrice) } });
    await prisma_1.prisma.auditLog.create({ data: { actorId: req.user.id, action: "REQUIREMENT_CREATED", entityType: "Requirement", entityId: row.id } });
    res.status(201).json({ success: true, data: row });
}));
exports.router.get("/requirements", auth_1.authenticate, wrap(async (req, res) => {
    const rows = await prisma_1.prisma.requirement.findMany({ where: { ownerId: req.user.id }, include: { category: true }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: rows });
}));
exports.router.post("/requirements/:id/match", auth_1.authenticate, wrap(async (req, res) => {
    const requirement = await prisma_1.prisma.requirement.findFirst({ where: { id: req.params.id, ownerId: req.user.id, status: client_1.RecordStatus.APPROVED } });
    if (!requirement)
        return res.status(404).json({ success: false, message: "Approved requirement not found" });
    const intents = (0, intents_1.compatibleIntents)(requirement.intent);
    const listings = await prisma_1.prisma.listing.findMany({ where: { categoryId: requirement.categoryId, intent: { in: intents }, status: client_1.RecordStatus.APPROVED, ownerId: { not: req.user.id }, countryCode: requirement.countryCode }, take: 200 });
    const results = [];
    for (const listing of listings) {
        let score = 50;
        const matched = ["Category", "Country"];
        if (requirement.city && listing.city) {
            if (requirement.city.toLowerCase() === listing.city.toLowerCase()) {
                score += 20;
                matched.push("City");
            }
            else
                score -= 10;
        }
        if (listing.price !== null && requirement.minPrice !== null && requirement.maxPrice !== null) {
            const p = Number(listing.price);
            const min = Number(requirement.minPrice);
            const max = Number(requirement.maxPrice);
            if (p >= min && p <= max) {
                score += 25;
                matched.push("Budget");
            }
            else if (listing.isNegotiable && p <= max * 1.1)
                score += 10;
            else
                score -= 15;
        }
        else
            score += 5;
        const rAttrs = (requirement.attributes || {});
        const lAttrs = (listing.attributes || {});
        const keys = Object.keys(rAttrs).filter(k => rAttrs[k] !== undefined && rAttrs[k] !== "");
        let attrMatches = 0;
        for (const k of keys)
            if (String(rAttrs[k]).toLowerCase() === String(lAttrs[k] ?? "").toLowerCase())
                attrMatches++;
        if (keys.length)
            score += Math.round(15 * attrMatches / keys.length);
        score = Math.max(0, Math.min(100, score));
        const match = await prisma_1.prisma.match.upsert({ where: { requirementId_listingId: { requirementId: requirement.id, listingId: listing.id } }, update: { score, explanation: { matched, attributeMatches: attrMatches, attributeCount: keys.length } }, create: { requirementId: requirement.id, listingId: listing.id, buyerId: requirement.ownerId, sellerId: listing.ownerId, score, explanation: { matched, attributeMatches: attrMatches, attributeCount: keys.length }, status: client_1.MatchStatus.PENDING_REVIEW } });
        results.push(match);
    }
    res.json({ success: true, data: results.sort((a, b) => Number(b.score) - Number(a.score)), meta: { candidatesChecked: listings.length } });
}));
exports.router.get("/matches", auth_1.authenticate, wrap(async (req, res) => {
    const rows = await prisma_1.prisma.match.findMany({ where: { OR: [{ buyerId: req.user.id }, { sellerId: req.user.id }] }, include: { listing: { select: { id: true, title: true, city: true, countryCode: true, price: true, currency: true } }, requirement: { select: { id: true, title: true, city: true, countryCode: true } } }, orderBy: { score: "desc" } });
    res.json({ success: true, data: rows });
}));
exports.router.get("/admin/listings", auth_1.authenticate, auth_1.requireAdmin, wrap(async (_req, res) => {
    const rows = await prisma_1.prisma.listing.findMany({ where: { status: client_1.RecordStatus.PENDING_REVIEW }, include: { category: true, owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } });
    res.json({ success: true, data: rows });
}));
exports.router.post("/admin/listings/:id/approve", auth_1.authenticate, auth_1.requireAdmin, wrap(async (req, res) => {
    const row = await prisma_1.prisma.listing.update({ where: { id: req.params.id }, data: { status: client_1.RecordStatus.APPROVED } });
    await prisma_1.prisma.auditLog.create({ data: { actorId: req.user.id, action: "LISTING_APPROVED", entityType: "Listing", entityId: row.id } });
    res.json({ success: true, data: row });
}));
exports.router.post("/admin/listings/:id/reject", auth_1.authenticate, auth_1.requireAdmin, wrap(async (req, res) => {
    const row = await prisma_1.prisma.listing.update({ where: { id: req.params.id }, data: { status: client_1.RecordStatus.REJECTED } });
    await prisma_1.prisma.auditLog.create({ data: { actorId: req.user.id, action: "LISTING_REJECTED", entityType: "Listing", entityId: row.id } });
    res.json({ success: true, data: row });
}));
exports.router.get("/admin/requirements", auth_1.authenticate, auth_1.requireAdmin, wrap(async (_req, res) => {
    const rows = await prisma_1.prisma.requirement.findMany({ where: { status: client_1.RecordStatus.PENDING_REVIEW }, include: { category: true, owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } });
    res.json({ success: true, data: rows });
}));
exports.router.post("/admin/requirements/:id/approve", auth_1.authenticate, auth_1.requireAdmin, wrap(async (req, res) => {
    const row = await prisma_1.prisma.requirement.update({ where: { id: req.params.id }, data: { status: client_1.RecordStatus.APPROVED } });
    await prisma_1.prisma.auditLog.create({ data: { actorId: req.user.id, action: "REQUIREMENT_APPROVED", entityType: "Requirement", entityId: row.id } });
    res.json({ success: true, data: row });
}));
exports.router.post("/admin/requirements/:id/reject", auth_1.authenticate, auth_1.requireAdmin, wrap(async (req, res) => {
    const row = await prisma_1.prisma.requirement.update({ where: { id: req.params.id }, data: { status: client_1.RecordStatus.REJECTED } });
    await prisma_1.prisma.auditLog.create({ data: { actorId: req.user.id, action: "REQUIREMENT_REJECTED", entityType: "Requirement", entityId: row.id } });
    res.json({ success: true, data: row });
}));
exports.router.get("/admin/matches", auth_1.authenticate, auth_1.requireAdmin, wrap(async (_req, res) => {
    const rows = await prisma_1.prisma.match.findMany({ where: { status: client_1.MatchStatus.PENDING_REVIEW }, include: { listing: true, requirement: true }, orderBy: { score: "desc" } });
    res.json({ success: true, data: rows });
}));
exports.router.post("/admin/matches/:id/approve", auth_1.authenticate, auth_1.requireAdmin, wrap(async (req, res) => {
    const row = await prisma_1.prisma.match.update({ where: { id: req.params.id }, data: { status: client_1.MatchStatus.APPROVED } });
    res.json({ success: true, data: row });
}));
exports.router.post("/admin/matches/:id/reject", auth_1.authenticate, auth_1.requireAdmin, wrap(async (req, res) => {
    const row = await prisma_1.prisma.match.update({ where: { id: req.params.id }, data: { status: client_1.MatchStatus.REJECTED } });
    res.json({ success: true, data: row });
}));
exports.router.post("/matches/:id/invite", auth_1.authenticate, wrap(async (req, res) => {
    const match = await prisma_1.prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match || (match.buyerId !== req.user.id && match.sellerId !== req.user.id))
        return res.status(404).json({ success: false, message: "Match not found" });
    if (match.status !== client_1.MatchStatus.APPROVED && match.status !== client_1.MatchStatus.INVITED)
        return res.status(409).json({ success: false, message: "Match must be approved before invitations" });
    const existing = await prisma_1.prisma.connection.findUnique({ where: { matchId: match.id } });
    if (existing)
        return res.status(409).json({ success: false, message: "Connection invitation already exists" });
    const connection = await prisma_1.prisma.connection.create({ data: { matchId: match.id, participants: { create: [{ userId: match.buyerId }, { userId: match.sellerId }] } }, include: { participants: true } });
    await prisma_1.prisma.match.update({ where: { id: match.id }, data: { status: client_1.MatchStatus.INVITED } });
    res.status(201).json({ success: true, data: connection });
}));
exports.router.get("/connections", auth_1.authenticate, wrap(async (req, res) => {
    const rows = await prisma_1.prisma.connection.findMany({ where: { participants: { some: { userId: req.user.id } } }, include: { participants: { select: { userId: true, acceptedAt: true, declinedAt: true } }, match: { include: { listing: { select: { title: true, city: true, countryCode: true } }, requirement: { select: { title: true, city: true, countryCode: true } } } } }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: rows });
}));
exports.router.post("/connections/:id/accept", auth_1.authenticate, wrap(async (req, res) => {
    const participant = await prisma_1.prisma.connectionParticipant.findFirst({ where: { connectionId: req.params.id, userId: req.user.id } });
    if (!participant)
        return res.status(404).json({ success: false, message: "Invitation not found" });
    if (participant.declinedAt)
        return res.status(409).json({ success: false, message: "Invitation was declined" });
    await prisma_1.prisma.connectionParticipant.update({ where: { id: participant.id }, data: { acceptedAt: new Date() } });
    const participants = await prisma_1.prisma.connectionParticipant.findMany({ where: { connectionId: req.params.id } });
    const allAccepted = participants.length === 2 && participants.every(p => p.id === participant.id || p.acceptedAt !== null);
    const connection = await prisma_1.prisma.connection.update({ where: { id: req.params.id }, data: { status: allAccepted ? client_1.ConnectionStatus.ACTIVE : client_1.ConnectionStatus.PARTIALLY_ACCEPTED } });
    if (allAccepted)
        await prisma_1.prisma.match.update({ where: { id: connection.matchId }, data: { status: client_1.MatchStatus.CONNECTED } });
    res.json({ success: true, data: { status: connection.status, mutualConsentComplete: allAccepted } });
}));
exports.router.post("/connections/:id/decline", auth_1.authenticate, wrap(async (req, res) => {
    const p = await prisma_1.prisma.connectionParticipant.findFirst({ where: { connectionId: req.params.id, userId: req.user.id } });
    if (!p)
        return res.status(404).json({ success: false, message: "Invitation not found" });
    await prisma_1.prisma.connectionParticipant.update({ where: { id: p.id }, data: { declinedAt: new Date() } });
    const row = await prisma_1.prisma.connection.update({ where: { id: req.params.id }, data: { status: client_1.ConnectionStatus.DECLINED } });
    res.json({ success: true, data: row });
}));
exports.router.get("/deals", auth_1.authenticate, wrap(async (req, res) => {
    const rows = await prisma_1.prisma.deal.findMany({ where: { connection: { participants: { some: { userId: req.user.id } } } }, include: { commissionAgreements: true } });
    res.json({ success: true, data: rows });
}));
exports.router.post("/connections/:id/deals", auth_1.authenticate, wrap(async (req, res) => {
    const member = await prisma_1.prisma.connectionParticipant.findFirst({ where: { connectionId: req.params.id, userId: req.user.id, acceptedAt: { not: null }, declinedAt: null }, include: { connection: true } });
    if (!member || member.connection.status !== client_1.ConnectionStatus.ACTIVE)
        return res.status(403).json({ success: false, message: "An active mutually accepted connection is required" });
    const d = zod_1.z.object({ title: zod_1.z.string().min(3).max(160), dealValue: zod_1.z.number().nonnegative().optional(), currency: zod_1.z.string().length(3).optional() }).parse(req.body);
    const deal = await prisma_1.prisma.deal.create({ data: { connectionId: req.params.id, createdById: req.user.id, ...d, dealValue: d.dealValue === undefined ? undefined : new client_1.Prisma.Decimal(d.dealValue) } });
    res.status(201).json({ success: true, data: deal });
}));
exports.router.post("/deals/:id/commission-agreements", auth_1.authenticate, wrap(async (req, res) => {
    const deal = await prisma_1.prisma.deal.findFirst({ where: { id: req.params.id, connection: { participants: { some: { userId: req.user.id, acceptedAt: { not: null } } } } } });
    if (!deal)
        return res.status(404).json({ success: false, message: "Deal not found" });
    const d = zod_1.z.object({ calculationType: zod_1.z.enum(["PERCENTAGE", "FIXED"]), percentage: zod_1.z.number().min(0).max(100).optional(), fixedAmount: zod_1.z.number().nonnegative().optional(), currency: zod_1.z.string().length(3), termsVersion: zod_1.z.string().min(1), payerId: zod_1.z.string().uuid() }).parse(req.body);
    if (d.calculationType === "PERCENTAGE" && d.percentage === undefined)
        return res.status(400).json({ success: false, message: "Percentage is required" });
    if (d.calculationType === "FIXED" && d.fixedAmount === undefined)
        return res.status(400).json({ success: false, message: "Fixed amount is required" });
    const row = await prisma_1.prisma.commissionAgreement.create({ data: { dealId: deal.id, payerId: d.payerId, calculationType: d.calculationType, percentage: d.percentage, fixedAmount: d.fixedAmount, currency: d.currency, termsVersion: d.termsVersion, status: client_1.CommissionStatus.DRAFT } });
    res.status(201).json({ success: true, data: row });
}));
