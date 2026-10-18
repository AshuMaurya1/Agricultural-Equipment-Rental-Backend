import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["owner", "user"], default: "user" },
    image: { type: String, default: '' },
    emailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, default: '' },
    emailVerificationExpiresAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpiresAt: { type: Date, default: null },
    twoFactor: {
        enabled: { type: Boolean, default: false },
        secretEncrypted: { type: String, default: '' },
        pendingSecretEncrypted: { type: String, default: '' },
        pendingExpiresAt: { type: Date, default: null }
    },
    sessions: [{
        sessionId: { type: String, required: true },
        refreshTokenHash: { type: String, required: true },
        previousRefreshTokenHash: { type: String, default: '' },
        expiresAt: { type: Date, required: true },
        deviceName: { type: String, default: 'Unknown device' },
        userAgent: { type: String, default: '' },
        ipAddress: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
        lastActiveAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
        revocationReason: { type: String, default: '' },
        suspicious: { type: Boolean, default: false }
    }],
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

export default User;


