import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { router } from "./routes";

export const app = express();

// CORS must run before routes/auth so preflight OPTIONS is never blocked.
// Helmet CORP must be cross-origin: this API is consumed by a separate frontend origin.
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
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

// Ensure JSON error responses still leave the CORS middleware's headers intact.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: "Internal server error" });
});

export default app;
