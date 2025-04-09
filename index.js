const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const body = req.body;
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = msg?.from;
  const text = msg?.text?.body?.toLowerCase() || '';

  if (!from || !text) return res.sendStatus(200);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning ☀️' :
    hour < 17 ? 'Good afternoon 🌤️' :
    'Good evening 🌙';

  let response = '';

  if (text.includes('guzape') || text.includes('nile')) {
    const branch = text.includes('guzape') ? 'Guzape' : 'Nile Uni';
    const open = branch === 'Guzape'
      ? '9:00am to 10:00pm daily'
      : '10:00am to 6:30pm (closed on Sundays)';
    response = `${greeting}!\nWelcome to Boba Chummy 🧋\n${branch} is open ${open}.\nWould you like 🚗 Order to Car, 🛵 Delivery, or 🤝 Pickup?\n\nCheck our menu: https://bobachummy.com/menu`;
  } else if (text.includes('car')) {
    response = '🚗 What’s your car plate number? Are you parked outside?';
  } else if (text.includes('pickup')) {
    response = '🤝 Will you pick up now or later?';
  } else if (text.includes('delivery')) {
    response = '🛵 Please send your address and we’ll confirm availability!';
  } else if (text.includes('tea') || text.includes('waffle') || text.includes('ice cream')) {
    response = '✅ Got it! We’ll send your total shortly 💸';
  } else {
    return res.sendStatus(200); // ignore undefined messages
  }

  console.log('➡️ Replying to:', from, '|', response);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook running on port ${PORT}`));

