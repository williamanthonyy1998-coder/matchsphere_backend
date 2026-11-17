"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const required = ["DATABASE_URL", "JWT_SECRET"];
for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
    }
}
if ((process.env.JWT_SECRET || "").length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
}
/** Local Vite / common local frontend ports */
const LOCAL_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000"
];
/** Known production MatchSphere frontend on Vercel */
const PRODUCTION_FRONTEND_ORIGINS = [
    "https://matchspheredashboard-dist.vercel.app"
];
function parseCorsOrigins(raw) {
    const fromEnv = (raw ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    return [...new Set([...LOCAL_DEV_ORIGINS, ...PRODUCTION_FRONTEND_ORIGINS, ...fromEnv])];
}
exports.env = {
    port: Number(process.env.PORT || 5000),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
    /** Allowed browser origins for credentialed CORS (never `*`). */
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN)
};
