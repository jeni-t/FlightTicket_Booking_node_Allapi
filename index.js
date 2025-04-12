require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const postmark = require("postmark");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const app = express();
app.use(cors());
app.use(bodyParser.json()); // ✅ Fix: Ensure JSON parsing is enabled
app.use(bodyParser.urlencoded({ extended: true }));
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flightBooking";
const http = require("http");
const socketIo = require("socket.io");
const airlineRoutes = require("./airlineIntegration");
app.use("/api/airlines", airlineRoutes);
const User = require("./models/User");
app.use("/api", require("./routes/userRoutes"));
const Booking = require("./models/Booking"); // Ensure correct path
const flightTracking = {}; // Declare this globally
const server = http.createServer(app);

// ✅ Attach Socket.IO to the server
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000", // Allow frontend requests
        methods: ["GET", "POST"]
    }
});


mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flightBooking", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


app.use('/api/auth', require('./routes/auth'))

// ✅ Booking Schema & Model


const AMADEUS_API_URL = "https://test.api.amadeus.com/v2/shopping/flight-offers";
const AMADEUS_AUTH_URL = "https://test.api.amadeus.com/v1/security/oauth2/token";

const API_KEY = process.env.AMADEUS_API_KEY;
const API_SECRET = process.env.AMADEUS_API_SECRET;

let accessToken = null;

// Function to get Amadeus API access token
const getAccessToken = async () => {
    try {
        const response = await axios.post(AMADEUS_AUTH_URL, new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.AMADEUS_API_KEY,
            client_secret: process.env.AMADEUS_API_SECRET
        }));
        accessToken = response.data.access_token;
        console.log("✅ Access token fetched successfully");
    } catch (error) {
        console.error("❌ Error getting access token:", error.response?.data || error.message);
    }
};


// Middleware to check and refresh API token
app.use(async (req, res, next) => {
    if (!accessToken) {
        console.log("🔄 Fetching new access token...");
        await getAccessToken();
    }
    next();
});


app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
  
      let user = await User.findOne({ email });
      if (user) return res.status(400).json({ message: "User already exists" });
  
      user = new User({ name, email, password });
      await user.save();
  
      res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Find user
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: "User not found" });
  
      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
  
      // Generate JWT token
      const token = jwt.sign({ id: user._id }, "your_jwt_secret", { expiresIn: "1h" });
  
      res.status(200).json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  


