import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
const server = app.listen(env.port, () => console.log(`MatchSphere API listening on http://localhost:${env.port}`));
async function shutdown() { console.log("Shutting down..."); server.close(); await prisma.$disconnect(); process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
