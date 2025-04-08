
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const VERIFY_TOKEN = "boba_order_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

let orders = {}; // Store ongoing conversations keyed by user

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
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    const msgBody = message?.text?.body?.trim().toLowerCase();

    if (from && msgBody) {
      let replyText = "";
      let customer = orders[from] || { step: 0, type: "", data: {} };

      if (msgBody.includes("order to car")) {
        customer = { step: 1, type: "car", data: {} };
        replyText = "🚗 Awesome! Please send:
1. Full Name
2. Car Color
3. Plate Number
4. Your Order";
      } else if (msgBody.includes("pick up")) {
        customer = { step: 1, type: "pickup", data: {} };
        replyText = "🧋 Great! Please send:
1. Full Name
2. Your Order
3. Pickup Branch (Nile or Guzape)";
      } else if (msgBody.includes("delivery")) {
        customer = { step: 1, type: "delivery", data: {} };
        replyText = "🛵 Sure! Please send:
1. Name
2. Delivery Address
3. Landmark
4. Phone Number
5. Your Order";
      } else if (customer.step === 1) {
        const lines = msgBody.split("
");
        if (customer.type === "car" && lines.length >= 4) {
          customer.data = {
            name: lines[0],
            carColor: lines[1],
            plate: lines[2],
            order: lines.slice(3).join(" ")
          };
          replyText = `✅ Thanks ${customer.data.name}! Your ${customer.data.order} will be brought to your ${customer.data.carColor} car (${customer.data.plate}) shortly. 🧋`;
          customer.step = 0;
        } else if (customer.type === "pickup" && lines.length >= 3) {
          customer.data = {
            name: lines[0],
            order: lines[1],
            branch: lines[2]
          };
          replyText = `✅ Thank you ${customer.data.name}! Your ${customer.data.order} will be ready at our ${customer.data.branch} branch. See you soon!`;
          customer.step = 0;
        } else if (customer.type === "delivery" && lines.length >= 5) {
          customer.data = {
            name: lines[0],
            address: lines[1],
            landmark: lines[2],
            phone: lines[3],
            order: lines.slice(4).join(" ")
          };
          replyText = `✅ Order confirmed, ${customer.data.name}!
We’ll deliver your ${customer.data.order} to ${customer.data.address} near ${customer.data.landmark}.
We’ll call ${customer.data.phone} if needed. 🛵`;
          customer.step = 0;
        } else {
          replyText = "⚠️ Please follow the format exactly to proceed with your order.";
        }
      } else {
        replyText = "👋 Welcome to Boba Chummy!
Please type:
- 'Order to Car'
- 'Delivery'
- 'Pick up'
To start your order.";
      }

      orders[from] = customer;

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
