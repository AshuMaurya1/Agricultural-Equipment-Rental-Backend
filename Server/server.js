import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import multer from "multer";
import connectDB from "./config/db.js";
import userRouter from "./router/userRoutes.js";
import ownerRouter from "./router/ownerRoutes.js";
import bookingRouter from "./router/bookingRoutes.js";

dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Trust first proxy (required for correct client IP detection behind reverse proxies like Vercel, Render, Cloudflare)
app.set("trust proxy", 1);

// Helper to normalize origins (strip trailing slashes and normalize casing)
const normalizeOrigin = (url = "") => url.trim().replace(/\/+$/, "").toLowerCase();

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://agricultural-equipment-rental.vercel.app",
];

const envAllowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((url) => normalizeOrigin(url))
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([...defaultAllowedOrigins.map(normalizeOrigin), ...envAllowedOrigins])
);

// Security & Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header (health checks, server-to-server calls, mobile apps) are allowed
      if (!origin) {
        return callback(null, true);
      }

      const normalizedRequestOrigin = normalizeOrigin(origin);

      // Check exact match
      if (allowedOrigins.includes(normalizedRequestOrigin)) {
        return callback(null, true);
      }

      // Check if it's a Vercel preview deployment for this project
      if (
        normalizedRequestOrigin.startsWith("https://agricultural-equipment-rental") &&
        normalizedRequestOrigin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      // Instead of throwing an unhandled 500 Error, pass false to cleanly deny CORS headers
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Refresh-Token", "Accept"]
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Dynamic DB readiness check middleware for API requests
app.use("/api", (req, res, next) => {
  // readyState 1 means connected
  if (mongoose.connection.readyState !== 1) {
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
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts. Please try again after 15 minutes." }
});

app.use("/api/user/login", authLimiter);
app.use("/api/user/login/2fa", authLimiter);
app.use("/api/user/register", authLimiter);
app.use("/api/user/forgot-password", authLimiter);
app.use("/api/user/reset-password", authLimiter);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get("/", (_req, res) => {
  res.send("Server is running in development mode by Ashu Maurya");
});

// API Routes
app.use("/api/user", userRouter);
app.use("/api/owner", ownerRouter);
app.use("/api/booking", bookingRouter);

// 404 Handler for Unknown Routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Centralized Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message || err);

  if (res.headersSent) {
    return next(err);
  }

  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File size exceeds the 5 MB limit" });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }

  // Handle custom file filter errors
  if (err.message && err.message.includes("Only JPEG, PNG, and WebP images are allowed")) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Handle JSON parse syntax errors from bad requests
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Malformed JSON payload in request body" });
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId format)
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: `Invalid identifier format for ${err.path}` });
  }

  // Handle Mongoose ValidationError
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") || "Validation failed" });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use by another process.`);
    console.error(`To free port ${PORT} on Windows:`);
    console.error(`  netstat -ano | findstr :${PORT}`);
    console.error(`  taskkill /PID <PID> /F`);
  } else {
    console.error("Server error:", error);
  }
  process.exit(1);
});

// Process-level unhandled rejection handlers
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

// Graceful shutdown handling
const handleGracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down server...`);
  server.close(async () => {
    try {
      await mongoose.connection.close(false);
      console.log("MongoDB connection closed.");
    } catch (err) {
      console.error("Error closing MongoDB connection:", err);
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));

// Connect to MongoDB
connectDB().catch((error) => {
  console.error("Initial database connection failed:", error.message);
});

export default app;
