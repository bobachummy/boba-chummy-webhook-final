const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const app = express();
app.use(bodyParser.json());

const users = new Map();

function isBranchOpen(branch) {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  if (branch === 'Guzape') {
    return timeInMinutes >= 540 && timeInMinutes <= 1320; // 9:00am - 10:00pm
  } else if (branch === 'Nile Uni') {
    if (day === 0) return false; // Sunday
    return timeInMinutes >= 600 && timeInMinutes <= 1110; // 10:00am - 6:30pm
  }
  return false;
}

async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    text: { body: text }
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WABA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    console.log('✅ Message sent:', json);
  } catch (err) {
    console.error('❌ sendWhatsApp error:', err);
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const msg = change?.value?.messages?.[0];
  const from = msg?.from;
  const text = msg?.text?.body.trim() || '';

  if (!msg || !from) {
    console.warn('⚠️ No message or phone number found in webhook payload.');
    return res.sendStatus(200);
  }

  let user = users.get(from);
  if (!user) {
    user = { step: 'greet' };
    users.set(from, user);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning ☀️' : hour < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';

  if (user.step === 'greet') {
    user.step = 'chooseBranch';
    return await sendWhatsApp(from, `${greeting} and welcome to Boba Chummy 🧋!
Which branch would you like to order from — Guzape or Nile Uni?`);
  }

  if (user.step === 'chooseBranch') {
    if (/guzape/i.test(text)) user.branch = 'Guzape';
    else if (/nile/i.test(text)) user.branch = 'Nile Uni';
    else return await sendWhatsApp(from, `Please select a branch: Guzape or Nile Uni.`);

    if (!isBranchOpen(user.branch)) {
      return await sendWhatsApp(from, `⏰ Our ${user.branch} branch is currently closed. Please reach us during open hours.`);
    }

    user.step = 'chooseOrderType';
    return await sendWhatsApp(from, `Would you like 🚗 Order to Car, 🛵 Delivery, or 🤝 Pickup?`);
  }

  if (user.step === 'chooseOrderType') {
    if (/car/i.test(text)) {
      user.step = 'carDetails';
      return await sendWhatsApp(from, `🚗 What's your car plate number? Are you parked outside or on the way?`);
    } else if (/delivery/i.test(text)) {
      if (user.branch === 'Nile Uni') {
        return await sendWhatsApp(from, `🚫 Delivery is only available at our Guzape branch. Want to switch to Guzape? 🛵`);
      }
      user.step = 'orderDetails';
      return await sendWhatsApp(from, `What would you like to order today? 🍹`);
    } else if (/pickup/i.test(text)) {
      user.step = 'pickupDetails';
      return await sendWhatsApp(from, `🤝 Will you pick up now or later? Type "now" or "later".`);
    }
    return await sendWhatsApp(from, `Please choose a valid order type: 🚗 Order to Car, 🛵 Delivery, or 🤝 Pickup.`);
  }

  if (user.step === 'carDetails') {
    if (/parked/i.test(text)) {
      user.step = 'orderDetails';
      return await sendWhatsApp(from, `Perfect! What would you like to order today? 🚗🍹`);
    } else {
      return await sendWhatsApp(from, `Got it! When you arrive, type "parked outside" so we can prepare your drink fresh.`);
    }
  }

  if (user.step === 'pickupDetails') {
    if (/now/i.test(text)) {
      user.step = 'orderDetails';
      return await sendWhatsApp(from, `What would you like to order today? 🤝🍹`);
    } else {
      return await sendWhatsApp(from, `No problem! When you're on your way, just type "coming now" 🧋`);
    }
  }

  if (user.step === 'orderDetails') {
    if (!text.match(/tea|waffle|ice cream|ramen|cone|combo/i)) {
      return await sendWhatsApp(from, `Here’s our menu to help you decide: https://bobachummy.com/menu 📋`);
    } else {
      return await sendWhatsApp(from, `Thanks! We'll send your total and payment info shortly 💸`);
    }
  }

  return await sendWhatsApp(from, `🤖 I'm not sure how to help with that. Type "menu" to see what we offer or restart by choosing a branch.`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook running on port ${PORT}`));
