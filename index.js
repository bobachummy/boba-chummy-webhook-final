const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

async function sendWhatsApp(to, text) {
  if (!to || !text) return;
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
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = msg?.from;
  const text = msg?.text?.body?.trim().toLowerCase();

  if (!msg || !from || !text) {
    console.warn('⚠️ No valid message or phone number found.');
    return res.sendStatus(200);
  }

  console.log(`➡️ Incoming from ${from}: ${text}`);

  let response = '';

  if (text.includes('guzape') || text.includes('nile')) {
    const branch = text.includes('guzape') ? 'Guzape' : 'Nile Uni';
    const open = branch === 'Guzape'
      ? '9:00am to 10:00pm daily'
      : '10:00am to 6:30pm (closed on Sundays)';
    response = `Welcome to Boba Chummy 🧋
${branch} is open ${open}.
Would you like 🚗 Order to Car, 🛵 Delivery, or 🤝 Pickup?
Check our menu: https://bobachummy.com/menu`;
  } else if (text.includes('car')) {
    response = '🚗 What’s your car plate number? Are you parked outside?';
  } else if (text.includes('pickup')) {
    response = '🤝 Will you pick up now or later?';
  } else if (text.includes('delivery')) {
    response = '🛵 Please send your address and we’ll confirm availability!';
  } else if (text.match(/tea|waffle|ice cream|ramen|combo|cone/)) {
    response = '✅ Got it! We’ll send your total shortly 💸';
  } else {
    response = `👋 Hey there! Please start by telling us your preferred branch: Guzape or Nile Uni.`;
  }

  await sendWhatsApp(from, response);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook running on port ${PORT}`));
