const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking"); // Ensure you have the Booking model
const User = require("../models/User"); // Ensure you have the User model

// ✅ Get booking history for a user
router.get("/bookings/history/:userId", async (req, res) => {
    try {
        const bookings = await Booking.find({ userEmail: req.params.userId });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: "Error fetching booking history" });
    }
});

// ✅ Update user details
router.put("/users/update/:id", async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: "Error updating user details" });
    }
});

module.exports = router;
