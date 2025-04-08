
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const VERIFY_TOKEN = "boba_order_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const CATALOG_LINK = "https://wa.me/c/234XXXXXXXXXX"; // Replace with actual catalog link

let customers = {}; // { phone: { name, stamps, type, step, data } }

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
    const msgBody = message?.text?.body?.trim();

    if (from && msgBody) {
      const lowerMsg = msgBody.toLowerCase();
      let customer = customers[from] || {
        name: null,
        stamps: 0,
        type: "",
        step: 0,
        data: {}
      };

      let reply = "";

      const sendCatalog = () =>
        `Here’s our Boba Chummy menu! 🧋✨
${CATALOG_LINK}

Would you like to:
- Order to Car 🚗
- Pick Up 🏃‍♀️
- Delivery 🛵`;

      const isFirstTime = !customer.name;

      if (isFirstTime && (lowerMsg.includes("hi") || lowerMsg.includes("hello") || lowerMsg.includes("hey"))) {
        reply = `👋 Hey sweet soul! Welcome to *Boba Chummy* — Abuja’s home of bubble tea, waffles & love notes on cups 💌

${sendCatalog()}`;
        customer.step = 0;
      } else if (lowerMsg.includes("menu") || lowerMsg.includes("catalog") || lowerMsg.includes("open")) {
        reply = sendCatalog();
        customer.step = 0;
      } else if (["order to car", "pickup", "pick up", "delivery"].some(kw => lowerMsg.includes(kw))) {
        if (lowerMsg.includes("order to car")) {
          customer.type = "car";
          customer.step = 1;
          reply = "🚗 Sweet! Please send:
1. Your Full Name
2. Car Color
3. Plate Number
4. Your Order
5. Message for the Cup 💌";
        } else if (lowerMsg.includes("pickup") || lowerMsg.includes("pick up")) {
          customer.type = "pickup";
          customer.step = 1;
          reply = "🏃‍♀️ Let’s go! Please send:
1. Your Full Name
2. Your Order
3. Pickup Branch
4. Custom Note for the Cup 💌";
        } else if (lowerMsg.includes("delivery")) {
          customer.type = "delivery";
          customer.step = 1;
          reply = "🛵 Alright! Please send:
1. Your Name
2. Address
3. Landmark
4. Phone Number
5. Your Order
6. Message for the Cup 💌";
        }
      } else if (customer.step === 1) {
        const lines = msgBody.split("
");
        const type = customer.type;

        let complete = false;
        if (type === "car" && lines.length >= 5) {
          [customer.name, customer.data.carColor, customer.data.plate, customer.data.order, customer.data.note] = lines;
          reply = `✅ Thanks ${customer.name}! Your ${customer.data.order} will be delivered to your ${customer.data.carColor} car (${customer.data.plate}).
💌 Cup note: "${customer.data.note}"`;
          complete = true;
        } else if (type === "pickup" && lines.length >= 4) {
          [customer.name, customer.data.order, customer.data.branch, customer.data.note] = lines;
          reply = `✅ Thanks ${customer.name}! Your ${customer.data.order} will be ready for pick up at ${customer.data.branch}.
💌 Cup note: "${customer.data.note}"`;
          complete = true;
        } else if (type === "delivery" && lines.length >= 6) {
          [customer.name, customer.data.address, customer.data.landmark, customer.data.phone, customer.data.order, customer.data.note] = lines;
          reply = `✅ Order confirmed for ${customer.name}!
🛵 Delivery to: ${customer.data.address}, near ${customer.data.landmark}.
📞 Contact: ${customer.data.phone}
💌 Cup note: "${customer.data.note}"`;
          complete = true;
        } else {
          reply = "⚠️ Please send all the requested details in the format provided.";
        }

        if (complete) {
          customer.stamps += 1;
          customer.step = 0;

          // Loyal-Tea logic
          if (customer.stamps === 3) reply += "
🎉 You’ve earned a FREE topping on your next order!";
          else if (customer.stamps === 5) reply += "
🎊 5 stamps! Enjoy 5% off your next order!";
          else if (customer.stamps === 8) reply += "
💪 8 stamps! Keep going — you’re close to a reward!";
          else if (customer.stamps === 10) reply += "
🌟 10 stamps! Your next (11th) drink is FREE! 🎁";

          // Cross-sell
          reply += "

🔥 Would you like to add a soft serve, waffle, or seasonal topping to your order?";
        }
      } else if (customer.name) {
        reply = `Welcome back ${customer.name}! 👋
Would you like to:
- Order to Car 🚗
- Pick Up 🏃‍♀️
- Delivery 🛵
Or just type *menu* to see what’s new 🍓`;
        customer.step = 0;
      } else {
        reply = `Hi there! I’m your Boba Chummy assistant 🧋. Want to see the menu? Type *menu* or choose:
- Order to Car
- Pick Up
- Delivery`;
      }

      customers[from] = customer;

      try {
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply }
        }, {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        console.error("Reply failed:", error.response?.data || error.message);
      }
    }
  }
  res.sendStatus(200);
});

app.listen(PORT, () => console.log("Boba Chummy Bot running on port", PORT));
