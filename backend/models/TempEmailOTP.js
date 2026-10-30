// models/TempEmailOTP.js
const mongoose = require('mongoose');

const tempEmailOTPSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    otp: {
        type: String,
        required: true
    },
    verified: {
        type: Boolean,
        default: false
    },
    // Wrong-code guesses against this OTP; the signup flow deletes it after too many.
    attempts: {
        type: Number,
        default: 0
    },
    expires: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // Document will be automatically deleted 10 minutes after creation
    }
});

// Index for faster queries
tempEmailOTPSchema.index({ email: 1, expires: 1 });

module.exports = mongoose.model('TempEmailOTP', tempEmailOTPSchema);