app.get("/api/bookings", async (req, res) => {
    try {
      const bookings = await Booking.find();
      res.json(bookings.map(b => ({
          _id: b._id,  // ✅ Correct MongoDB ID
          reference: b.reference,
          flightNumber: b.flightNumber,
          passengerName: b.passengerName,
          seatNumber: b.seatNumber,
          departure: b.departure,
          departureTime: b.departureTime,
          arrival: b.arrival,
          arrivalTime: b.arrivalTime,
          status: b.status
      })));
    } catch (error) {
      console.error("❌ Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
});

  
  // ✅ Cancel Booking
  app.delete("/api/bookings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await Booking.findByIdAndDelete(id);
      res.json({ message: "Booking canceled successfully" });
    } catch (error) {
      console.error("❌ Error canceling booking:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });


  app.get("/api/search-flights", async (req, res) => {
    try {
        const { departure, arrival, date, passengers } = req.query;
        if (!departure || !arrival || !date || !passengers) {
            return res.status(400).json({ error: "Missing required query parameters" });
        }

        const token = await getAmadeusToken();

        const response = await axios.get(AMADEUS_API_URL, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                originLocationCode: departure,
                destinationLocationCode: arrival,
                departureDate: date,
                adults: passengers,
                currencyCode: "USD",
                max: 10,
            },
        });

        res.json(response.data.data);
    } catch (error) {
        console.error("❌ Flight API Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to fetch flight data" });
    }
});


app.post("/api/payment/stripe", async (req, res) => {
    try {
        const { amount, currency, email, flightDetails } = req.body;

        if (!amount || !currency || !email || !flightDetails) {
            return res.status(400).json({ error: "Missing required payment details" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency,
            receipt_email: email,
            payment_method_types: ["card"],
        });

        const newBooking = await Booking.create({
            reference: Math.random().toString(36).substring(7).toUpperCase(),
            flightNumber: flightDetails.flightNumber,
            passengerName: flightDetails.passengerName,
            seatNumber: flightDetails.seatNumber,
            departure: flightDetails.departure,
            departureTime: flightDetails.departureTime,
            arrival: flightDetails.arrival,
            arrivalTime: flightDetails.arrivalTime,
            status: "PENDING",
            paymentStatus: "PENDING",
            paymentMethod: "Stripe",
            amount
        });

        res.json({ clientSecret: paymentIntent.client_secret, bookingId: newBooking._id });
    } catch (error) {
        console.error("Stripe Payment Error:", error);
        res.status(500).json({ error: "Payment processing failed." });
    }
});


app.post('/api/book-flight', async (req, res) => {
    try {
        console.log("📌 Incoming Booking Request:", req.body); // ✅ Debugging

        const { flightNumber, passengerName, seatNumber, departure, departureTime, arrival, arrivalTime, status } = req.body;

        if (!flightNumber || !passengerName || !departure || !arrival) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Save booking in MongoDB
        const newBooking = await Booking.create({
            reference: Math.random().toString(36).substring(7).toUpperCase(),
            flightNumber,
            passengerName,
            seatNumber,
            departure,
            departureTime,
            arrival,
            arrivalTime,
            status: status || "CONFIRMED"
        });

        console.log("✅ Booking saved:", newBooking);
        res.json({ message: "Booking successful!", booking: newBooking });

    } catch (error) {
        console.error('❌ Booking Error:', error);
        res.status(500).json({ error: 'Failed to book flight' });
    }
});

app.post("/api/payments/create", async (req, res) => {
    try {
        const { bookingId, amount, currency } = req.body;

        if (!bookingId || !amount || !currency) {
            return res.status(400).json({ error: "Missing payment details" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Convert to smallest currency unit
            currency,
            metadata: { bookingId }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error("❌ Error creating PaymentIntent:", error);
        res.status(500).json({ error: "Payment failed" });
    }
});

// ✅ Route to confirm payment status
app.post("/api/payments/confirm", async (req, res) => {
    try {
        const { paymentIntentId } = req.body;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === "succeeded") {
            return res.json({ success: true, message: "Payment successful!" });
        } else {
            return res.status(400).json({ success: false, message: "Payment failed." });
        }
    } catch (error) {
        console.error("❌ Error confirming payment:", error);
        res.status(500).json({ error: "Payment confirmation failed" });
    }
});

app.post("/create-payment-intent", async (req, res) => {
    try {
        const { amount, currency } = req.body;

        // ✅ Create a payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount, // Amount in cents (e.g., 5000 for $50)
            currency,
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error("❌ Error creating payment intent:", error);
        res.status(500).json({ error: "Payment Intent creation failed" });
    }
});

const getRealTimeFlightStatus = async (flightNumber) => {
    try {
        // Simulated real-time flight status (Replace this with an actual API call)
        return {
            flightNumber: flightNumber,
            departure: { 
                airport: "MAA", 
                scheduledTime: "2025-04-05T11:45:00", 
                actualTime: "2025-04-05T12:00:00" // Delayed
            },
            arrival: { 
                airport: "IXM", 
                scheduledTime: "2025-04-05T12:55:00", 
                actualTime: "2025-04-05T13:10:00" // Delayed
            },
            status: "Delayed"
        };
    } catch (error) {
        console.error("❌ Error fetching flight status:", error);
        return null;
    }
};


// Initialize Postmark client
const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

const sendBookingEmail = async (userEmail, bookingDetails) => {
    try {
        const flightStatus = await getRealTimeFlightStatus(bookingDetails.flightNumber);

        await postmarkClient.sendEmail({
            From: process.env.FROM_EMAIL,
            To: userEmail,
            Subject: "Your Flight Booking Confirmation ✈️",
            HtmlBody: `
                <h2>Flight Booking Confirmation</h2>
                <p>Dear ${bookingDetails.passengerName},</p>
                <p>Thank you for booking your flight with us!</p>
                <h3>Booking Details:</h3>
                <ul>
                    <li><strong>Booking Reference:</strong> ${bookingDetails.reference}</li>
                    <li><strong>Flight:</strong> ${bookingDetails.flightNumber}</li>
                    <li><strong>Departure:</strong> ${bookingDetails.departure} at ${bookingDetails.departureTime}</li>
                    <li><strong>Arrival:</strong> ${bookingDetails.arrival} at ${bookingDetails.arrivalTime}</li>
                    <li><strong>Seat Number:</strong> ${bookingDetails.seatNumber}</li>
                    <li><strong>Total Price:</strong> $${bookingDetails.amount}</li>
                    <li><strong>Payment Method:</strong> ${bookingDetails.paymentMethod}</li>
                    <li><strong>Status:</strong> ${bookingDetails.status || "N/A"}</li>
                    <li><strong>Date:</strong> ${new Date(bookingDetails.createdAt).toLocaleString()}</li>
                </ul>
                
                <h3>Real-Time Flight Status:</h3>
                ${flightStatus ? `
                    <ul>
                        <li><strong>Flight:</strong> ${flightStatus.flightNumber}</li>
                        <li><strong>Departure:</strong> ${flightStatus.departure.airport} at ${flightStatus.departure.actualTime} 
                            ${flightStatus.departure.actualTime !== flightStatus.departure.scheduledTime ? `(Delayed from ${flightStatus.departure.scheduledTime})` : ""}
                        </li>
                        <li><strong>Arrival:</strong> ${flightStatus.arrival.airport} at ${flightStatus.arrival.actualTime}</li>
                        <li><strong>Status:</strong> ${flightStatus.status}</li>
                    </ul>
                ` : `<p>Real-time flight status is not available.</p>`}

                <hr>
                <p>Safe travels! 🛫</p>
                <p><em>Need assistance? Contact us anytime.</em></p>
            `
        });

        console.log(`✅ Email sent successfully to ${userEmail}`);
    } catch (error) {
        console.error("❌ Email sending failed:", error);
        throw new Error("Email sending failed");
    }
};




// Twilio credentials
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const sendBookingSMS = async (userPhone, bookingDetails) => {
    try {
        const flightStatus = await getRealTimeFlightStatus(bookingDetails.flightNumber);
        const formattedPhone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

        const messageBody = `
📢 Flight Booking Confirmed!
🆔 Ref: ${bookingDetails.reference}
✈️ Flight: ${bookingDetails.flightNumber}
📍 Departure: ${bookingDetails.departure} at ${bookingDetails.departureTime}
🏁 Arrival: ${bookingDetails.arrival} at ${bookingDetails.arrivalTime}
💺 Seat: ${bookingDetails.seatNumber}
💰 Price: $${bookingDetails.amount}
💳 Payment: ${bookingDetails.paymentMethod}
🛫 Status: ${bookingDetails.status}

📌 Real-Time Flight Status:
🛬 Flight: ${flightStatus.flightNumber}
📍 Departure: ${flightStatus.departure.airport} at ${flightStatus.departure.actualTime} 
   ${flightStatus.departure.actualTime !== flightStatus.departure.scheduledTime ? `(Delayed from ${flightStatus.departure.scheduledTime})` : ""}
🏁 Arrival: ${flightStatus.arrival.airport} at ${flightStatus.arrival.actualTime}
⏳ Status: ${flightStatus.status}
        `;

        const message = await twilioClient.messages.create({
            body: messageBody.trim(),
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone,
        });

        console.log(`✅ SMS sent successfully to ${formattedPhone}: ${message.sid}`);
    } catch (error) {
        console.error("❌ SMS sending failed:", error);
        throw new Error("SMS sending failed");
    }
};



// const transporter = nodemailer.createTransport({
//     service: "Gmail", // or use another provider
//     auth: {
//         user: process.env.FROM_EMAIL,
//         pass: process.env.EMAIL_PASS,
//     },
// });

// const sendBookingEmail = async (userEmail, bookingDetails) => {
//     try {
//         const mailOptions = {
//             from: process.env.FROM_EMAIL,
//             to: userEmail,
//             subject: "Your Flight Booking Confirmation",
//             text: `Dear Customer, your flight is confirmed.\n\nBooking Details:\nBooking ID: ${bookingDetails.bookingId}\nFlight: ${bookingDetails.flightId}\nSeat: ${bookingDetails.seat}\nPrice: $${bookingDetails.price}\nPayment: ${bookingDetails.paymentMethod}\n\nThank you for booking with us!`,
//         };

//         await transporter.sendMail(mailOptions);
//         console.log(`✅ Email sent to ${userEmail}`);
//     } catch (error) {
//         console.error("❌ Email sending failed:", error);
//         throw new Error("Email sending failed");
//     }
// };



// 📲 Function to send SMS confirmation
// const sendBookingSMS = async (userPhone, bookingDetails) => {
//     try {
//         const message = await twilioClient.messages.create({
//             body: `Your flight booking is confirmed! ✈️\nBooking ID: ${bookingDetails.bookingId}\nFlight: ${bookingDetails.flightId}\nSeat: ${bookingDetails.seat}\nPrice: $${bookingDetails.price}`,
//             from: process.env.TWILIO_PHONE_NUMBER,
//             to: userPhone,
//         });

//         console.log(`✅ SMS sent to ${userPhone}:`, message.sid);
//     } catch (error) {
//         console.error("❌ SMS sending failed:", error);
//         throw new Error("SMS sending failed");
//     }
// };

const getAmadeusFlightStatus = async (origin, destination, date) => {
    try {
      if (!accessToken) await getAmadeusAccessToken();
  
      const response = await axios.get(AMADEUS_API_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          originLocationCode: origin,
          destinationLocationCode: destination,
          departureDate: date,
          adults: 1,
          max: 1
        }
      });
  
      const flight = response.data.data[0];
      const segment = flight.itineraries[0].segments[0];
  
      return {
        flightNumber: segment.carrierCode + segment.number,
        status: "On Time", // Amadeus doesn’t give real-time status in this API — we'll add it later with another endpoint
        seatNumber: "Auto Assigned",
        totalPrice: flight.price.total,
        paymentMethod: "Not Available",
        date: date,
        departure: {
          airport: segment.departure.iataCode,
          time: segment.departure.at
        },
        arrival: {
          airport: segment.arrival.iataCode,
          time: segment.arrival.at
        }
      };
    } catch (err) {
      console.error("❌ Error from Amadeus:", err.response?.data || err.message);
      return { error: "Amadeus data fetch failed" };
    }
  };

  const getIATACodeFromPlace = async (place) => {
    try {
      if (!accessToken) await getAmadeusAccessToken();
  
      const response = await axios.get(
        "https://test.api.amadeus.com/v1/reference-data/locations",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            keyword: place,
            subType: "AIRPORT,CITY",
          },
        }
      );
  
      return response.data.data[0]?.iataCode;
    } catch (err) {
      console.error(`❌ Failed to get IATA code for ${place}:`, err.message);
      return null;
    }
  };
  
  
  app.get("/api/flight-status/place/:origin/:destination/:date", async (req, res) => {
    const { origin, destination, date } = req.params;
  
    const originCode = await getIATACodeFromPlace(origin);
    const destCode = await getIATACodeFromPlace(destination);
  
    if (!originCode || !destCode) {
      return res.status(400).json({ error: "Invalid place names" });
    }
  
    const status = await getAmadeusFlightStatus(originCode, destCode, date);
    if (status?.error) {
      return res.status(500).json({ error: "Could not fetch flight status" });
    }
  
    res.json(status);
  });
  
  
  
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
  
    socket.on("trackFlight", async ({ origin, destination, date }) => {
      console.log(`🔍 Tracking flight from ${origin} to ${destination} on ${date}`);
      const status = await getMockFlightStatus(origin, destination, date);
      socket.emit("flightStatusUpdate", status);
    });
  
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
  

