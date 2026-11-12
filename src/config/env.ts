import dotenv from "dotenv";
dotenv.config();
const required = ["DATABASE_URL", "JWT_SECRET"] as const;
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
if ((process.env.JWT_SECRET || "").length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173"
};
