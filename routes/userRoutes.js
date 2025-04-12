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

router.get('/:userId', async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.status(200).json(user);
    } catch (err) {
      res.status(500).json({ message: 'Error fetching user', error: err.message });
    }
  });
  
  // ✅ PUT user preferences
  router.put('/:userId/preferences', async (req, res) => {
    try {
      const { userId } = req.params;
      const { preferredAirline, seatPreference, mealPreference } = req.body;
  
      const user = await User.findByIdAndUpdate(
        userId,
        {
          preferences: { preferredAirline, seatPreference, mealPreference },
        },
        { new: true }
      );
  
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      res.status(200).json({ message: '✅ Preferences updated!', user });
    } catch (error) {
      console.error("❌ Error updating preferences:", error);
      res.status(500).json({ message: '❌ Server error', error: error.message });
    }
  });
  

module.exports = router;
