import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const bookingSchema = new mongoose.Schema({
    tractor: { type: ObjectId, ref: "Tractor", required: true, index: true },
    user: { type: ObjectId, ref: "User", required: true, index: true },
    owner: { type: ObjectId, ref: "User", required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending', index: true },
    price: { type: Number, required: true, min: 0 },
    rentalUnit: { type: String, enum: ['day', 'hour', 'acre'], default: 'day' },
    unitsBooked: { type: Number, default: 1, min: 1 },
    // Agricultural Implement Add-ons & Driver
    selectedImplements: [
        {
            name: { type: String, trim: true },
            pricePerDay: { type: Number, default: 0 },
            pricePerHour: { type: Number, default: 0 },
            pricePerAcre: { type: Number, default: 0 }
        }
    ],
    withDriver: { type: Boolean, default: false },
    driverPrice: { type: Number, default: 0 },
    implementsPrice: { type: Number, default: 0 },
    transportDistanceKm: { type: Number, default: 0 },
    transportPrice: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['pay_on_delivery', 'online_advance', 'full_online', 'offline'], default: 'pay_on_delivery' },
    paymentStatus: { type: String, enum: ['pending', 'advance_paid', 'fully_paid'], default: 'pending' },
    advanceAmount: { type: Number, default: 0 },
    transactionId: { type: String, default: '', trim: true },
    operatorAssigned: {
        name: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true }
    },
    customerNotes: { type: String, default: '', trim: true }
}, { timestamps: true });

// Compound indexes for conflict checking and query sorting
bookingSchema.index({ tractor: 1, status: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, createdAt: -1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;