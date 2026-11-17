import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

// Local/long-running process entry only. Vercel uses api/index.ts and must not call listen().
const server = app.listen(env.port, () => {
  console.log(`MatchSphere API listening on http://localhost:${env.port}`);
});

async function shutdown() {
  console.log("Shutting down...");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