app.post("/confirm-booking", async (req, res) => {
    try {
        const { userEmail, userPhone, bookingId } = req.body;
        console.log("🔹 Received confirm-booking request:", req.body);

        if (!userEmail || !userPhone || !bookingId) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        const bookingDetails = await Booking.findById(bookingId);
        if (!bookingDetails) {
            return res.status(404).json({ error: "Booking not found" });
        }

        console.log(`📩 Sending email to: ${userEmail}`);
        console.log(`📲 Sending SMS to: ${userPhone}`);

        await sendBookingEmail(userEmail, bookingDetails);
        await sendBookingSMS(userPhone, bookingDetails);

        res.json({ success: true, message: "Booking confirmed! Notifications sent." });

    } catch (error) {
        console.error("❌ Error confirming booking:", error);
        res.status(500).json({ error: "Failed to confirm booking" });
    }
});






app.post("/send-email", async (req, res) => {
    try {
        const { userEmail, bookingDetails } = req.body;
        await sendBookingEmail(userEmail, bookingDetails);
        res.status(200).json({ message: "Email sent successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to send email" });
    }
});

app.post("/send-sms", async (req, res) => {
    try {
        const { userPhone, bookingDetails } = req.body;
        await sendBookingSMS(userPhone, bookingDetails);
        res.status(200).json({ message: "SMS sent successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to send SMS" });
    }
});

