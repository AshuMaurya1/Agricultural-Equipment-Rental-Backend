import mongoose from 'mongoose';
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

const clientUrl = () => process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';

const audit = (user, action, req, details = {}) => AuditLog.create({
    user: user?._id,
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

const sanitizeUser = (user) => {
    const doc = user.toObject ? user.toObject() : { ...user };
    delete doc.password;
    delete doc.sessions;
    delete doc.emailVerificationTokenHash;
    delete doc.emailVerificationExpiresAt;
    delete doc.passwordResetTokenHash;
    delete doc.passwordResetExpiresAt;
    delete doc.twoFactor;
    return {
        ...doc,
        twoFactorEnabled: Boolean(user.twoFactor?.enabled)
    };
};

const issueSession = async (user, req, res) => {
    const refreshToken = createRefreshToken();
    const userAgent = req.get('user-agent') || '';
    const deviceName = getDeviceName(userAgent);
    
    // Prune revoked or expired sessions older than 30 days to prevent document bloat
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    user.sessions = (user.sessions || []).filter((s) => {
        if (!s.revokedAt && s.expiresAt && new Date(s.expiresAt) > new Date()) return true;
        if (s.revokedAt && new Date(s.revokedAt) > thirtyDaysAgo) return true;
        return false;
    });

    const activeSessions = user.sessions.filter((session) => !session.revokedAt);
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

    return { 
        token: createAccessToken(user._id.toString(), sessionId), 
        refreshToken,
        sessionId, 
        suspiciousLogin: suspicious,
        user: sanitizeUser(user)
    };
};

// Register User
export const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
        }

        const userExists = await User.findOne({ email: cleanEmail });
        if (userExists) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({ 
            name: name.trim(), 
            email: cleanEmail, 
            password: hashedPassword,
            phone: phone ? String(phone).trim() : ''
        });

        const verificationToken = createOneTimeToken();
        user.emailVerificationTokenHash = hashToken(verificationToken);
        user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        // Send verification email asynchronously
        sendVerificationEmail(user, verificationToken).catch((err) => 
            console.error('Email verification send failed:', err.message)
        );

        const session = await issueSession(user, req, res);
        res.status(201).json({ success: true, message: 'Registration successful', ...session });
        
    } catch (error) {
        console.error('registerUser error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Login User
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (user.twoFactor?.enabled) {
            const challengeToken = jwt.sign(
                { userId: user._id.toString(), purpose: 'two-factor-login' }, 
                process.env.JWT_SECRET, 
                { expiresIn: '5m' }
            );
            return res.json({ success: true, requiresTwoFactor: true, challengeToken });
        }

        const session = await issueSession(user, req, res);
        res.json({ success: true, message: 'Login successful', ...session });
    } catch (error) {
        console.error('loginUser error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Rotate a refresh token
export const refreshSession = async (req, res) => {
    try {
        const refreshToken = readRefreshToken(req);
        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token is required' });
        }

        const tokenHash = hashToken(refreshToken);
        const user = await User.findOne({
            $or: [
                { 'sessions.refreshTokenHash': tokenHash },
                { 'sessions.previousRefreshTokenHash': tokenHash }
            ]
        });

        const session = user?.sessions?.find((item) => item.refreshTokenHash === tokenHash);
        const isReplay = user?.sessions?.some((item) => item.previousRefreshTokenHash === tokenHash);

        if (!user || !session || session.revokedAt || (session.expiresAt && session.expiresAt < new Date())) {
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
        return res.json({ 
            success: true, 
            token: createAccessToken(user._id.toString(), session.sessionId), 
            refreshToken: nextRefreshToken,
            sessionId: session.sessionId,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('refreshSession error:', error.message);
        return res.status(500).json({ success: false, message: 'Could not refresh session' });
    }
};

export const logoutUser = async (req, res) => {
    try {
        if (req.session) {
            req.session.revokedAt = new Date();
            req.session.revocationReason = 'Signed out';
            await req.user.save();
            await audit(req.user, 'logout', req, { sessionId: req.session.sessionId });
        }
        clearRefreshCookie(res);
        res.json({ success: true, message: 'Signed out successfully' });
    } catch (error) {
        console.error('logoutUser error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSessions = async (req, res) => {
    const sessions = (req.user.sessions || []).map(({ sessionId, deviceName, ipAddress, createdAt, lastActiveAt, revokedAt, suspicious }) => ({
        sessionId, deviceName, ipAddress, createdAt, lastActiveAt, revokedAt, suspicious, current: sessionId === req.session?.sessionId
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
    if (session.sessionId === req.session?.sessionId) clearRefreshCookie(res);
    res.json({ success: true, message: 'Device signed out' });
};

export const logoutAllDevices = async (req, res) => {
    req.user.sessions.forEach((session) => {
        if (!session.revokedAt) { 
            session.revokedAt = new Date(); 
            session.revocationReason = 'Signed out from all devices'; 
        }
    });
    await req.user.save();
    await audit(req.user, 'logout_all_devices', req);
    clearRefreshCookie(res);
    res.json({ success: true, message: 'Signed out from all devices' });
};

// Get User Data using Token (JWT)
export const getUserData = async (req, res) => {
    try {
        res.json({ success: true, user: sanitizeUser(req.user) });
    } catch (error) {
        console.error('getUserData error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update User Profile (Name, Phone)
export const updateUserProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const updates = {};
        if (name && name.trim()) updates.name = name.trim();
        if (phone !== undefined) updates.phone = String(phone).trim();

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true }
        ).select('-password -sessions -twoFactor');

        res.json({ success: true, message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        console.error('updateUserProfile error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyLoginTwoFactor = async (req, res) => {
    try {
        const { challengeToken, code } = req.body;
        if (!challengeToken || !code) {
            return res.status(400).json({ success: false, message: 'Verification code is required' });
        }

        const challenge = jwt.verify(challengeToken, process.env.JWT_SECRET);
        if (challenge.purpose !== 'two-factor-login') throw new Error('Invalid sign-in request');

        const user = await User.findById(challenge.userId);
        if (!user?.twoFactor?.enabled) throw new Error('Two-factor authentication is unavailable');

        const secret = decryptSecret(user.twoFactor.secretEncrypted);
        const result = await verify({ secret, token: String(code).trim(), epochTolerance: 30 });
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
    const token = req.body?.token?.trim();
    if (!token) {
        return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const user = await User.findOne({
        emailVerificationTokenHash: hashToken(token),
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
        await sendSecurityEmail({ 
            to: user.email, 
            subject: 'Reset your TractorHub password', 
            text: `Reset your password: ${url}`, 
            html: `<p><a href="${url}">Reset password</a>. This link expires in one hour.</p>` 
        });
        await audit(user, 'password_reset_requested', req);
    }
    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
};

export const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Reset token is required' });
    if (!password || password.length < 8) return res.status(400).json({ success: false, message: 'Password must have at least 8 characters' });

    const user = await User.findOne({ 
        passwordResetTokenHash: hashToken(token.trim()), 
        passwordResetExpiresAt: { $gt: new Date() } 
    });

    if (!user) return res.status(400).json({ success: false, message: 'Reset link is invalid or expired' });
    user.password = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    user.sessions.forEach((session) => { 
        if (!session.revokedAt) { 
            session.revokedAt = new Date(); 
            session.revocationReason = 'Password reset'; 
        } 
    });
    await user.save();
    await audit(user, 'password_reset_completed', req);
    res.json({ success: true, message: 'Password reset successfully. Please sign in with your new password.' });
};

export const setupTwoFactor = async (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Two-factor authentication is available to equipment owners only' });
    const secret = generateSecret();
    req.user.twoFactor.pendingSecretEncrypted = encryptSecret(secret);
    req.user.twoFactor.pendingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();
    const uri = generateURI({ issuer: 'TractorHub', label: req.user.email, secret });
    res.json({ success: true, secret, uri, message: 'Add this key to your authenticator app, then confirm the code.' });
};

export const enableTwoFactor = async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Verification code is required' });
    if (!req.user.twoFactor?.pendingSecretEncrypted || req.user.twoFactor.pendingExpiresAt < new Date()) {
        return res.status(400).json({ success: false, message: 'Two-factor setup has expired. Please start again.' });
    }
    const secret = decryptSecret(req.user.twoFactor.pendingSecretEncrypted);
    const result = await verify({ secret, token: String(code).trim(), epochTolerance: 30 });
    if (!result.valid) return res.status(400).json({ success: false, message: 'Invalid authentication code' });
    req.user.twoFactor = { enabled: true, secretEncrypted: encryptSecret(secret), pendingSecretEncrypted: '', pendingExpiresAt: null };
    await req.user.save();
    await audit(req.user, 'two_factor_enabled', req);
    res.json({ success: true, message: 'Two-factor authentication enabled successfully' });
};

export const disableTwoFactor = async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Verification code is required' });
    if (!req.user.twoFactor?.enabled) return res.status(400).json({ success: false, message: 'Two-factor authentication is not currently enabled' });
    const secret = decryptSecret(req.user.twoFactor.secretEncrypted);
    const result = await verify({ secret, token: String(code).trim(), epochTolerance: 30 });
    if (!result.valid) return res.status(400).json({ success: false, message: 'Invalid authentication code' });
    req.user.twoFactor = { enabled: false, secretEncrypted: '', pendingSecretEncrypted: '', pendingExpiresAt: null };
    await req.user.save();
    await audit(req.user, 'two_factor_disabled', req);
    res.json({ success: true, message: 'Two-factor authentication disabled' });
};

export const getAuditLogs = async (req, res) => {
    const logs = await AuditLog.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('action ipAddress details createdAt');
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
        const { category, district, block, search } = req.query;
        const query = { isAvailable: true };

        if (category && category !== 'All') {
            query.category = { $regex: new RegExp(category.trim(), 'i') };
        }
        if (district && district !== 'All') {
            query.district = { $regex: new RegExp(district.trim(), 'i') };
        }
        if (block && block !== 'All') {
            query.block = { $regex: new RegExp(block.trim(), 'i') };
        }
        if (search && search.trim()) {
            const escaped = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
            query.$or = [
                { brand: { $regex: new RegExp(escaped, 'i') } },
                { model: { $regex: new RegExp(escaped, 'i') } },
                { location: { $regex: new RegExp(escaped, 'i') } },
                { description: { $regex: new RegExp(escaped, 'i') } }
            ];
        }

        const rawTractors = await Tractor.find(query)
            .populate({ path: 'owner', select: 'name email phone' })
            .sort({ createdAt: -1 })
            .lean();

        // Ensure default implements, unit rates and driver specs if not set
        const tractors = rawTractors.map((doc) => ({
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
        }));

        res.json({ success: true, count: tractors.length, tractors });
    } catch (error) {
        console.error('getAllTractors error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Add a Review for a Tractor
export const addReview = async (req, res) => {
    try {
        const { _id } = req.user;
        const { tractorId, bookingId, rating, comment } = req.body;

        if (!tractorId || !rating || !comment) {
            return res.status(400).json({ success: false, message: 'tractorId, rating, and comment are required' });
        }

        if (!mongoose.isValidObjectId(tractorId)) {
            return res.status(400).json({ success: false, message: 'Invalid tractor ID' });
        }

        const numRating = Number(rating);
        if (isNaN(numRating) || numRating < 1 || numRating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5' });
        }

        const tractor = await Tractor.findById(tractorId);
        if (!tractor) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        // Owners cannot review their own tractor
        if (tractor.owner.toString() === _id.toString()) {
            return res.status(403).json({ success: false, message: 'Owners cannot review their own equipment' });
        }

        const validBookingId = bookingId && mongoose.isValidObjectId(bookingId) ? bookingId : undefined;

        const review = await Review.create({
            tractor: tractorId,
            user: _id,
            booking: validBookingId,
            rating: numRating,
            comment: String(comment).trim()
        });

        // Recalculate average rating for tractor
        const reviews = await Review.find({ tractor: tractorId });
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

        await Tractor.findByIdAndUpdate(tractorId, {
            rating: Number(avg.toFixed(1)),
            ratingCount: reviews.length
        });

        res.status(201).json({ success: true, message: 'Review submitted successfully', review });
    } catch (error) {
        console.error('addReview error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all reviews for a Tractor
export const getTractorReviews = async (req, res) => {
    try {
        const { tractorId } = req.params;

        if (!tractorId || !mongoose.isValidObjectId(tractorId)) {
            return res.status(400).json({ success: false, message: 'Invalid tractor ID' });
        }

        const reviews = await Review.find({ tractor: tractorId })
            .populate({ path: 'user', select: 'name image' })
            .sort({ createdAt: -1 });

        res.json({ success: true, reviews });
    } catch (error) {
        console.error('getTractorReviews error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
