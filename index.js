require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// Log that the handler loaded
console.log('🐞 Webhook handler loaded');

// Env vars
const VERIFY_TOKEN     = process.env.VERIFY_TOKEN;
const WABA_TOKEN       = process.env.WABA_TOKEN;
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;
if (!VERIFY_TOKEN || !WABA_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Missing VERIFY_TOKEN, WABA_TOKEN or PHONE_NUMBER_ID');
  process.exit(1);
}

// In-memory store
const users = new Map();

// Static price list
const PRICE_LIST = {
  'classic milk tea': 500,
  'taro milk tea': 600,
  'matcha latte': 700,
  'boba waffles': 400,
  'extra boba': 100,
  'fruit jelly': 150,
};

// Branch hours
const BRANCH_HOURS = {
  guzape: { open: 9, close: 22 },
  wuse:  { open: 9, close: 22 },
};

// Loyalty thresholds
const LOYALTY_REWARDS = [
  { stamps: 3,  reward: 'a free topping' },
  { stamps: 5,  reward: '5% off your next order' },
  { stamps: 10, reward: 'a free drink on your next visit' },
];

// Helpers (copy your existing ones) …
function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
function isWithinHours(branch) {
  const h = BRANCH_HOURS[branch.toLowerCase()];
  if (!h) return false;
  const hour = new Date().getHours();
  return hour >= h.open && hour < h.close;
}
function detectBranch(text) {
  for (let b of Object.keys(BRANCH_HOURS)) {
    if (text.toLowerCase().includes(b)) return b;
  }
  return null;
}
function detectOrderType(text) {
  text = text.toLowerCase();
  if (text.includes('delivery')) return 'delivery';
  if (text.includes('pickup') || text.includes('pick up')) return 'pickup';
  if (text.includes('car') || text.includes('curbside')) return 'car';
  return null;
}

// Verification endpoint
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

// Message webhook
app.post('/webhook', async (req, res) => {
  console.log('⏰ Incoming webhook payload:', JSON.stringify(req.body, null, 2));
  const body = req.body;
  if (body.object && body.entry) {
    for (let entry of body.entry) {
      for (let change of entry.changes) {
        const val = change.value;
        if (val.messages && val.messages.length) {
          const msg  = val.messages[0];
          const from = msg.from;
          const text = msg.text?.body || '';

          // Run your bot logic and get a reply string
          let replyText = handleBotMessage(from, text);
          console.log('➡️ Reply text:', replyText);

          // Send the reply
          await sendWhatsApp(from, replyText);
        }
      }
    }
    return res.sendStatus(200);
  }
  res.sendStatus(404);
});

// Your bot flow (adapted from your previous code)
function handleBotMessage(userId, message) {
  let user = users.get(userId);
  if (!user) {
    user = { name:null, branch:null, orderType:null, stamps:0, orders:[], step:'askName' };
    users.set(userId, user);
    return `${getTimeGreeting()}! Welcome to Boba Chummy. What’s your name?`;
  }
  const text = message.trim();

  // hours query
  if (/open|hours|time/i.test(text)) {
    if (user.branch) {
      const h = BRANCH_HOURS[user.branch];
      if (isWithinHours(user.branch)) {
        return `⏰ Our ${user.branch.charAt(0).toUpperCase()+user.branch.slice(1)} branch is open daily from ${h.open}:00–${h.close}:00.`;
      } else {
        return `Sorry, our ${user.branch} branch is closed right now. We’re open ${h.open}:00–${h.close}:00.`;
      }
    }
    return `We’re open daily from 9:00–22:00 across all branches. Which branch are you ordering from?`;
  }

  switch (user.step) {
    case 'askName':
      user.name = text; user.step = 'askBranch';
      return `Hi ${user.name}! Which branch would you like? (Guzape or Wuse)`;

    case 'askBranch':
      {
        const branch = detectBranch(text);
        if (!branch) return `Please choose Guzape or Wuse.`;
        user.branch = branch; user.step = 'askOrderType';
        return `Great! ${branch.charAt(0).toUpperCase()+branch.slice(1)} branch. Delivery, pickup, or car?`;
      }

    case 'askOrderType':
      {
        const type = detectOrderType(text);
        if (!type) return `Delivery, pickup, or car?`;
        user.orderType = type; user.step = 'takingOrder';
        return `Perfect, ${type}. What would you like to order today?`;
      }

    case 'takingOrder':
      if (/that'?s all|done/i.test(text)) {
        user.step = 'crossSell';
        return `Got it! Add waffles, extra toppings, or combos?`;
      }
      user.orders.push(text);
      return `Added "${text}". Anything else? (Say "that's all" when finished.)`;

    case 'crossSell':
      if (/yes|add/i.test(text)) {
        user.step = 'takingOrder';
        return `Great! What would you like to add?`;
      }
      user.step = 'confirmOrder';
      const summary = user.orders.map((o,i)=>`${i+1}. ${o}`).join('\n');
      return `Here’s your order:\n${summary}\nShall I proceed to payment?`;

    case 'confirmOrder':
      if (/no|cancel/i.test(text)) {
        user.orders = []; user.step = 'takingOrder';
        return `Order canceled. What would you like instead?`;
      }
      user.step = 'payment';
      const total = user.orders.reduce((s,item)=>s + (PRICE_LIST[item.toLowerCase()]||0),0);
      let r = `Your total is ₦${total}. `;
      r += user.orderType==='delivery'
         ? `Pay delivery on arrival?`
         : `Please send payment proof when ready.`;
      return r;

    case 'payment':
      if (user.orderType==='delivery' && /yes|sure/i.test(text)) {
        user.step='awaitProof';
        return `Great! We’ll collect on arrival. Now send payment proof.`;
      }
      if (/proof|sent|paid/i.test(text)) {
        user.step='complete';
        user.stamps++;
        let lm = `You’ve earned a stamp! Total stamps: ${user.stamps}.`;
        LOYALTY_REWARDS.forEach(rw=>{
          if(user.stamps===rw.stamps) lm+=` Congrats—${rw.reward}!`;
        });
        return `Payment confirmed! 🎉\n${lm}\nThanks for ordering, ${user.name}!`;
      }
      return `Waiting for your payment proof.`;

    default:
      user.step='askOrderType';
      return `Your usual order or check catalog?`;
  }
}

// Send via WhatsApp Cloud API
async function sendWhatsApp(to, text) {
  console.log('➡️ sendWhatsApp called with to:', to, 'text:', text);
  const url = 'https://graph.facebook.com/v17.0/' + PHONE_NUMBER_ID + '/messages';
  const body = { messaging_product: 'whatsapp', to, text: { body: text } };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${WABA_TOKEN}\`,
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

// Bind server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`✅ Webhook running on port \${PORT}\`));
