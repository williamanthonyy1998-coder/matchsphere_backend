import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { router } from "./routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean), credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) =>
  res.json({
    success: true,
    service: "matchsphere-api",
    message: "MatchSphere API",
    health: "/health",
    apiBase: "/api/v1"
  })
);
app.get("/health", (_req, res) =>
  res.json({
    success: true,
    service: "matchsphere-api",
    status: "healthy",
    timestamp: new Date().toISOString()
  })
);
app.use("/api/v1", router);
app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));

export default app;
