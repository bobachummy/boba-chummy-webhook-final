require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const app = express();
app.use(bodyParser.json());

// --- Environment Variables ---
const VERIFY_TOKEN      = process.env.WA_VERIFY_TOKEN;
const ACCESS_TOKEN      = process.env.WA_ACCESS_TOKEN;
const PHONE_NUMBER_ID   = process.env.WA_PHONE_NUMBER_ID; // Your WhatsApp Business phone number ID

// --- In-memory stores (replace with DB in production) ---
const sessions = {}; // { userId: { name, branch, orderType, orderItems: [], loyaltyCount, isNew, awaitingMore, awaitingPayment } }
const branches = ['Guzape', 'Wuse', 'Asokoro'];

// Static product catalog
const products = {
  drinks: [
    { name: 'Classic Milk Tea', price: 5 },
    { name: 'Taro Milk Tea', price: 6 },
    { name: 'Matcha Latte', price: 6.5 },
  ],
  waffles: [
    { name: 'Belgian Waffle', price: 4 },
    { name: 'Chocolate Waffle', price: 4.5 },
  ],
  toppings: [
    { name: 'Boba Pearls', price: 1 },
    { name: 'Pudding', price: 1.5 },
  ],
  combos: [
    { name: 'Drink + Waffle', price: 8 },
    { name: 'Drink + Waffle + Topping', price: 9 },
  ]
};

// Loyalty thresholds
const loyaltyRewards = {
  3: 'free topping',
  5: '5% discount',
  8: 'keep going',
  10: 'free drink on next order'
};

// Utility: time-aware greeting
function getGreeting(timestamp) {
  const hour = new Date(timestamp).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Detect order type from text
function detectOrderType(text) {
  text = text.toLowerCase();
  if (text.includes('delivery')) return 'delivery';
  if (text.includes('pick up') || text.includes('pickup')) return 'pickup';
  if (text.includes('order to car')) return 'order to car';
  return null;
}

// Smart delivery location reply
function handleLocation(branch) {
  if (branch.toLowerCase() === 'guzape') {
    return 'Yes! We deliver to all of Abuja 🚗✨';
  }
  return `We deliver to and around ${branch}.`;
}

// Cross-sell suggestions
function suggestCrossSell(items) {
  const suggestions = [];
  if (!items.find(i => i.type === 'waffle')) suggestions.push('waffles');
  if (!items.find(i => i.type === 'topping')) suggestions.push('toppings');
  if (suggestions.length) {
    return `Would you like to add any ${suggestions.join(' or ')}?`;
  }
  return null;
}

// Core message processing logic
function processMessage(userId, message, timestamp) {
  if (!sessions[userId]) {
    sessions[userId] = {
      isNew: true,
      loyaltyCount: 0,
      orderItems: [],
      awaitingMore: false,
      awaitingPayment: false
    };
  }
  const session = sessions[userId];
  let reply = '';

  // Greeting
  if (session.isNew) {
    session.isNew = false;
    return `${getGreeting(timestamp)}! Welcome to Boba Machine. What's your name?`;
  }

  // Capture name
  if (!session.name) {
    session.name = message.trim();
    return `Hi ${session.name}! Which branch are you ordering from? (${branches.join(', ')})`;
  }

  // Capture branch
  if (!session.branch) {
    const branch = branches.find(b => b.toLowerCase() === message.trim().toLowerCase());
    if (!branch) {
      return `Sorry, we don't have that branch. Please choose one: ${branches.join(', ')}`;
    }
    session.branch = branch;
    return `${handleLocation(branch)}
What would you like to do today? (Order, Delivery, Pick Up)`;
  }

  // Detect order type
  if (!session.orderType) {
    const type = detectOrderType(message);
    if (!type) {
      return 'Do you want Delivery, Pick Up, or Order to Car?';
    }
    session.orderType = type;
    if (session.loyaltyCount > 0) {
      return 'Welcome back! Want your usual order again or check the catalog?';
    }
    return `Great, ${session.orderType}. What would you like to order?`;
  }

  // Handle returning customer "usual order"
  if (message.toLowerCase().includes('usual')) {
    session.awaitingPayment = true;
    return 'Re-ordering your usual: [Mocked Items]. Shall I proceed?';
  }

  // Ordering logic
  if (!session.awaitingPayment) {
    if (!session.awaitingMore) {
      session.awaitingMore = true;
      session.orderItems.push({ name: message.trim(), type: 'drink' });
      return `Added ${message.trim()} to your order. ${suggestCrossSell(session.orderItems) || "Anything else? Say 'that's all' when finished."}`;
    }
    if (message.toLowerCase().includes("that's all")) {
      session.awaitingPayment = true;
      const total = session.orderItems.reduce((sum, item) => {
        const category = products.drinks.concat(products.waffles, products.toppings, products.combos);
        const prod = category.find(p => p.name.toLowerCase() === item.name.toLowerCase());
        return sum + (prod ? prod.price : 0);
      }, 0);
      return `Your total is $${total.toFixed(2)}. ${session.orderType === 'delivery' ? 'Do you want to pay on delivery?' : 'How would you like to pay?'}`;
    }
    session.orderItems.push({ name: message.trim(), type: 'add-on' });
    return `Added ${message.trim()}. Anything else? Say 'that's all' when finished.`;
  }

  // Payment flow
  if (session.awaitingPayment) {
    if (session.orderType === 'delivery' && message.toLowerCase().includes('yes')) {
      session.awaitingPayment = false;
      session.awaitingMore = false;
      return 'Please send payment proof when ready.';
    }
    session.loyaltyCount += 1;
    let resp = 'Payment confirmed! 🎉 Your order is placed.';
    const reward = loyaltyRewards[session.loyaltyCount];
    if (reward) resp += ` You earned a loyalty reward: ${reward}!`;
    // Reset order state
    session.orderType = null;
    session.branch = null;
    session.orderItems = [];
    return resp;
  }

  // Fallback
  return "Sorry, I didn't get that. Can you rephrase?";
}

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Send message via WhatsApp Cloud API
async function sendTextMessage(to, text) {
  const url = `https://graph.facebook.com/v16.0/${PHONE_NUMBER_ID}/messages?access_token=${ACCESS_TOKEN}`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    text: { body: text }
  };
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// Webhook POST handler
app.post('/webhook', async (req, res) => {
  const entries = req.body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const messages = change.value.messages || [];
      for (const msg of messages) {
        const from = msg.from; // sender's WhatsApp ID
        const text = msg.text && msg.text.body;
        const timestamp = msg.timestamp * 1000;
        if (text) {
          const reply = processMessage(from, text, timestamp);
          await sendTextMessage(from, reply);
        }
      }
    }
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
