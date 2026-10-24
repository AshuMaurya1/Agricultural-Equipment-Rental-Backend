import express from "express";
import { 
    checkTractorAvailability, 
    createBooking, 
    getOwnerBookings, 
    getUserBookings, 
    updateBookingStatus 
} from "../controllers/bookingController.js";
import { protect, requireRole } from "../middleware/auth.js";

const bookingRouter = express.Router();

bookingRouter.post('/check-availability', checkTractorAvailability);
bookingRouter.post('/create', protect, createBooking);
bookingRouter.get('/user', protect, getUserBookings);
bookingRouter.get('/owner', protect, requireRole('owner'), getOwnerBookings);
bookingRouter.post('/change-status', protect, updateBookingStatus);

export default bookingRouter;
