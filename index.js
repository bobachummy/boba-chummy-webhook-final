
const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const VERIFY_TOKEN = "boba_order_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const NILE_ACCOUNT = "5775651915 (Moniepoint)";
const GUZAPE_ACCOUNT = "5985829218 (Moniepoint)";
const CATALOG_LINK = "https://wa.me/c/234XXXXXXXXXX"; // Replace with real link

let customers = {}; // Stores user sessions by number
let orders = {}; // Store full orders
let lastOrder = {}; // For reorder functionality

const sendWhatsApp = async (to, message) => {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("Send error:", err.response?.data || err.message);
  }
};

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
    const msg = entry?.messages?.[0];
    const from = msg?.from;
    const text = msg?.text?.body?.trim();
    const name = entry?.contacts?.[0]?.profile?.name || "Customer";

    if (!from || !text) return res.sendStatus(200);

    const user = customers[from] || {
      name,
      branch: "",
      state: "start",
      orderType: "",
      data: {},
      stamps: 0
    };

    let response = "";
    const lower = text.toLowerCase();

    if (lower === "repeat" && lastOrder[from]) {
      response = `Reordering your last: ${lastOrder[from].summary}
Would you like to pay now or on arrival?`;
      user.state = "awaiting_payment_option";
    } else if (["menu", "catalog"].some(k => lower.includes(k))) {
      response = `Here’s our menu! 🧋✨
${CATALOG_LINK}
Would you like:
- Order to Car 🚗
- Pick Up 🏃‍♀️
- Delivery 🛵`;
      user.state = "awaiting_order_type";
    } else if (["order to car", "pickup", "pick up", "delivery"].some(k => lower.includes(k))) {
      if (lower.includes("order to car")) {
        user.orderType = "car";
        response = "Please confirm, are you parked outside or still on the way? 🚗";
        user.state = "awaiting_arrival";
      } else if (lower.includes("pickup")) {
        user.orderType = "pickup";
        response = "Great! Please send:
1. Name
2. Order
3. Pickup Branch
4. Custom Note 💌";
        user.state = "collecting_info";
      } else if (lower.includes("delivery")) {
        user.orderType = "delivery";
        response = "Sweet! Please send:
1. Name
2. Address
3. Landmark
4. Phone Number
5. Order
6. Cup Note 💌";
        user.state = "collecting_info";
      }
    } else if (user.state === "awaiting_arrival") {
      if (lower.includes("on the way")) {
        response = "Thanks! Let us know when you arrive so we can start prepping your drink to keep it icy-fresh 🧊";
        user.state = "waiting_for_parked";
      } else {
        response = "Awesome! Please send:
1. Name
2. Car Color
3. Plate Number
4. Order
5. Cup Note 💌";
        user.state = "collecting_info";
      }
    } else if (user.state === "waiting_for_parked" && lower.includes("i’m parked now")) {
      response = "Thanks! Please send:
1. Name
2. Car Color
3. Plate Number
4. Order
5. Cup Note 💌";
      user.state = "collecting_info";
    } else if (user.state === "collecting_info") {
      const lines = text.split("
");
      const type = user.orderType;

      if ((type === "car" && lines.length >= 5) || (type === "pickup" && lines.length >= 4) || (type === "delivery" && lines.length >= 6)) {
        user.data = lines;
        let branch = type === "delivery" || type === "car" ? "Guzape" : lines[2];
        user.branch = branch;
        if (type !== "pickup" && branch.toLowerCase() !== "guzape") {
          response = "🚗 Delivery and Order to Car are only available at our Guzape Branch.
Please switch to Pick Up or choose Guzape.";
        } else {
          response = "Would you like to add a soft serve, waffle, or seasonal topping? 🍦🥞
Or just reply 'that's all'";
          user.state = "cross_sell";
        }
      } else {
        response = "Please make sure you follow the format correctly 🙏";
      }
    } else if (user.state === "cross_sell") {
      if (lower.includes("that's all")) {
        let price = 5000; // placeholder
        user.data.push(`₦${price}`);
        response = `Your total is ₦${price}.
Would you like to pay now or on arrival?`;
        user.state = "awaiting_payment_option";
      } else {
        response = "Added! Anything else? Or reply 'that's all' to proceed.";
      }
    } else if (user.state === "awaiting_payment_option") {
      if (lower.includes("arrival")) {
        response = "Awesome! Please pay on delivery.
We'll prep your order now 💛";
        orders[from] = user;
        lastOrder[from] = { summary: user.data.join(", "), type: user.orderType };
        user.state = "ready";
      } else {
        const account = user.branch.toLowerCase().includes("guzape") ? GUZAPE_ACCOUNT : NILE_ACCOUNT;
        response = `Please pay to:
${account}
Send your payment proof here 🧾`;
        user.state = "awaiting_payment_proof";
      }
    } else if (user.state === "awaiting_payment_proof" && lower.includes("confirm")) {
      response = `💖 Payment confirmed! Thank you, ${user.name}. Your order is now being prepped!
You’ve earned a LOYAL-TEA stamp 🍵`;
      user.stamps += 1;
      if (user.stamps === 3) response += "
Free topping on your next order! 🎉";
      if (user.stamps === 5) response += "
5% off your next order! 🎊";
      if (user.stamps === 8) response += "
Keep going — you’re close to a reward! 💪";
      if (user.stamps === 10) response += "
Next drink is FREE 🥳";
      user.state = "ready";
    } else if (["ready car", "ready pickup", "ready delivery"].some(k => lower.includes(k))) {
      response = `Hey ${user.name}, your order is ready! Come grab your Boba joy now! 🧋💫`;
    } else {
      response = "👋 Welcome to Boba Chummy! Type *menu* to see our options or tell us what you'd like 🧋";
    }

    customers[from] = user;
    await sendWhatsApp(from, response);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => console.log("Boba Chummy Bot running on port", PORT));
