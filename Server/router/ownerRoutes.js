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
import { protect } from "../Middlewere/auth.js";
import upload from "../Middlewere/multer.js";

const ownerRouter = express.Router();

ownerRouter.post("/change-role", protect, changeRoleToOwner);
ownerRouter.post("/add-tractor", protect, upload.single("image"), addTractor);
ownerRouter.get("/tractors", protect, getOwnerTractors);
ownerRouter.put("/tractors/:tractorId", protect, updateTractor);
ownerRouter.put("/tractors/:tractorId/availability", protect, toggleTractorAvailability);
ownerRouter.post("/tractors/:tractorId/block-date", protect, toggleDateBlock);
ownerRouter.delete("/tractors/:tractorId", protect, deleteTractor);
ownerRouter.post("/bookings/:bookingId/assign-operator", protect, assignOperator);
ownerRouter.get("/dashboard", protect, getDashboardData);
ownerRouter.post('/update-image', upload.single('image'), protect, updateUserImage);

export default ownerRouter;