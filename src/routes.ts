import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "./lib/prisma";
import { env } from "./config/env";
import { authenticate, requireAdmin } from "./middleware/auth";
import { compatibleIntents } from "./utils/intents";
import { Prisma, RecordStatus, MatchStatus, ConnectionStatus, DealStatus, CommissionStatus } from "@prisma/client";

export const router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => fn(req, res).catch((e: any) => {
  console.error(e);
  if (e?.code === "P2002") return res.status(409).json({ success: false, message: "A record with this value already exists." });
  if (e?.name === "ZodError") return res.status(400).json({ success: false, message: "Validation failed", errors: e.issues });
  return res.status(500).json({ success: false, message: "Internal server error" });
});
const tokenFor = (user: { id: string; role: string }) => jwt.sign({ role: user.role }, env.jwtSecret, { subject: user.id, expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
const publicUser = (u: any) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, countryCode: u.countryCode });

router.post("/auth/register", wrap(async (req, res) => {
  const data = z.object({ email: z.string().email().max(254), password: z.string().min(10).max(100), firstName: z.string().min(1).max(80), lastName: z.string().max(80).optional(), countryCode: z.string().length(2).optional() }).parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({ data: { ...data, email: data.email.toLowerCase(), passwordHash } });
  res.status(201).json({ success: true, data: { user: publicUser(user), token: tokenFor(user) } });
}));
router.post("/auth/login", wrap(async (req, res) => {
  const data = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ success: false, message: "Invalid email or password" });
  if (user.status !== "ACTIVE") return res.status(403).json({ success: false, message: "Account is not active" });
  res.json({ success: true, data: { user: publicUser(user), token: tokenFor(user) } });
}));
router.get("/auth/me", authenticate, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, data: publicUser(user) });
}));
router.get("/categories", wrap(async (_req, res) => {
  const categories = await prisma.category.findMany({ where: { isActive: true, parentId: null }, include: { children: true, attributes: true }, orderBy: { sortOrder: "asc" } });
  res.json({ success: true, data: categories });
}));
router.post("/listings", authenticate, wrap(async (req, res) => {
  const d = z.object({ categoryId: z.string().uuid(), intent: z.enum(["OFFER", "SERVICE_OFFER", "JOB_OPENING", "PARTNERSHIP_OFFER"]), title: z.string().min(4).max(160), description: z.string().min(10).max(10000), countryCode: z.string().length(2), region: z.string().optional(), city: z.string().optional(), price: z.number().nonnegative().optional(), currency: z.string().length(3).optional(), isNegotiable: z.boolean().optional(), attributes: z.record(z.string(), z.any()).optional() }).parse(req.body);
  const listing = await prisma.listing.create({ data: { ...d, ownerId: req.user!.id, status: RecordStatus.PENDING_REVIEW, price: d.price === undefined ? undefined : new Prisma.Decimal(d.price) } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "LISTING_CREATED", entityType: "Listing", entityId: listing.id } });
  res.status(201).json({ success: true, data: listing });
}));
router.get("/users/me/listings", authenticate, wrap(async (req, res) => {
  const rows = await prisma.listing.findMany({ where: { ownerId: req.user!.id }, include: { category: true }, orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: rows });
}));
router.get("/listings", wrap(async (req, res) => {
  const where: Prisma.ListingWhereInput = { status: RecordStatus.APPROVED };
  if (typeof req.query.categoryId === "string") where.categoryId = req.query.categoryId;
  if (typeof req.query.countryCode === "string") where.countryCode = req.query.countryCode.toUpperCase();
  const rows = await prisma.listing.findMany({ where, include: { category: true, owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ success: true, data: rows });
}));
router.post("/requirements", authenticate, wrap(async (req, res) => {
  const d = z.object({ categoryId: z.string().uuid(), intent: z.enum(["REQUEST", "SERVICE_REQUEST", "JOB_APPLICATION", "PARTNERSHIP_REQUEST"]), title: z.string().min(4).max(160), description: z.string().max(10000).optional(), countryCode: z.string().length(2), region: z.string().optional(), city: z.string().optional(), minPrice: z.number().nonnegative().optional(), maxPrice: z.number().nonnegative().optional(), currency: z.preprocess(
    (value) => {
      if (typeof value !== "string" || !value.trim()) return undefined;
      return value.trim().toUpperCase();
    },
    z.string().length(3).optional()
  ), attributes: z.record(z.string(), z.any()).optional() }).parse(req.body);
  if (d.minPrice !== undefined && d.maxPrice !== undefined && d.minPrice > d.maxPrice) return res.status(400).json({ success: false, message: "Minimum price cannot exceed maximum price" });
  const row = await prisma.requirement.create({ data: { ...d, ownerId: req.user!.id, status: RecordStatus.PENDING_REVIEW, minPrice: d.minPrice === undefined ? undefined : new Prisma.Decimal(d.minPrice), maxPrice: d.maxPrice === undefined ? undefined : new Prisma.Decimal(d.maxPrice) } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "REQUIREMENT_CREATED", entityType: "Requirement", entityId: row.id } });
  res.status(201).json({ success: true, data: row });
}));
router.get("/requirements", authenticate, wrap(async (req, res) => {
  const rows = await prisma.requirement.findMany({ where: { ownerId: req.user!.id }, include: { category: true }, orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: rows });
}));
router.post("/requirements/:id/match", authenticate, wrap(async (req, res) => {
  const requirement = await prisma.requirement.findFirst({ where: { id: req.params.id, ownerId: req.user!.id, status: RecordStatus.APPROVED } });
  if (!requirement) return res.status(404).json({ success: false, message: "Approved requirement not found" });
  const intents = compatibleIntents(requirement.intent);
  const listings = await prisma.listing.findMany({ where: { categoryId: requirement.categoryId, intent: { in: intents }, status: RecordStatus.APPROVED, ownerId: { not: req.user!.id }, countryCode: requirement.countryCode }, take: 200 });
  const results = [];
  for (const listing of listings) {
    let score = 50; const matched: string[] = ["Category", "Country"];
    if (requirement.city && listing.city) { if (requirement.city.toLowerCase() === listing.city.toLowerCase()) { score += 20; matched.push("City"); } else score -= 10; }
    if (listing.price !== null && requirement.minPrice !== null && requirement.maxPrice !== null) {
      const p = Number(listing.price); const min = Number(requirement.minPrice); const max = Number(requirement.maxPrice);
      if (p >= min && p <= max) { score += 25; matched.push("Budget"); }
      else if (listing.isNegotiable && p <= max * 1.1) score += 10;
      else score -= 15;
    } else score += 5;
    const rAttrs = (requirement.attributes || {}) as Record<string, unknown>;
    const lAttrs = (listing.attributes || {}) as Record<string, unknown>;
    const keys = Object.keys(rAttrs).filter(k => rAttrs[k] !== undefined && rAttrs[k] !== "");
    let attrMatches = 0;
    for (const k of keys) if (String(rAttrs[k]).toLowerCase() === String(lAttrs[k] ?? "").toLowerCase()) attrMatches++;
    if (keys.length) score += Math.round(15 * attrMatches / keys.length);
    score = Math.max(0, Math.min(100, score));
    const match = await prisma.match.upsert({ where: { requirementId_listingId: { requirementId: requirement.id, listingId: listing.id } }, update: { score, explanation: { matched, attributeMatches: attrMatches, attributeCount: keys.length } }, create: { requirementId: requirement.id, listingId: listing.id, buyerId: requirement.ownerId, sellerId: listing.ownerId, score, explanation: { matched, attributeMatches: attrMatches, attributeCount: keys.length }, status: MatchStatus.PENDING_REVIEW } });
    results.push(match);
  }
  res.json({ success: true, data: results.sort((a,b) => Number(b.score) - Number(a.score)), meta: { candidatesChecked: listings.length } });
}));
router.get("/matches", authenticate, wrap(async (req, res) => {
  const rows = await prisma.match.findMany({ where: { OR: [{ buyerId: req.user!.id }, { sellerId: req.user!.id }] }, include: { listing: { select: { id: true, title: true, city: true, countryCode: true, price: true, currency: true } }, requirement: { select: { id: true, title: true, city: true, countryCode: true } } }, orderBy: { score: "desc" } });
  res.json({ success: true, data: rows });
}));
router.get("/admin/listings", authenticate, requireAdmin, wrap(async (_req, res) => {
  const rows = await prisma.listing.findMany({ where: { status: RecordStatus.PENDING_REVIEW }, include: { category: true, owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } });
  res.json({ success: true, data: rows });
}));
router.post("/admin/listings/:id/approve", authenticate, requireAdmin, wrap(async (req, res) => {
  const row = await prisma.listing.update({ where: { id: req.params.id }, data: { status: RecordStatus.APPROVED } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "LISTING_APPROVED", entityType: "Listing", entityId: row.id } });
  res.json({ success: true, data: row });
}));
router.post("/admin/listings/:id/reject", authenticate, requireAdmin, wrap(async (req, res) => {
  const row = await prisma.listing.update({ where: { id: req.params.id }, data: { status: RecordStatus.REJECTED } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "LISTING_REJECTED", entityType: "Listing", entityId: row.id } });
  res.json({ success: true, data: row });
}));
router.get("/admin/requirements", authenticate, requireAdmin, wrap(async (_req, res) => {
  const rows = await prisma.requirement.findMany({ where: { status: RecordStatus.PENDING_REVIEW }, include: { category: true, owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } });
  res.json({ success: true, data: rows });
}));
router.post("/admin/requirements/:id/approve", authenticate, requireAdmin, wrap(async (req, res) => {
  const row = await prisma.requirement.update({ where: { id: req.params.id }, data: { status: RecordStatus.APPROVED } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "REQUIREMENT_APPROVED", entityType: "Requirement", entityId: row.id } });
  res.json({ success: true, data: row });
}));
router.post("/admin/requirements/:id/reject", authenticate, requireAdmin, wrap(async (req, res) => {
  const row = await prisma.requirement.update({ where: { id: req.params.id }, data: { status: RecordStatus.REJECTED } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "REQUIREMENT_REJECTED", entityType: "Requirement", entityId: row.id } });
  res.json({ success: true, data: row });
}));
router.get("/admin/matches", authenticate, requireAdmin, wrap(async (_req, res) => {
  const rows = await prisma.match.findMany({ where: { status: MatchStatus.PENDING_REVIEW }, include: { listing: true, requirement: true }, orderBy: { score: "desc" } });
  res.json({ success: true, data: rows });
}));
router.post("/admin/matches/:id/approve", authenticate, requireAdmin, wrap(async (req, res) => {
  const row = await prisma.match.update({ where: { id: req.params.id }, data: { status: MatchStatus.APPROVED } });
  res.json({ success: true, data: row });
}));
router.post("/admin/matches/:id/reject", authenticate, requireAdmin, wrap(async (req, res) => {
  const row = await prisma.match.update({ where: { id: req.params.id }, data: { status: MatchStatus.REJECTED } });
  res.json({ success: true, data: row });
}));
router.post("/matches/:id/invite", authenticate, wrap(async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match || (match.buyerId !== req.user!.id && match.sellerId !== req.user!.id)) return res.status(404).json({ success: false, message: "Match not found" });
  if (![MatchStatus.APPROVED, MatchStatus.INVITED].includes(match.status)) return res.status(409).json({ success: false, message: "Match must be approved before invitations" });
  const existing = await prisma.connection.findUnique({ where: { matchId: match.id } });
  if (existing) return res.status(409).json({ success: false, message: "Connection invitation already exists" });
  const connection = await prisma.connection.create({ data: { matchId: match.id, participants: { create: [{ userId: match.buyerId }, { userId: match.sellerId }] } }, include: { participants: true } });
  await prisma.match.update({ where: { id: match.id }, data: { status: MatchStatus.INVITED } });
  res.status(201).json({ success: true, data: connection });
}));
router.get("/connections", authenticate, wrap(async (req, res) => {
  const rows = await prisma.connection.findMany({ where: { participants: { some: { userId: req.user!.id } } }, include: { participants: { select: { userId: true, acceptedAt: true, declinedAt: true } }, match: { include: { listing: { select: { title: true, city: true, countryCode: true } }, requirement: { select: { title: true, city: true, countryCode: true } } } } }, orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: rows });
}));
router.post("/connections/:id/accept", authenticate, wrap(async (req, res) => {
  const participant = await prisma.connectionParticipant.findFirst({ where: { connectionId: req.params.id, userId: req.user!.id } });
  if (!participant) return res.status(404).json({ success: false, message: "Invitation not found" });
  if (participant.declinedAt) return res.status(409).json({ success: false, message: "Invitation was declined" });
  await prisma.connectionParticipant.update({ where: { id: participant.id }, data: { acceptedAt: new Date() } });
  const participants = await prisma.connectionParticipant.findMany({ where: { connectionId: req.params.id } });
  const allAccepted = participants.length === 2 && participants.every(p => p.id === participant.id || p.acceptedAt !== null);
  const connection = await prisma.connection.update({ where: { id: req.params.id }, data: { status: allAccepted ? ConnectionStatus.ACTIVE : ConnectionStatus.PARTIALLY_ACCEPTED } });
  if (allAccepted) await prisma.match.update({ where: { id: connection.matchId }, data: { status: MatchStatus.CONNECTED } });
  res.json({ success: true, data: { status: connection.status, mutualConsentComplete: allAccepted } });
}));
router.post("/connections/:id/decline", authenticate, wrap(async (req, res) => {
  const p = await prisma.connectionParticipant.findFirst({ where: { connectionId: req.params.id, userId: req.user!.id } });
  if (!p) return res.status(404).json({ success: false, message: "Invitation not found" });
  await prisma.connectionParticipant.update({ where: { id: p.id }, data: { declinedAt: new Date() } });
  const row = await prisma.connection.update({ where: { id: req.params.id }, data: { status: ConnectionStatus.DECLINED } });
  res.json({ success: true, data: row });
}));
router.get("/deals", authenticate, wrap(async (req, res) => {
  const rows = await prisma.deal.findMany({ where: { connection: { participants: { some: { userId: req.user!.id } } } }, include: { commissionAgreements: true } });
  res.json({ success: true, data: rows });
}));
router.post("/connections/:id/deals", authenticate, wrap(async (req, res) => {
  const member = await prisma.connectionParticipant.findFirst({ where: { connectionId: req.params.id, userId: req.user!.id, acceptedAt: { not: null }, declinedAt: null }, include: { connection: true } });
  if (!member || member.connection.status !== ConnectionStatus.ACTIVE) return res.status(403).json({ success: false, message: "An active mutually accepted connection is required" });
  const d = z.object({ title: z.string().min(3).max(160), dealValue: z.number().nonnegative().optional(), currency: z.string().length(3).optional() }).parse(req.body);
  const deal = await prisma.deal.create({ data: { connectionId: req.params.id, createdById: req.user!.id, ...d, dealValue: d.dealValue === undefined ? undefined : new Prisma.Decimal(d.dealValue) } });
  res.status(201).json({ success: true, data: deal });
}));
router.post("/deals/:id/commission-agreements", authenticate, wrap(async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, connection: { participants: { some: { userId: req.user!.id, acceptedAt: { not: null } } } } } });
  if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
  const d = z.object({ calculationType: z.enum(["PERCENTAGE", "FIXED"]), percentage: z.number().min(0).max(100).optional(), fixedAmount: z.number().nonnegative().optional(), currency: z.string().length(3), termsVersion: z.string().min(1), payerId: z.string().uuid() }).parse(req.body);
  if (d.calculationType === "PERCENTAGE" && d.percentage === undefined) return res.status(400).json({ success: false, message: "Percentage is required" });
  if (d.calculationType === "FIXED" && d.fixedAmount === undefined) return res.status(400).json({ success: false, message: "Fixed amount is required" });
  const row = await prisma.commissionAgreement.create({ data: { dealId: deal.id, payerId: d.payerId, calculationType: d.calculationType, percentage: d.percentage, fixedAmount: d.fixedAmount, currency: d.currency, termsVersion: d.termsVersion, status: CommissionStatus.DRAFT } });
  res.status(201).json({ success: true, data: row });
}));
