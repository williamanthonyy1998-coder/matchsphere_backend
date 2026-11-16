"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./lib/prisma");
const server = app_1.app.listen(env_1.env.port, () => console.log(`MatchSphere API listening on http://localhost:${env_1.env.port}`));
async function shutdown() { console.log("Shutting down..."); server.close(); await prisma_1.prisma.$disconnect(); process.exit(0); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
