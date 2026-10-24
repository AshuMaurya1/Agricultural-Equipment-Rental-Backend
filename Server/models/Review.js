import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const reviewSchema = new mongoose.Schema({
    tractor: { type: ObjectId, ref: "Tractor", required: true, index: true },
    user: { type: ObjectId, ref: "User", required: true, index: true },
    booking: { type: ObjectId, ref: "Booking" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
}, { timestamps: true });

reviewSchema.index({ tractor: 1, createdAt: -1 });
reviewSchema.index({ tractor: 1, user: 1 });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
