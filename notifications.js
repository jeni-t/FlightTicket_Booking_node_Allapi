const twilio = require("twilio");
const postmark = require("postmark");
const cron = require("node-cron");
const { Server } = require("socket.io");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

let io; // WebSocket instance

const initWebSocket = (server) => {
    io = new Server(server, {
        cors: { origin: "*" },
    });

    io.on("connection", (socket) => {
        console.log("✅ WebSocket Connected:", socket.id);
    });
};

const sendSMS = async (phone, message) => {
    try {
        console.log(`📤 Sending SMS to ${phone}: ${message}`);

        const msg = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });

        console.log(`✅ SMS sent successfully: ${msg.sid}`);
    } catch (error) {
        console.error("❌ SMS sending failed:", error.message);
    }
};


const sendEmail = async (to, subject, text) => {
    try {
        console.log(`📤 Sending email to ${to}: ${subject}`);
        
        await postmarkClient.sendEmail({
            From: "jenifer@neuralhive-tech.com",
            To: to,
            Subject: subject,
            TextBody: text
        });

        console.log("✅ Email sent successfully!");
    } catch (error) {
        console.error("❌ Email sending failed:", error.message);
    }
};


// Function to send real-time WebSocket notification
const sendWebNotification = (userId, data) => {
    io.to(userId).emit("flight-update", data);
    console.log(`📡 Real-time update sent to user ${userId}`);
};

// CRON Job to send reminders 24 hours before flight
cron.schedule("0 9 * * *", async () => {
    console.log("⏳ Running daily flight reminders...");

    const upcomingFlights = await getUpcomingFlights(); // Fetch flights within 24 hours

    upcomingFlights.forEach((flight) => {
        const message = `Reminder: Your flight ${flight.flightNumber} from ${flight.departure} is tomorrow at ${flight.departureTime}. Check-in early!`;

        sendSMS(flight.userPhone, message);
        sendEmail(flight.userEmail, "Flight Reminder", message);
        sendWebNotification(flight.userId, { type: "reminder", message });
    });
});

module.exports = { initWebSocket, sendSMS, sendEmail, sendWebNotification };
