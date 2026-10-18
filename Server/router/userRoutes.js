import express from "express";
import { 
    loginUser, 
    registerUser, 
    getUserData, 
    getAllTractors, 
    addReview, 
    getTractorReviews,
    refreshSession,
    logoutUser,
    getSessions,
    revokeSession,
    logoutAllDevices,
    verifyLoginTwoFactor,
    requestEmailVerification,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor,
    getAuditLogs
} from "../controllers/userController.js";
import { protect } from '../Middlewere/auth.js';

const userRouter = express.Router(); 

userRouter.post('/register', registerUser);
userRouter.post('/login', loginUser);
userRouter.post('/login/2fa', verifyLoginTwoFactor);
userRouter.post('/refresh', refreshSession);
userRouter.post('/forgot-password', requestPasswordReset);
userRouter.post('/reset-password', resetPassword);
userRouter.post('/verify-email', verifyEmail);
userRouter.post('/logout', protect, logoutUser);
userRouter.post('/logout-all', protect, logoutAllDevices);
userRouter.post('/email-verification', protect, requestEmailVerification);
userRouter.post('/2fa/setup', protect, setupTwoFactor);
userRouter.post('/2fa/enable', protect, enableTwoFactor);
userRouter.post('/2fa/disable', protect, disableTwoFactor);
userRouter.get('/sessions', protect, getSessions);
userRouter.get('/audit-logs', protect, getAuditLogs);
userRouter.delete('/sessions/:sessionId', protect, revokeSession);
userRouter.get('/data', protect, getUserData); 
userRouter.get('/tractors', getAllTractors);
userRouter.post('/review', protect, addReview);
userRouter.get('/reviews/:tractorId', getTractorReviews);

export default userRouter;
