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

        // Throttle session lastActiveAt update to once every 5 minutes to prevent DB write amplification
        const now = Date.now();
        const lastActive = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0;
        if (now - lastActive > 5 * 60 * 1000) {
            session.lastActiveAt = new Date(now);
            User.updateOne(
                { _id: userId, 'sessions.sessionId': sessionId },
                { $set: { 'sessions.$.lastActiveAt': session.lastActiveAt } }
            ).catch((err) => console.error('Failed to update session activity:', err.message));
        }

        req.session = session;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges' });
    }
    next();
};

export default protect;
