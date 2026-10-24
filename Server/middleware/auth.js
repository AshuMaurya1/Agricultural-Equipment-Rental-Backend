import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No authorization' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { userId, sessionId } = decoded;

        if (!userId || !sessionId) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        req.user = await User.findById(userId).select('-password');
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not found or session expired' });
        }
        const session = req.user.sessions?.find((item) => item.sessionId === sessionId);
        if (!session || session.revokedAt) {
            return res.status(401).json({ success: false, message: 'This session has been revoked' });
        }
        session.lastActiveAt = new Date();
        await req.user.save();
        req.session = session;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

export default protect;
