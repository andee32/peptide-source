import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

// A bare cors() answers every origin with `*`, which turns any page the user
// visits into a client for /api/orders/:id and /api/admin/*. Restrict to an
// explicit allowlist; CORS_ORIGINS is comma-separated, and dev falls back to
// the local storefront origins.
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOrigins =
  allowedOrigins.length > 0
    ? allowedOrigins
    : process.env.NODE_ENV === "production"
      ? []
      : DEV_ORIGINS;

app.use(
  cors({
    // Same-origin and non-browser callers send no Origin header — those are not
    // CORS requests at all, so let them through untouched.
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);

// Webhook signatures cover the exact bytes the provider sent, so these routes
// keep the raw buffer alongside the parsed body. express.json() below would
// otherwise consume the stream and leave only a re-serialised approximation.
for (const path of ["/api/webhooks/btcpay", "/api/webhooks/linkmoney"]) {
  app.use(
    path,
    express.raw({ type: "application/json" }),
    (req: Request, _res: Response, next: NextFunction) => {
      if (Buffer.isBuffer(req.body)) {
        (req as Request & { rawBody: Buffer }).rawBody = req.body;
        try {
          req.body = JSON.parse(req.body.toString("utf8"));
        } catch {
          req.body = {};
        }
      }
      next();
    }
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
