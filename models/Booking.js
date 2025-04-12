const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    reference: String,
    flightNumber: String,
    passengerName: String,
    seatNumber: String,
    departure: String,
    departureTime: String,
    arrival: String,
    arrivalTime: String,
    status: String,
    paymentMethod: String,
    amount: Number,
    userEmail: String,
    airline: String,
    price: Number,
    user: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: String,
      required: true,
    },
    flightNumber: String,
    date: String,
    status: String,
    // ... other fields
    
}, { timestamps: true });

// ✅ Fix: Prevent overwriting the model
const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

module.exports = Booking;
