"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("../src/app"));
// Vercel serverless entry: export the Express app as the request handler.
// Do not call app.listen() here — local listening stays in src/server.ts.
exports.default = app_1.default;
