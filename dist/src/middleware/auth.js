"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
        return res.status(401).json({ success: false, message: "Authentication required" });
    try {
        const payload = jsonwebtoken_1.default.verify(header.slice(7), env_1.env.jwtSecret);
        req.user = { id: payload.sub, role: payload.role };
        next();
    }
    catch {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
}
function requireAdmin(req, res, next) {
    if (req.user?.role !== "ADMIN")
        return res.status(403).json({ success: false, message: "Administrator access required" });
    next();
}
