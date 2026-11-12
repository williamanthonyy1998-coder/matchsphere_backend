import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

declare global { namespace Express { interface Request { user?: { id: string; role: string } } } }
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as { sub: string; role: string };
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch { return res.status(401).json({ success: false, message: "Invalid or expired token" }); }
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ success: false, message: "Administrator access required" });
  next();
}
