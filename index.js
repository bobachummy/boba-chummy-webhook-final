
console.log("✅ Boba Chummy Smart Bot initialized!");

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "boba_order_token";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", (req, res) => {
  console.log("📥 Webhook received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// ✅ FIX: Ensure app listens on port so Render can detect it
app.listen(PORT, () => {
  console.log(`✅ Webhook with full bot logic running on port ${PORT}`);
});
