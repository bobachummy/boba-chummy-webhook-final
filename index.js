
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const app = express();
app.use(bodyParser.json());

const users = new Map();

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
  const text = msg?.text?.body || '';

  let user = users.get(from);
  if (!user) {
    user = { name: null, lastOrder: [], orders: [], step: 'chooseBranch', stamps: 0 };
    users.set(from, user);
  }

  if (user.step === 'chooseBranch' && user.lastOrder && !text.toLowerCase().includes('order') && user.orders.length === 0) {
    if (text.toLowerCase().includes('repeat')) {
      user.orders = [...user.lastOrder];
      user.step = 'crossSell';
      return await sendWhatsApp(from,
        '✅ Your last order has been repeated! 🎉\n\n' +
        '📝 ' + user.orders.join('\n') + '\n\n' +
        'Would you like to add waffles 🧇, toppings 🍓, or combos 🍹?'
      );
    } else if (text.toLowerCase().includes('edit')) {
      user.step = 'editingLastOrder';
      return await sendWhatsApp(from,
        '📝 Here’s your last order:\n' +
        user.lastOrder.map((item, i) => `${i + 1}. ${item}`).join('\n') +
        '\n\nPlease reply with the number of the item you want to change, or type *cancel* to exit.'
      );
    } else {
      await sendWhatsApp(from,
        '👋 Welcome back ' + (user.name || '') + '! Would you like to repeat your last order? 🍹\n\n' +
        '📝 ' + user.lastOrder.join('\n') + '\n\n' +
        'Type *repeat* to confirm or *edit* to make changes.'
      );
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook running on port ${PORT}`));
