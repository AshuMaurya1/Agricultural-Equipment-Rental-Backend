import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const tractorSchema = new mongoose.Schema({
    owner: { type: ObjectId, ref: "User" },
    brand: { type: String, required: true },
    model: { type: String, required: true },
    image: { type: String, required: true },
    year: { type: Number, required: true },
    category: { type: String, required: true },
    seatingCapacity: { type: Number, required: true, default: 1 },
    fuelType: { type: String, required: true },
    transmission: { type: String, required: true },
    pricePerDay: { type: Number, required: true },
    pricePerHour: { type: Number, default: 600 },
    pricePerAcre: { type: Number, default: 1200 },
    horsePower: { type: Number, default: 50 },
    transportRatePerKm: { type: Number, default: 40 },
    location: { type: String, required: true },
    description: { type: String, required: true },
    isAvailable: { type: Boolean, default: true },
    blockedDates: [{ type: String }], // Dates formatted as YYYY-MM-DD
    // Agricultural Implements & Driver fields
    implementsAvailable: [
        {
            name: { type: String, required: true },
            pricePerDay: { type: Number, default: 0 },
            pricePerHour: { type: Number, default: 150 },
            pricePerAcre: { type: Number, default: 300 }
        }
    ],
    driverAvailable: { type: Boolean, default: true },
    driverDailyRate: { type: Number, default: 500 },
    driverHourlyRate: { type: Number, default: 100 },
    // Rating summary
    rating: { type: Number, default: 4.8 },
    ratingCount: { type: Number, default: 1 }
}, { timestamps: true });

const Tractor = mongoose.model('Tractor', tractorSchema);

export default Tractor;