app.get("/api/flight-status/:bookingRef", async (req, res) => {
    const { bookingRef } = req.params;
    const flightData = await getFlightStatus("1", "2025-04-05"); // Replace dynamically with user flight info
    res.json(flightData);
});

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;

const getAmadeusAccessToken = async () => {
    try {
      const response = await axios.post(AMADEUS_AUTH_URL, new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.AMADEUS_API_KEY,
        client_secret: process.env.AMADEUS_API_SECRET
      }));
      accessToken = response.data.access_token;
      console.log("✅ Got Amadeus token");
    } catch (err) {
      console.error("❌ Token Error", err.response?.data || err.message);
    }
  };

// Fetch Real-Time Flight Status
const getFlightStatus = async (flightNumber, departureDate) => {
    try {
        const accessToken = await getAmadeusAccessToken();
        if (!accessToken) return { error: "Unable to fetch Amadeus API token" };

        const response = await axios.get(
            `https://test.api.amadeus.com/v2/schedule/flights?carrierCode=AI&flightNumber=${flightNumber}&scheduledDepartureDate=${departureDate}`,
            { headers: { Authorization: `Bearer ${accessToken}` } ,
            params: { flightNumber, date: departureDate }}
        );

        if (!response.data || !response.data.data || response.data.data.length === 0) {
            return { error: "No flight data available" };
        }

        const flight = response.data.data[0];

        // Extract data safely with default values
        const departure = flight.departure || {};
        const arrival = flight.arrival || {};

        return {
            flightNumber: flight.flightDesignator?.flightNumber || flightNumber,
            departure: {
                airport: departure.iataCode || "Unknown",
                scheduledTime: departure.scheduledDateTime ? new Date(departure.scheduledDateTime).toLocaleString() : "N/A",
                actualTime: departure.actualDateTime ? new Date(departure.actualDateTime).toLocaleString() : "N/A",
            },
            arrival: {
                airport: arrival.iataCode || "Unknown",
                scheduledTime: arrival.scheduledDateTime ? new Date(arrival.scheduledDateTime).toLocaleString() : "N/A",
                actualTime: arrival.actualDateTime ? new Date(arrival.actualDateTime).toLocaleString() : "N/A",
            },
            status: flight.flightStatus || "On Time",
        };
    } catch (error) {
        console.error("Error fetching flight status:", error.response?.data || error.message);
        return { error: "Flight status unavailable" };
    }
};

