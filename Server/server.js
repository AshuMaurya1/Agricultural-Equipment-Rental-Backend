import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import userRouter from "./router/userRoutes.js";
import ownerRouter from "./router/ownerRoutes.js";
import bookingRouter from "./router/bookingRoutes.js";
dotenv.config();


// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;
let dbReady = false;

// Security & Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Auth rate limiter to protect against brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: "Too many requests. Please try again after 15 minutes." }
});

app.use("/api/user/login", authLimiter);
app.use("/api/user/register", authLimiter);
app.use("/api/user/forgot-password", authLimiter);

app.get("/", (_req, res) => {res.send("Server is running in development mode by Ashu Maurya");});
app.use("/api/user", userRouter);
app.use("/api/owner", ownerRouter);
app.use("/api/booking", bookingRouter);


app.listen(PORT, () => {
  console.log(`Server is running on Ashu Singh http://localhost:${PORT}`);
});


// Do not block the HTTP server while MongoDB connects. Requests that need the
// database will return an error until the database connection is available.
connectDB()
  .then(() => {
    dbReady = true;
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
  });
