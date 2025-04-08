require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

// In-memory store for demo purposes
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

// Helpers
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

// Loyalty thresholds
const LOYALTY_REWARDS = [
  { stamps: 3,  reward: 'a free topping' },
  { stamps: 5,  reward: '5% off your next order' },
  { stamps: 10, reward: 'a free drink on your next visit' },
];

app.post('/webhook', (req, res) => {
  const msg    = req.body.message;
  const userId = req.body.userId;
  if (!msg || !userId) return res.sendStatus(400);

  let user = users.get(userId);
  if (!user) {
    user = { name:null, branch:null, orderType:null, stamps:0, orders:[], step:'askName' };
    users.set(userId, user);
    return res.json({ reply:`${getTimeGreeting()}! Welcome to Boba Chummy. What’s your name?` });
  }

  const text = msg.trim();

  // Hours query
  if (/open|hours|time/i.test(text)) {
    if (user.branch) {
      const h = BRANCH_HOURS[user.branch];
      if (isWithinHours(user.branch)) {
        return res.json({ reply:`⏰ Our ${user.branch.charAt(0).toUpperCase()+user.branch.slice(1)} branch is open daily from ${h.open}:00–${h.close}:00.` });
      } else {
        return res.json({ reply:`Sorry, our ${user.branch} branch is closed right now. We’re open ${h.open}:00–${h.close}:00.` });
      }
    }
    return res.json({ reply:`We’re open daily from 9:00–22:00 across all branches. Which branch are you ordering from?` });
  }

  switch (user.step) {
    case 'askName':
      user.name = text; user.step = 'askBranch';
      return res.json({ reply:`Hi ${user.name}! Which branch would you like? (Guzape or Wuse)` });

    case 'askBranch':
      const branch = detectBranch(text);
      if (!branch) return res.json({ reply:`Please choose Guzape or Wuse.` });
      user.branch = branch; user.step = 'askOrderType';
      return res.json({ reply:`Great! ${branch.charAt(0).toUpperCase()+branch.slice(1)} branch. Delivery, pickup, or car?` });

    case 'askOrderType':
      const type = detectOrderType(text);
      if (!type) return res.json({ reply:`Delivery, pickup, or car?` });
      user.orderType = type; user.step = 'takingOrder';
      return res.json({ reply:`Perfect, ${type}. What would you like to order today?` });

    case 'takingOrder':
      if (/that'?s all|done/i.test(text)) {
        user.step = 'crossSell';
        return res.json({ reply:`Got it! Add waffles, extra toppings, or combos?` });
      }
      user.orders.push(text);
      return res.json({ reply:`Added "${text}". Anything else? (Say "that's all" when finished.)` });

    case 'crossSell':
      if (/yes|add/i.test(text)) {
        user.step = 'takingOrder';
        return res.json({ reply:`Great! What would you like to add?` });
      }
      user.step = 'confirmOrder';
      const summary = user.orders.map((o,i)=>`${i+1}. ${o}`).join('\n');
      return res.json({ reply:`Here’s your order:\n${summary}\nShall I proceed to payment?` });

    case 'confirmOrder':
      if (/no|cancel/i.test(text)) {
        user.orders=[]; user.step='takingOrder';
        return res.json({ reply:`Order canceled. What would you like instead?` });
      }
      user.step = 'payment';
      const total = user.orders.reduce((s,item)=>
        s + (PRICE_LIST[item.toLowerCase()]||0),0
      );
      let r = `Your total is ₦${total}. `;
      r += user.orderType==='delivery'
         ? `Pay delivery on arrival?`
         : `Please send payment proof when ready.`;
      return res.json({ reply:r });

    case 'payment':
      if (user.orderType==='delivery' && /yes|sure/i.test(text)) {
        user.step='awaitProof';
        return res.json({ reply:`Great! We’ll collect on arrival. Now send payment proof.` });
      }
      if (/proof|sent|paid/i.test(text)) {
        user.step='complete';
        user.stamps++;
        let lm = `You’ve earned a stamp! Total stamps: ${user.stamps}.`;
        LOYALTY_REWARDS.forEach(rw=>{
          if(user.stamps===rw.stamps) lm+=` Congrats—${rw.reward}!`;
        });
        return res.json({ reply:`Payment confirmed! 🎉\n${lm}\nThanks for ordering, ${user.name}!` });
      }
      return res.json({ reply:`Waiting for your payment proof.` });

    default:
      user.step='askOrderType';
      return res.json({ reply:`Your usual order or check catalog?` });
  }
});

// Bind to the port Render provides (or 3000 locally)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook with full bot logic running on port ${PORT}`));
