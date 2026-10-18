import User from '../models/User.js';
import Tractor from '../models/tractor.js';
import Review from '../models/Review.js';
import AuditLog from '../models/AuditLog.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateSecret, generateURI, verify } from 'otplib';
import { sendSecurityEmail } from '../utils/email.js';
import {
    clearRefreshCookie,
    createAccessToken,
    createOneTimeToken,
    createRefreshToken,
    createSessionId,
    getClientIp,
    getDeviceName,
    getRefreshExpiry,
    hashToken,
    encryptSecret,
    decryptSecret,
    readRefreshToken,
    setRefreshCookie
} from '../utils/sessionAuth.js';

const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';
const audit = (user, action, req, details = {}) => AuditLog.create({
    user: user._id,
    action,
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent') || '',
    details
}).catch((error) => console.error('Audit log failed:', error.message));

const sendVerificationEmail = async (user, token) => {
    const url = `${clientUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    await sendSecurityEmail({
        to: user.email,
        subject: 'Verify your TractorHub email address',
        text: `Verify your email address: ${url}`,
        html: `<p>Verify your TractorHub email address:</p><p><a href="${url}">Verify email</a></p>`
    });
};

const issueSession = async (user, req, res) => {
    const refreshToken = createRefreshToken();
    const userAgent = req.get('user-agent') || '';
    const deviceName = getDeviceName(userAgent);
    const activeSessions = (user.sessions || []).filter((session) => !session.revokedAt);
    const suspicious = activeSessions.length > 0 && !activeSessions.some((session) => session.userAgent === userAgent);
    const sessionId = createSessionId();

    user.sessions.push({
        sessionId,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: getRefreshExpiry(),
        deviceName,
        userAgent,
        ipAddress: getClientIp(req),
        suspicious
    });
    await user.save();
    setRefreshCookie(res, refreshToken);
    await audit(user, 'login', req, { sessionId, deviceName, suspicious });

    if (suspicious) {
        await sendSecurityEmail({
            to: user.email,
            subject: 'New device sign-in detected',
            text: `A new sign-in to your TractorHub account was detected from ${deviceName} at ${getClientIp(req)}. If this was not you, change your password and log out all devices.`,
            html: `<p>A new sign-in to your TractorHub account was detected from <strong>${deviceName}</strong> at ${getClientIp(req)}.</p><p>If this was not you, change your password and log out all devices.</p>`
        });
    }

    return { token: createAccessToken(user._id.toString(), sessionId), sessionId, suspiciousLogin: suspicious };
};

// Register User
export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password || password.length < 8) {
            return res.json({ success: false, message: 'Please fill all fields and use a password with at least 8 characters.' });
        }
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.json({ success: false, message: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: hashedPassword });
        const verificationToken = createOneTimeToken();
        user.emailVerificationTokenHash = hashToken(verificationToken);
        user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();
        await sendVerificationEmail(user, verificationToken);
        const session = await issueSession(user, req, res);
        res.json({ success: true, ...session });
        
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Login User
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: 'User does not exist' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        if (user.twoFactor?.enabled) {
            const challengeToken = jwt.sign({ userId: user._id.toString(), purpose: 'two-factor-login' }, process.env.JWT_SECRET, { expiresIn: '5m' });
            return res.json({ success: true, requiresTwoFactor: true, challengeToken });
        }
        const session = await issueSession(user, req, res);
        res.json({ success: true, ...session });
    } catch(error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Rotate a refresh token. A replayed/unknown refresh token revokes all sessions as a safety measure.
export const refreshSession = async (req, res) => {
    try {
        const refreshToken = readRefreshToken(req);
        if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token is required' });

        const tokenHash = hashToken(refreshToken);
        const user = await User.findOne({
            $or: [
                { 'sessions.refreshTokenHash': tokenHash },
                { 'sessions.previousRefreshTokenHash': tokenHash }
            ]
        });
        const session = user?.sessions?.find((item) => item.refreshTokenHash === tokenHash);
        const isReplay = user?.sessions?.some((item) => item.previousRefreshTokenHash === tokenHash);
        if (!user || !session || session.revokedAt || session.expiresAt < new Date()) {
            if (user) {
                user.sessions.forEach((item) => {
                    if (!item.revokedAt) {
                        item.revokedAt = new Date();
                        item.revocationReason = isReplay ? 'Refresh token replay detected' : 'Session expired';
                    }
                });
                await user.save();
            }
            clearRefreshCookie(res);
            return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
        }

        const nextRefreshToken = createRefreshToken();
        session.previousRefreshTokenHash = session.refreshTokenHash;
        session.refreshTokenHash = hashToken(nextRefreshToken);
        session.expiresAt = getRefreshExpiry();
        session.lastActiveAt = new Date();
        session.ipAddress = getClientIp(req);
        await user.save();
        setRefreshCookie(res, nextRefreshToken);
        return res.json({ success: true, token: createAccessToken(user._id.toString(), session.sessionId), sessionId: session.sessionId });
    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ success: false, message: 'Could not refresh session' });
    }
};

export const logoutUser = async (req, res) => {
    try {
        req.session.revokedAt = new Date();
        req.session.revocationReason = 'Signed out';
        await req.user.save();
        await audit(req.user, 'logout', req, { sessionId: req.session.sessionId });
        clearRefreshCookie(res);
        res.json({ success: true, message: 'Signed out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSessions = async (req, res) => {
    const sessions = (req.user.sessions || []).map(({ sessionId, deviceName, ipAddress, createdAt, lastActiveAt, revokedAt, suspicious }) => ({
        sessionId, deviceName, ipAddress, createdAt, lastActiveAt, revokedAt, suspicious, current: sessionId === req.session.sessionId
    }));
    res.json({ success: true, sessions });
};

export const revokeSession = async (req, res) => {
    const session = req.user.sessions?.find((item) => item.sessionId === req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    session.revokedAt = new Date();
    session.revocationReason = 'Revoked by user';
    await req.user.save();
    await audit(req.user, 'session_revoked', req, { sessionId: session.sessionId });
    if (session.sessionId === req.session.sessionId) clearRefreshCookie(res);
    res.json({ success: true, message: 'Device signed out' });
};

export const logoutAllDevices = async (req, res) => {
    req.user.sessions.forEach((session) => {
        if (!session.revokedAt) { session.revokedAt = new Date(); session.revocationReason = 'Signed out from all devices'; }
    });
    await req.user.save();
    await audit(req.user, 'logout_all_devices', req);
    clearRefreshCookie(res);
    res.json({ success: true, message: 'Signed out from all devices' });
};

// Get User Data using Token (JWT)
export const getUserData = async (req, res) => {
    try {
        const user = req.user.toObject();
        delete user.password;
        delete user.sessions;
        delete user.emailVerificationTokenHash;
        delete user.emailVerificationExpiresAt;
        delete user.passwordResetTokenHash;
        delete user.passwordResetExpiresAt;
        delete user.twoFactor;
        res.json({ success: true, user: { ...user, twoFactorEnabled: Boolean(req.user.twoFactor?.enabled) } });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

export const verifyLoginTwoFactor = async (req, res) => {
    try {
        const { challengeToken, code } = req.body;
        const challenge = jwt.verify(challengeToken, process.env.JWT_SECRET);
        if (challenge.purpose !== 'two-factor-login' || !code) throw new Error('Invalid sign-in request');
        const user = await User.findById(challenge.userId);
        if (!user?.twoFactor?.enabled) throw new Error('Two-factor authentication is unavailable');
        const result = await verify({ secret: decryptSecret(user.twoFactor.secretEncrypted), token: code, epochTolerance: 30 });
        if (!result.valid) return res.status(401).json({ success: false, message: 'Invalid authentication code' });
        const session = await issueSession(user, req, res);
        res.json({ success: true, ...session });
    } catch {
        res.status(401).json({ success: false, message: 'Two-factor sign-in expired or invalid' });
    }
};

export const requestEmailVerification = async (req, res) => {
    if (req.user.emailVerified) return res.json({ success: true, message: 'Email is already verified' });
    const token = createOneTimeToken();
    req.user.emailVerificationTokenHash = hashToken(token);
    req.user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await req.user.save();
    await sendVerificationEmail(req.user, token);
    await audit(req.user, 'email_verification_requested', req);
    res.json({ success: true, message: 'Verification email sent' });
};

export const verifyEmail = async (req, res) => {
    const user = await User.findOne({
        emailVerificationTokenHash: hashToken(req.body?.token || ''),
        emailVerificationExpiresAt: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ success: false, message: 'Verification link is invalid or expired' });
    user.emailVerified = true;
    user.emailVerificationTokenHash = '';
    user.emailVerificationExpiresAt = null;
    await user.save();
    await audit(user, 'email_verified', req);
    res.json({ success: true, message: 'Email verified successfully' });
};

export const requestPasswordReset = async (req, res) => {
    const email = req.body?.email?.trim().toLowerCase();
    const user = email ? await User.findOne({ email }) : null;
    if (user) {
        const token = createOneTimeToken();
        user.passwordResetTokenHash = hashToken(token);
        user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();
        const url = `${clientUrl()}/reset-password?token=${encodeURIComponent(token)}`;
        await sendSecurityEmail({ to: user.email, subject: 'Reset your TractorHub password', text: `Reset your password: ${url}`, html: `<p><a href="${url}">Reset password</a>. This link expires in one hour.</p>` });
        await audit(user, 'password_reset_requested', req);
    }
    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
};

export const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ success: false, message: 'Use a password with at least 8 characters' });
    const user = await User.findOne({ passwordResetTokenHash: hashToken(token || ''), passwordResetExpiresAt: { $gt: new Date() } });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link is invalid or expired' });
    user.password = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    user.sessions.forEach((session) => { if (!session.revokedAt) { session.revokedAt = new Date(); session.revocationReason = 'Password reset'; } });
    await user.save();
    await audit(user, 'password_reset_completed', req);
    res.json({ success: true, message: 'Password reset. Please sign in again.' });
};

export const setupTwoFactor = async (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Two-factor authentication is available to owners only' });
    const secret = generateSecret();
    req.user.twoFactor.pendingSecretEncrypted = encryptSecret(secret);
    req.user.twoFactor.pendingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();
    const uri = generateURI({ issuer: 'TractorHub', label: req.user.email, secret });
    res.json({ success: true, secret, uri, message: 'Add this key to your authenticator app, then confirm the code.' });
};

export const enableTwoFactor = async (req, res) => {
    const { code } = req.body;
    if (!req.user.twoFactor?.pendingSecretEncrypted || req.user.twoFactor.pendingExpiresAt < new Date()) return res.status(400).json({ success: false, message: 'Start two-factor setup again' });
    const secret = decryptSecret(req.user.twoFactor.pendingSecretEncrypted);
    const result = await verify({ secret, token: code, epochTolerance: 30 });
    if (!result.valid) return res.status(400).json({ success: false, message: 'Invalid authentication code' });
    req.user.twoFactor = { enabled: true, secretEncrypted: encryptSecret(secret), pendingSecretEncrypted: '', pendingExpiresAt: null };
    await req.user.save();
    await audit(req.user, 'two_factor_enabled', req);
    res.json({ success: true, message: 'Two-factor authentication enabled' });
};

export const disableTwoFactor = async (req, res) => {
    const { code } = req.body;
    if (!req.user.twoFactor?.enabled) return res.status(400).json({ success: false, message: 'Two-factor authentication is not enabled' });
    const result = await verify({ secret: decryptSecret(req.user.twoFactor.secretEncrypted), token: code, epochTolerance: 30 });
    if (!result.valid) return res.status(400).json({ success: false, message: 'Invalid authentication code' });
    req.user.twoFactor = { enabled: false, secretEncrypted: '', pendingSecretEncrypted: '', pendingExpiresAt: null };
    await req.user.save();
    await audit(req.user, 'two_factor_disabled', req);
    res.json({ success: true, message: 'Two-factor authentication disabled' });
};

export const getAuditLogs = async (req, res) => {
    const logs = await AuditLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).select('action ipAddress details createdAt');
    res.json({ success: true, logs });
};

const defaultImplements = [
    { name: "Rotavator (42-blades)", pricePerDay: 500, pricePerHour: 150, pricePerAcre: 300 },
    { name: "Cultivator / Harrow (9-tyne)", pricePerDay: 300, pricePerHour: 100, pricePerAcre: 200 },
    { name: "MB Reversible Plough", pricePerDay: 400, pricePerHour: 120, pricePerAcre: 250 },
    { name: "Heavy Duty Tipping Trolley", pricePerDay: 600, pricePerHour: 180, pricePerAcre: 350 }
];

export const getAllTractors = async (req, res) => {
    try {
        const rawTractors = await Tractor.find({ isAvailable: true })
            .populate({ path: 'owner', select: 'name email phone' })
            .sort({ createdAt: -1 });

        // Ensure default implements, unit rates and driver specs if not set
        const tractors = rawTractors.map((t) => {
            const doc = t._doc || t;
            return {
                ...doc,
                implementsAvailable: (doc.implementsAvailable && doc.implementsAvailable.length > 0)
                    ? doc.implementsAvailable
                    : defaultImplements,
                driverAvailable: doc.driverAvailable ?? true,
                driverDailyRate: doc.driverDailyRate ?? 500,
                driverHourlyRate: doc.driverHourlyRate ?? 100,
                horsePower: doc.horsePower ?? 50,
                pricePerHour: doc.pricePerHour ?? 600,
                pricePerAcre: doc.pricePerAcre ?? 1200,
                transportRatePerKm: doc.transportRatePerKm ?? 40,
                blockedDates: doc.blockedDates || [],
                rating: doc.rating ?? 4.8,
                ratingCount: doc.ratingCount ?? 1
            };
        });

        res.json({ success: true, tractors });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Add a Review for a Tractor
export const addReview = async (req, res) => {
    try {
        const { _id } = req.user;
        const { tractorId, bookingId, rating, comment } = req.body;

        if (!tractorId || !rating || !comment) {
            return res.status(400).json({ success: false, message: 'Rating and review comment are required' });
        }

        const review = await Review.create({
            tractor: tractorId,
            user: _id,
            booking: bookingId,
            rating: Number(rating),
            comment: comment.trim()
        });

        // Recalculate average rating for tractor
        const reviews = await Review.find({ tractor: tractorId });
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

        await Tractor.findByIdAndUpdate(tractorId, {
            rating: Number(avg.toFixed(1)),
            ratingCount: reviews.length
        });

        res.json({ success: true, message: 'Review submitted successfully', review });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all reviews for a Tractor
export const getTractorReviews = async (req, res) => {
    try {
        const { tractorId } = req.params;
        const reviews = await Review.find({ tractor: tractorId })
            .populate({ path: 'user', select: 'name image' })
            .sort({ createdAt: -1 });

        res.json({ success: true, reviews });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
