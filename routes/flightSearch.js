const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;

// Get Amadeus API Access Token
async function getAccessToken() {
    try {
        const response = await axios.post('https://test.api.amadeus.com/v1/security/oauth2/token', {
            grant_type: 'client_credentials',
            client_id: AMADEUS_API_KEY,
            client_secret: AMADEUS_API_SECRET
        }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        return response.data.access_token;
    } catch (error) {
        console.error("Error fetching Amadeus token:", error.response?.data || error.message);
        throw new Error("Failed to authenticate with Amadeus API");
    }
}

// Flight Search Route
router.get('/search', async (req, res) => {
    const { origin, destination, departureDate, returnDate, adults } = req.query;
    console.log("Received Search Request:", req.query);

    try {
        const accessToken = await getAccessToken();
        console.log("Access Token Received:", accessToken);

        const response = await axios.get('https://test.api.amadeus.com/v2/shopping/flight-offers', {
            params: {
                originLocationCode: origin,
                destinationLocationCode: destination,
                departureDate,
                returnDate: returnDate || undefined,
                adults,
                currencyCode: "USD",
                max: 10
            },
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log("Flight API Response:", response.data);
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching flight offers:", error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || "Failed to retrieve flight offers" });
    }
});

module.exports = router;
