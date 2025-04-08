require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Environment variables
const VERIFY_TOKEN    = process.env.VERIFY_TOKEN;
const WABA_TOKEN      = process.env.WABA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
if (!VERIFY_TOKEN || !WABA_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Missing VERIFY_TOKEN, WABA_TOKEN or PHONE_NUMBER_ID');
  process.exit(1);
}

// In-memory user store (replace with DB in production)
const users = new Map();

// Static data
const PRICE_LIST = {
  'classic milk tea': 500,
  'taro milk tea': 600,
  'matcha latte': 700,
  'boba waffles': 400,
  'extra boba': 100,
  'fruit jelly': 150
};

const BRANCH_HOURS = {
  guzape: { open: 9, close: 22, days: [0,1,2,3,4,5,6] },            // Open daily
  'nile uni': { open: 10, close: 18.5, days: [1,2,3,4,5,6] } // Closed Sunday (0)
};

const LOYALTY_GOAL = 10; // stamps per month for free drink

// Helpers
function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function isBranchOpen(branch) {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  const b = BRANCH_HOURS[branch];
  if (!b || !b.days.includes(day)) return false;
  return hour >= b.open && hour < b.close;
}

function branchHoursText(branch) {
  const b = BRANCH_HOURS[branch];
  if (!b) return '';
  const open = b.open;
  const close = b.close;
  const days = b.days.includes(0) ? 'daily' : 'Mon–Sun except Sunday';
  return `${days} ${open}:00–${close}:00`;
}

function detectBranch(text) {
  text = text.toLowerCase();
  for (let b of Object.keys(BRANCH_HOURS)) {
    if (text.includes(b)) return b;
  }
  return null;
}

function detectOrderType(text) {
  text = text.toLowerCase();
  if (text.includes('order to car')) return 'car';
  if (text.includes('delivery')) return 'delivery';
  if (text.includes('pick up') || text.includes('pickup')) return 'pickup';
  return null;
}

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object && body.entry) {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const val = change.value;
        if (val.messages && val.messages.length) {
          const msg  = val.messages[0];
          const from = msg.from;
          const text = (msg.text && msg.text.body) || '';

          // Process and get reply
          const reply = await handleMessage(from, text);
          // Send reply
          await sendWhatsApp(from, reply);
        }
      }
    }
    return res.sendStatus(200);
  }
  res.sendStatus(404);
});

// Main bot logic
async function handleMessage(userId, text) {
  let user = users.get(userId);
  const greeting = getTimeGreeting();

  if (!user) {
    // New user
    user = {
      name: null,
      branch: null,
      orderType: null,
      orders: [],
      stamps: 0,
      step: 'chooseBranch'
    };
    users.set(userId, user);
    return `${greeting}! Welcome to Boba Chummy 🎉
Which branch are you ordering from? Guzape or Nile Uni?`;
  }

  // Recognize returning customer
  if (user.name && user.step === 'chooseBranch' && !user.branch) {
    return `Welcome back, ${user.name}! Which branch would you like today? Guzape or Nile Uni?`;
  }

  // Branch selection
  if (user.step === 'chooseBranch') {
    const branch = detectBranch(text);
    if (!branch) {
      return `Please choose a branch: Guzape or Nile Uni.`;
    }
    user.branch = branch;
    user.step = 'chooseOrderType';
    if (!isBranchOpen(branch)) {
      return `Sorry, our ${branch.charAt(0).toUpperCase()+branch.slice(1)} branch is currently closed. We operate ${branchHoursText(branch)}.`;
    }
    return `Great! You chose ${branch.charAt(0).toUpperCase()+branch.slice(1)} branch. Would you like Order to Car, Delivery, or Pick Up?`;
  }

  // Order type selection
  if (user.step === 'chooseOrderType') {
    const type = detectOrderType(text);
    if (!type) {
      return `Please let me know: Order to Car, Delivery, or Pick Up.`;
    }
    user.orderType = type;
    user.step = 'takingOrder';
    return `Perfect, ${type === 'car' ? 'Order to Car' : type.charAt(0).toUpperCase()+type.slice(1)}. What would you like to have? You can also view our catalog here: https://bobachummy.com/catalog`;
  }

  // Taking order
  if (user.step === 'takingOrder') {
    if (/that'?s all|done/i.test(text)) {
      user.step = 'confirmOrder';
      return `Thanks! I have: ${user.orders.join(', ')}. Would you like to add waffles or extra toppings?`;
    }
    // Add item
    user.orders.push(text);
    return `Added "${text}". Anything else? Say "that's all" when finished.`;
  }

  // Cross-selling prompt
  if (user.step === 'confirmOrder') {
    if (/yes|add/i.test(text)) {
      user.step = 'takingOrder';
      return `Great! What would you like to add?`;
    }
    if (/no|done/i.test(text)) {
      // Calculate total
      const total = user.orders.reduce((sum, item) => {
        const key = item.toLowerCase();
        return sum + (PRICE_LIST[key] || 0);
      }, 0);
      user.step = 'awaitPayment';
      return `Your total is ₦${total}. Please send payment proof when you're ready.`;
    }
    return `Would you like to add waffles, extra toppings, or proceed to payment?`;
  }

  // Await payment proof
  if (user.step === 'awaitPayment') {
    if (/proof|sent|paid/i.test(text)) {
      user.step = 'completed';
      // Loyalty stamp
      user.stamps++;
      let loyaltyMsg = `You have ${user.stamps} LOYAL-TEA stamps.`;
      if (user.stamps >= LOYALTY_GOAL) {
        loyaltyMsg += ` 🎉 Congrats! You've earned a free drink. Use it within this month.`;
        user.stamps = 0; // reset after reward
      }
      // Confirm and ETA
      return `Payment confirmed! ✅
${loyaltyMsg}
Thanks, ${user.name || 'there'}! Your order is being prepared and will be ready shortly. ETA: 10–15 minutes.`;
    }
    return `I'm waiting for your payment proof. Please send it when ready.`;
  }

  // Completed order follow-up
  if (user.step === 'completed') {
    // After confirmation, send ready notification
    user.step = 'done';
    if (user.orderType === 'car') {
      return `Your order is ready! 🚗 Please pull up to our ${user.branch.charAt(0).toUpperCase()+user.branch.slice(1)} pickup window and show this message.`;
    }
    if (user.orderType === 'pickup') {
      return `Your order is ready for pickup at our ${user.branch.charAt(0).toUpperCase()+user.branch.slice(1)} counter. Enjoy!`;
    }
    // delivery
    return `Your order is on its way! 🚚 We'll deliver to you ASAP. Thanks for choosing Boba Chummy.`;
  }

  // Fallback
  user.step = 'chooseBranch';
  return `Sorry, I didn't get that. Which branch? Guzape or Nile Uni?`;
}

// Send message via WhatsApp Cloud API
async function sendWhatsApp(to, text) {
  const url = 'https://graph.facebook.com/v17.0/' + PHONE_NUMBER_ID + '/messages';
  const body = { messaging_product: 'whatsapp', to: to, text: { body: text } };
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + WABA_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('✅ Webhook running on port ' + PORT));
