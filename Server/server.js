import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import userRouter from "./router/userRoutes.js";
import ownerRouter from "./router/ownerRoutes.js";
import bookingRouter from "./router/bookingRoutes.js";

dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;
let dbReady = false;

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "https://agricultural-equipment-rental.vercel.app",
];
const allowedOrigins = [
  ...defaultAllowedOrigins,
  ...(process.env.CLIENT_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
];

// Security & Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header (health checks, server-to-server calls) are allowed.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

// Readiness check middleware for API requests
app.use("/api", (req, res, next) => {
  if (!dbReady) {
    return res.status(503).json({
      success: false,
      message: "Database is connecting. Please retry in a few seconds."
    });
  }
  next();
});

// Auth rate limiter to protect against brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: "Too many requests. Please try again after 15 minutes." }
});

app.use("/api/user/login", authLimiter);
app.use("/api/user/register", authLimiter);
app.use("/api/user/forgot-password", authLimiter);

app.get("/", (_req, res) => {
  res.send("Server is running in development mode by Ashu Maurya");
});

app.use("/api/user", userRouter);
app.use("/api/owner", ownerRouter);
app.use("/api/booking", bookingRouter);

// Centralized Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Connect to MongoDB asynchronously
connectDB()
  .then(() => {
    dbReady = true;
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
  });
