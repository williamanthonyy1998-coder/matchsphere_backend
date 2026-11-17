"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const routes_1 = require("./routes");
exports.app = (0, express_1.default)();
// CORS must run before routes/auth so preflight OPTIONS is never blocked.
// Helmet CORP must be cross-origin: this API is consumed by a separate frontend origin.
exports.app.use((0, cors_1.default)({
    origin: env_1.env.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
}));
exports.app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
exports.app.use(express_1.default.json({ limit: "2mb" }));
exports.app.get("/", (_req, res) => res.json({
    success: true,
    service: "matchsphere-api",
    message: "MatchSphere API",
    health: "/health",
    apiBase: "/api/v1"
}));
exports.app.get("/health", (_req, res) => res.json({
    success: true,
    service: "matchsphere-api",
    status: "healthy",
    timestamp: new Date().toISOString()
}));
exports.app.use("/api/v1", routes_1.router);
exports.app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));
// Ensure JSON error responses still leave the CORS middleware's headers intact.
exports.app.use((err, _req, res, _next) => {
    console.error(err);
    if (res.headersSent)
        return;
    res.status(500).json({ success: false, message: "Internal server error" });
});
exports.default = exports.app;
