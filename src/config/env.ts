import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "JWT_SECRET"] as const;

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

function parseCorsOrigins(raw?: string): string[] {
  const fromEnv = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...LOCAL_DEV_ORIGINS, ...PRODUCTION_FRONTEND_ORIGINS, ...fromEnv])];
}

export const env = {
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  /** Allowed browser origins for credentialed CORS (never `*`). */
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN)
};
