import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const bookingSchema = new mongoose.Schema({
    tractor: { type: ObjectId, ref: "Tractor", required: true },
    user: { type: ObjectId, ref: "User", required: true },
    owner: { type: ObjectId, ref: "User", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    price: { type: Number, required: true },
    rentalUnit: { type: String, enum: ['day', 'hour', 'acre'], default: 'day' },
    unitsBooked: { type: Number, default: 1 },
    // Agricultural Implement Add-ons & Driver
    selectedImplements: [
        {
            name: { type: String },
            pricePerDay: { type: Number, default: 0 }
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
    transactionId: { type: String, default: '' },
    operatorAssigned: {
        name: { type: String, default: '' },
        phone: { type: String, default: '' }
    },
    customerNotes: { type: String, default: '' }
}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;