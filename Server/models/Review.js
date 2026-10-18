import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const reviewSchema = new mongoose.Schema({
    tractor: { type: ObjectId, ref: "Tractor", required: true },
    user: { type: ObjectId, ref: "User", required: true },
    booking: { type: ObjectId, ref: "Booking" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
}, { timestamps: true });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
