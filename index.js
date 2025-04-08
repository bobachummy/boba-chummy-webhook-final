require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WABA_TOKEN = process.env.WABA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

if (!VERIFY_TOKEN || !WABA_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Missing VERIFY_TOKEN, WABA_TOKEN or PHONE_NUMBER_ID');
  process.exit(1);
}

const users = new Map();

// Util functions
function detectBranch(text) {
  const lower = text.toLowerCase();
  if (lower.includes('guzape')) return 'Guzape';
  if (lower.includes('nile')) return 'Nile Uni';
  return null;
}

function detectOrderType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('car')) return 'Order to Car 🚗';
  if (lower.includes('delivery')) return 'Delivery 🚚';
  if (lower.includes('pick')) return 'Pick Up 🏃‍♀️';
  return null;
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '☀️ Good morning';
  if (hour < 17) return '🌤️ Good afternoon';
  return '🌙 Good evening';
}

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming messages
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object && body.entry) {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const val = change.value;
        if (val.messages && val.messages.length) {
          const msg = val.messages[0];
          const from = msg.from;
          const text = (msg.text && msg.text.body) || '';

          const reply = await handleMessage(from, text);
          await sendWhatsApp(from, reply);
        }
      }
    }
    return res.sendStatus(200);
  }
  res.sendStatus(404);
});

// Bot Logic
async function handleMessage(userId, text) {
  let user = users.get(userId);
  const greeting = getTimeGreeting();

  if (!user) {
    user = {
      name: null,
      branch: null,
      orderType: null,
      orders: [],
      step: 'chooseBranch',
      stamps: 0
    };
    users.set(userId, user);
    return `${greeting} 👋 Welcome to *Boba Chummy*! Which branch are you ordering from? Guzape or Nile Uni?`;
  }

  if (user.step === 'chooseBranch') {
    const branch = detectBranch(text);
    if (!branch) return '🏢 Please choose a branch: Guzape or Nile Uni.';
    user.branch = branch;
    user.step = 'chooseOrderType';
    return `✅ Great! You selected *${branch}*. Would you like *Order to Car* 🚗, *Delivery* 🚚, or *Pick Up* 🏃‍♀️?`;
  }

  if (user.step === 'chooseOrderType') {
    const type = detectOrderType(text);
    if (!type) return '📦 Please say: Order to Car, Delivery, or Pick Up.';
    user.orderType = type;
    user.step = 'takingOrder';
    return `🚀 Awesome choice! What would you like to order? Or check our menu at https://bobachummy.com/catalog`;
  }

  if (user.step === 'takingOrder') {
    if (/that'?s all|done/i.test(text.toLowerCase())) {
      user.step = 'confirmOrder';
      return `🧾 Got it! Your order: ${user.orders.join(', ')}. Staff will now send your total.`;
    }
    user.orders.push(text);
    return `✅ Added: *${text}*. Anything else? If you're done, say "that's all".`;
  }

  if (user.step === 'confirmOrder') {
    const match = text.match(/^total\s+(\d+)/i);
    if (match) {
      const amount = match[1];
      user.total = amount;
      user.step = 'awaitPayment';
      return `💳 Your total is ₦${amount}. Please pay to:
Account Name: Boba Chummy
Account Number: 1234567890
Bank: XYZ Bank

Send proof of payment.`;
    }
    return '⏳ Waiting for staff to send total. Staff, please type: total <amount>';
  }

  if (user.step === 'awaitPayment') {
    if (/proof|sent|paid/i.test(text.toLowerCase())) {
      user.step = 'awaitStaffConfirm';
      return '📨 Payment proof received. Staff will confirm shortly.';
    }
    return '⌛ Still waiting for payment proof.';
  }

  if (user.step === 'awaitStaffConfirm') {
    if (/confirm/i.test(text.toLowerCase())) {
      user.step = 'done';
      user.stamps += 1;
      return `✅ Payment confirmed! Your order will be ready shortly. You now have ${user.stamps} loyalty stamps 🏅
Thanks for choosing Boba Chummy 🧋`;
    }
    return '🕵️ Staff, please type *confirm* to verify payment.';
  }

  return '🤔 I didn’t get that. Let’s start over. Which branch are you ordering from?';
}

// Send message
async function sendWhatsApp(to, text) {
  const url = 'https://graph.facebook.com/v17.0/' + PHONE_NUMBER_ID + '/messages';
  const body = { messaging_product: 'whatsapp', to: to, text: { body: text } };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WABA_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    console.log('✅ Message sent:', json);
  } catch (err) {
    console.error('❌ sendWhatsApp error:', err);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('✅ Webhook running on port ' + PORT));