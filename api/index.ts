import app from "../src/app";

// Vercel serverless entry: export the Express app as the request handler.
// Do not call app.listen() here — local listening stays in src/server.ts.
export default app;