const checkFlightUpdates = async () => {
    for (const [flightKey, userInfo] of flightTracking.entries()) {
        const { flightNumber, departureDate, userId, email, phone } = userInfo;
        const status = await getFlightStatus(flightNumber, departureDate);

        if (status) {
            io.to(userId).emit("flight-status-update", status);
            
            // If status has changed significantly, send an email & SMS
            if (status.status === "Delayed" || status.status === "Canceled") {
                sendFlightUpdateEmail(email, status);
                sendFlightUpdateSMS(phone, status);
            }
        }
    }
};

app.get("/api/flight-status/:flightNumber/:departureDate", async (req, res) => {
    const { flightNumber, departureDate } = req.params;
    const status = await getFlightStatus(flightNumber, departureDate);
    res.json(status);
});

const flightCache = new Map(); // Cache for flight status

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("requestFlightStatus", async ({ flightNumber, departureDate }) => {
        const cacheKey = `${flightNumber}-${departureDate}`;
        if (flightCache.has(cacheKey)) {
            console.log("🔄 Serving from cache:", cacheKey);
            return socket.emit("flightStatusUpdate", flightCache.get(cacheKey));
        }

        const status = await getFlightStatus(flightNumber, departureDate);
        flightCache.set(cacheKey, status);

        setTimeout(() => flightCache.delete(cacheKey), 30000); // Clear cache after 30 sec

        socket.emit("flightStatusUpdate", status);
    });

    socket.on("track-flight", ({ flightNumber, departureDate, email, phone }) => {
        flightTracking.set(socket.id, { flightNumber, departureDate, userId: socket.id, email, phone });
        console.log(`🔍 Tracking flight ${flightNumber} for ${socket.id}`);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected",socket.id);
    });
});


