
console.log("✅ Boba Chummy Webhook Bot started successfully!");

const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const VERIFY_TOKEN = "boba_order_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const entry = body.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];
    const from = message?.from;
    const text = message?.text?.body;

    if (from && text) {
      console.log(`📥 Received message from ${from}: "${text}"`);

      const lower = text.toLowerCase();
      let responseText = "";

      if (lower.includes("open") || lower.includes("close") || lower.includes("what time")) {
        responseText = "⏰ Our Guzape branch is open daily from 9:00am–10:00pm.
Nile branch opens 10:00am–6:30pm, but we’re closed on Sundays.";
      } else if (lower.includes("deliver") && (lower.includes("gwarinpa") || lower.includes("wuse") || lower.includes("asokoro") || lower.includes("abuja"))) {
        responseText = "🚚 Yes! Our Guzape branch delivers to all parts of Abuja.";
      } else if (lower.includes("menu") || lower.includes("milk tea") || lower.includes("sticky") || lower.includes("fruit tea") || lower.includes("ice cream")) {
        responseText = "🧋 Here’s our full menu and catalog: https://wa.me/c/234XXXXXXXXXX";
      } else if (lower.includes("hi") || lower.includes("hello")) {
        responseText = "👋 Welcome to Boba Chummy! Home of LOYAL-TEA stamps, love notes on cups, and sticky bubble waffles. What would you like to order today?";
      } else {
        responseText = "🧋 Thanks for reaching out to Boba Chummy! Want to check the menu or place an order? Just say 'menu' or type your drink!";
      }

      // send response back via WhatsApp
      try {
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp",
          to: from,
          text: { body: responseText }
        }, {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        });
      } catch (err) {
        console.error("❌ Error sending message:", err.response?.data || err.message);
      }
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Webhook with full bot logic running on port ${PORT}`);
});
