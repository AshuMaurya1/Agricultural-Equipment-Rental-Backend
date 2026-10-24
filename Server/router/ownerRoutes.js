import express from "express";
import { 
    addTractor, 
    changeRoleToOwner, 
    deleteTractor, 
    updateTractor, 
    getDashboardData, 
    getOwnerTractors, 
    toggleTractorAvailability, 
    updateUserImage,
    toggleDateBlock,
    assignOperator
} from "../controllers/ownerController.js";
import { protect, requireRole } from "../middleware/auth.js";
import upload from "../middleware/multer.js";

const ownerRouter = express.Router();

// Role transition
ownerRouter.post("/change-role", protect, changeRoleToOwner);

// Profile image update - ensure protect runs BEFORE upload to prevent unauthenticated disk writes
ownerRouter.post('/update-image', protect, upload.single('image'), updateUserImage);

// Owner-only tractor management routes
ownerRouter.post("/add-tractor", protect, requireRole('owner'), upload.single("image"), addTractor);
ownerRouter.get("/tractors", protect, requireRole('owner'), getOwnerTractors);
ownerRouter.put("/tractors/:tractorId", protect, requireRole('owner'), updateTractor);
ownerRouter.put("/tractors/:tractorId/availability", protect, requireRole('owner'), toggleTractorAvailability);
ownerRouter.post("/tractors/:tractorId/block-date", protect, requireRole('owner'), toggleDateBlock);
ownerRouter.delete("/tractors/:tractorId", protect, requireRole('owner'), deleteTractor);
ownerRouter.post("/bookings/:bookingId/assign-operator", protect, requireRole('owner'), assignOperator);
ownerRouter.get("/dashboard", protect, requireRole('owner'), getDashboardData);

export default ownerRouter;