setInterval(checkFlightUpdates, 600000);


app.get("/api/airlines/flights", async (req, res) => {
    try {
        const { origin, destination, date, adults, travelClass } = req.query;

        // 🔴 Missing required parameters check
        if (!origin || !destination || !date || !adults) {
            return res.status(400).json({ error: "Missing required query parameters" });
        }

        const token = await getAmadeusToken(); // ✅ Token fetch
        const response = await axios.get(AMADEUS_API_URL, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                originLocationCode: origin,
                destinationLocationCode: destination,
                departureDate: date,
                adults,
                travelClass: travelClass === "Any" ? undefined : travelClass,
                currencyCode: "USD",
                max: 50,
            },
        });

        res.json(response.data.data);
    } catch (error) {
        console.error("❌ Flight API Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to fetch flight data" });
    }
});

app.get("/api/airports", async (req, res) => {
    const query = req.query.query;
  
    try {
      const response = await axios.get("https://test.api.amadeus.com/v1/reference-data/locations", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          subType: "AIRPORT",
          keyword: query,
          page: { limit: 10 }
        }
      });
  
      const airports = response.data.data.map(airport => ({
        name: airport.name,
        iataCode: airport.iataCode,
        city: airport.address.cityName
      }));
  
      res.json(airports);
    } catch (err) {
      console.error("Airport fetch failed:", err.message);
      res.status(500).json({ error: "Failed to fetch airports" });
    }
  });
  

app.put("/api/bookings/:id", async (req, res) => {
    const bookingId = req.params.id;
    const updatedData = req.body;
    try {
        const updatedBooking = await Booking.findByIdAndUpdate(bookingId, updatedData, { new: true });
        if (!updatedBooking) {
            return res.status(404).json({ message: "Booking not found" });
        }
        res.json(updatedBooking);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

app.get("/api/bookings/history/:userId", async (req, res) => {
    try {
        const bookings = await Booking.find({ userEmail: req.params.userId });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: "Error fetching booking history" });
    }
});

// /routes/reports.js
app.get("/trends", async (req, res) => {
    const trends = await Booking.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          totalBookings: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    res.json(trends);
  });

  // /routes/reports.js
  app.get("/sales", async (req, res) => {
    const sales = await Booking.aggregate([
      {
        $group: {
          _id: "$airline",
          totalRevenue: { $sum: "$totalPrice" },
          totalBookings: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);
    res.json(sales);
  });
  

  app.get("/users", async (req, res) => {
    const activity = await Booking.aggregate([
      {
        $group: {
          _id: "$userId",
          bookings: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" }
        }
      },
      { $sort: { bookings: -1 } }
    ]);
    res.json(activity);
  });
  
  app.get("/api/users/:id", async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");
    res.json(user); // includes user.preferences
  });
  
app.listen(5000, () => console.log('Server running on port 5000'));
