import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const tractorSchema = new mongoose.Schema({
    owner: { type: ObjectId, ref: "User", required: true, index: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    year: { type: Number, required: true },
    category: { type: String, required: true, trim: true },
    seatingCapacity: { type: Number, required: true, default: 1 },
    fuelType: { type: String, required: true, default: 'Diesel' },
    transmission: { type: String, required: true, default: 'Manual' },
    pricePerDay: { type: Number, required: true, min: 0 },
    pricePerHour: { type: Number, default: 600, min: 0 },
    pricePerAcre: { type: Number, default: 1200, min: 0 },
    horsePower: { type: Number, default: 50 },
    transportRatePerKm: { type: Number, default: 40, min: 0 },
    state: { type: String, default: 'Uttar Pradesh', trim: true },
    district: { type: String, trim: true, default: '' },
    block: { type: String, trim: true, default: '' },
    villageOrLandmark: { type: String, trim: true, default: '' },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    isAvailable: { type: Boolean, default: true, index: true },
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

tractorSchema.index({ isAvailable: 1, district: 1, block: 1 });
tractorSchema.index({ isAvailable: 1, location: 1 });

const Tractor = mongoose.model('Tractor', tractorSchema);

export default Tractor;
