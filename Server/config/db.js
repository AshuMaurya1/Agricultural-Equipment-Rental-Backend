import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const username = process.env.MONGODB_USERNAME?.trim();
    const password = process.env.MONGODB_PASSWORD?.trim();
    const uri = process.env.MONGODB_URI?.trim();

    if (!uri && (!username || !password)) {
      throw new Error("Set MONGODB_URI or both MONGODB_USERNAME and MONGODB_PASSWORD in Server/.env");
    }

    const finalUri = uri || `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@cluster0.fjmhgli.mongodb.net`;

    await mongoose.connect(finalUri, { dbName: "tractor_rental" });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    throw error;
  }
};

export default connectDB;
