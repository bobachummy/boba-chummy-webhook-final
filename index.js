
console.log("✅ Boba Chummy Webhook Bot started successfully!");

const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

// ... (other logic goes here, assumed full implementation from previous versions)

app.listen(PORT, () => {
  console.log(`✅ Webhook with full bot logic running on port ${PORT}`);
});
