const axios = require("axios");

const getUpdates = async () => {
    try {
        const response = await axios.get("http://localhost:5000/api/flights/updates");
        return response.data;
    } catch (error) {
        console.error("Error fetching flight updates:", error.message);
        return null;
    }
};

module.exports = { getUpdates };
