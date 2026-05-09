import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./env.js";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";
import { uploadRouter } from "./routes/upload.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Filename"],
    }),
  );

  app.use(express.json());

  app.use(
    "/api/upload/excel",
    express.raw({ type: "*/*", limit: "20mb" }),
  );

  app.use("/api", healthRouter);
  app.use("/api", inventoryRouter);
  app.use("/api", uploadRouter);

  app.use(errorHandler);

  return app;
}
