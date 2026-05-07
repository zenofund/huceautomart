import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? (process.env.ALLOWED_ORIGIN || "https://huceautos.com").replace(/`/g, "").trim()
        : true,
    credentials: true,
  }),
);
app.use(cookieParser());
// The Paystack webhook MUST be registered with a raw-body parser BEFORE the
// global JSON parser runs — its handler verifies an HMAC signature over the
// raw request bytes. If express.json() parsed it first, req.body would be a
// JS object and signature verification would always fail.
app.use("/api/paystack/webhook", express.raw({ type: "*/*", limit: "1mb" }));
// Body parser limits are intentionally generous: profile/listing flows used
// to inline base64 image data in JSON which trivially blew past the 100kb
// default and caused the server to return HTML 413 pages. Image uploads now
// go through the presigned-URL flow, but we keep a comfortable ceiling so
// any future large JSON payloads (bulk imports, long descriptions, etc.)
// still respond as JSON instead of HTML.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(err.status || 500).json({ error: "Internal Server Error" });
});

export default app;
