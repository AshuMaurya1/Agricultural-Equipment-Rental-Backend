import mongoose from "mongoose";

mongoose.connection.on("connected", () => {
  console.log("MongoDB connection established successfully");
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Waiting for reconnection...");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error.message);
});

const connectDB = async (retries = 5, delayMs = 3000) => {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, { 
        dbName: "tractor_rental",
        serverSelectionTimeoutMS: 10000
      });
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt < retries) {
        console.log(`Retrying MongoDB connection in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
};

export default connectDB;
