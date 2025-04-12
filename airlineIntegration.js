const express = require("express");
const axios = require("axios");
const Amadeus = require("amadeus");

require("dotenv").config();

const router = express.Router();

// Initialize Amadeus API
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY,
  clientSecret: process.env.AMADEUS_API_SECRET,
});

async function getFlightOffers(origin, destination, date) {
    try {
        const response = await amadeus.shopping.flightOffersSearch.get({
            originLocationCode: origin,
            destinationLocationCode: destination,
            departureDate: date,
            adults: 1
        });

        return response.data;
    } catch (error) {
        console.error("Error fetching flight offers:", error);
        return null;
    }
}

async function getAmadeusAuthToken() {
    try {
      const response = await axios.post(`${AMADEUS_API_URL}/security/oauth2/token`, {
        grant_type: "client_credentials",
        client_id: AMADEUS_API_KEY,
        client_secret: "your_amadeus_api_secret",
      });
  
      return response.data.access_token;
    } catch (error) {
      console.error("Error getting Amadeus token:", error);
      throw new Error("Failed to authenticate with Amadeus API");
    }
  }
  
  // Fetch Flight Schedules
  router.get("/flight-schedule/:flightNumber", async (req, res) => {
    try {
      const token = await getAmadeusAuthToken();
      const { flightNumber } = req.params;
      const response = await axios.get(`${AMADEUS_API_URL}/schedule/flights`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { flightNumber },
      });
  
      res.json(response.data);
    } catch (error) {
      console.error("Error fetching flight schedules:", error);
      res.status(500).json({ error: "Failed to fetch flight schedule" });
    }
  });
  
  async function getSeatMap(flightId) {
    try {
        const response = await amadeus.shopping.seatmaps.get({ flightOfferId: flightId });
        return response.data;
    } catch (error) {
        console.error("Error fetching seat map:", error);
        return null;
    }
}


  // Fetch Seat Map
  router.get("/seat-map/:flightId", async (req, res) => {
    try {
        const { flightId } = req.params;
        if (!flightId) return res.status(400).json({ error: "Flight ID is missing" });

        // Fetch seat map from airline database
        const seatMap = await getSeatMapFromDB(flightId);
        if (!seatMap) return res.status(404).json({ error: "Seat map not found" });

        res.json(seatMap);
    } catch (error) {
        console.error("Error fetching seat map:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

  

// 🔹 1️⃣ Get Available Flights
router.get("/flights", async (req, res) => {
  try {
    const { origin, destination, date } = req.query;

    const response = await amadeus.shopping.flightOffersSearch.get({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: date,
      adults: "1",
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching flights:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/pricing/:flightId", async (req, res) => {
  try {
    const flightId = req.params.flightId;

    const response = await amadeus.shopping.flightOffers.pricing.post({
      data: {
        type: "flight-offers-pricing",
        flightOffers: [{ id: flightId }],
      },
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔹 2️⃣ Get Seat Availability for a Flight
router.get("/seat-map/:flightId", async (req, res) => {
  try {
    const flightId = req.params.flightId;

    const response = await amadeus.shopping.seatmaps.get({
      flightOfferId: flightId,
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Error fetching seat map" });
  }
});



// 🔹 3️⃣ Get Real-Time Flight Status
router.get("/flight-status/:flightNumber/:departureDate", async (req, res) => {
  const { flightNumber, departureDate } = req.params;

  try {
    const response = await amadeus.schedule.flights.get({
      carrierCode: flightNumber.substring(0, 2),
      flightNumber: flightNumber.substring(2),
      scheduledDepartureDate: departureDate,
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error fetching flight status:", error);
    res.status(500).json({ error: "Failed to fetch flight status" });
  }
});

module.exports = router;
