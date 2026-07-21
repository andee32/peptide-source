import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors());

app.use(
  "/api/webhooks/btcpay",
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
