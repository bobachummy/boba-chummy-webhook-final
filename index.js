
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
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const from = message?.from;
    const msgBody = message?.text?.body?.toLowerCase();

    if (msgBody && from) {
      let replyText = "";

      if (msgBody.includes("order to car")) {
        replyText = "Sure! 🚗 Please reply with your:\n1. Full Name\n2. Car Color\n3. Car Plate Number\n4. Your Order";
      } else if (msgBody.includes("delivery")) {
        replyText = "Great! 🛵 Please share your:\n1. Name\n2. Delivery Address\n3. Your Order";
      } else if (msgBody.includes("pick up")) {
        replyText = "Awesome! 🧋 Please send your name and your order so we can have it ready for pickup.";
      } else {
        replyText = "Hi! 👋 You can say:\n- 'Order to car'\n- 'Delivery'\n- 'Pick up'\nLet me know how you’d like to get your Boba!";
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: { body: replyText }
          },
          {
            headers: {
              "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      } catch (error) {
        console.error("Failed to send reply:", error.response?.data || error.message);
      }
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Webhook with reply logic running on port ${PORT}`);
});
