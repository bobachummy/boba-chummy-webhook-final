const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const app = express();
app.use(bodyParser.json());

const users = new Map();
const bankAccounts = {
  "Guzape": "🏦 Moniepoint - 5985829218",
  "Nile Uni": "🏦 Moniepoint - 5775651915"
};

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
  const text = msg?.text?.body || '';

  if (!msg || !from) {
    console.warn('⚠️ No message or phone number found in webhook payload.');
    return res.sendStatus(200);
  }

  let user = users.get(from);
  if (!user) {
    user = {
      name: null,
      branch: null,
      orderType: null,
      lastOrder: [],
      orders: [],
      step: 'chooseBranch',
      stamps: 0
    };
    users.set(from, user);
  }

  if (user.step === 'chooseBranch') {
    if (/guzape/i.test(text)) {
      user.branch = 'Guzape';
    } else if (/nile/i.test(text)) {
      user.branch = 'Nile Uni';
    }

    if (!user.branch) {
      return await sendWhatsApp(from, 'Welcome to Boba Chummy 🧋! Which branch would you like to order from — Guzape or Nile Uni?');
    }

    if (!isBranchOpen(user.branch)) {
      return await sendWhatsApp(
        from,
        `⏰ Our ${user.branch} branch is currently closed.
Would you like to schedule your order or check our catalog? 📒`
      );
    }

    user.step = 'getOrderType';
    return await sendWhatsApp(from, `Awesome! Will this be for 🚗 Order to Car, 🛵 Delivery, or 🤝 Pickup?`);
  }

  if (user.step === 'getOrderType') {
    if (/car/i.test(text)) {
      user.orderType = 'Order to Car';
    } else if (/delivery/i.test(text)) {
      if (user.branch === 'Nile Uni') {
        return await sendWhatsApp(from, `🚫 Delivery is only available at our Guzape branch.
Would you like to switch to Guzape? We deliver anywhere in Abuja! 🛵`);
      }
      user.orderType = 'Delivery';
    } else if (/pickup/i.test(text)) {
      user.orderType = 'Pickup';
    }

    if (!user.orderType) {
      return await sendWhatsApp(from, 'Please choose one: 🚗 Order to Car, 🛵 Delivery, or 🤝 Pickup.');
    }

    user.step = 'getName';
    return await sendWhatsApp(from, `Great! What name should we put the order under? 😊`);
  }

  if (user.step === 'getName') {
    user.name = text;
    user.step = 'getCustomNote';
    return await sendWhatsApp(from, `Would you like a special note printed on your cup? ✍️ (Say "no" to skip)`);
  }

  if (user.step === 'getCustomNote') {
    user.customNote = /no/i.test(text) ? null : text;
    user.step = user.orderType === 'Pickup' ? 'pickupTime' : user.orderType === 'Order to Car' ? 'arrivalStatus' : 'startOrder';

    if (user.step === 'pickupTime') {
      return await sendWhatsApp(from, `⏰ Will you be picking up your order now or later? (Reply with "now" or "later")`);
    }

    if (user.step === 'arrivalStatus') {
      return await sendWhatsApp(from, `🚗 Are you at the car park now or on the way? (Reply with "at the park" or "on the way")`);
    }

    return await sendWhatsApp(from, `What would you like to order today? 🍹`);
  }

  if (user.step === 'pickupTime') {
    if (/later/i.test(text)) {
      user.awaitingReady = true;
      return await sendWhatsApp(from, `Great! When you're ready, just type "coming now" so we can start preparing it fresh! 🧋`);
    }
    user.step = 'startOrder';
    return await sendWhatsApp(from, `Awesome! What would you like to order? 🍡`);
  }

  if (user.step === 'arrivalStatus') {
    if (/on the way/i.test(text)) {
      user.awaitingHere = true;
      return await sendWhatsApp(from, `Cool! Send "I'm at the park" once you arrive so we can start your order fresh 🧃`);
    }
    user.step = 'startOrder';
    return await sendWhatsApp(from, `Great! What would you like to order? 🍵`);
  }

  if (user.step === 'startOrder') {
    user.orders.push(text);
    user.step = 'crossSell';
    return await sendWhatsApp(from, `Would you like to add waffles 🧇, toppings 🍓, or combos 🍹? If not, type "that's all".`);
  }

  if (user.step === 'crossSell') {
    if (/that's all|no|done/i.test(text)) {
      user.lastOrder = [...user.orders];
      user.step = 'awaitingTotal';
      return await sendWhatsApp(from, `👍 Got it! We’re calculating your total and will send payment info shortly.`);
    } else {
      user.orders.push(text);
      return await sendWhatsApp(from, `Added "${text}". Anything else? (Type "that's all" when done)`);
    }
  }

  if (user.step === 'awaitingTotal' && /total/i.test(text)) {
    user.step = 'awaitingPayment';
    return await sendWhatsApp(from,
      `💳 Your total is ready! Please make payment to:
${bankAccounts[user.branch]}

Send a screenshot or "I’ve paid" once done. 💸`
    );
  }

  if (user.step === 'awaitingPayment' && /paid|proof|screenshot/i.test(text)) {
    user.step = 'waitConfirm';
    return await sendWhatsApp(from, `🕵️ Waiting for our staff to confirm your payment... Hang tight! 🧾`);
  }

  if (user.step === 'waitConfirm' && /confirm/i.test(text)) {
    user.step = 'complete';
    user.stamps += 1;
    const eta = user.orderType === 'Delivery' ? '🛵 Your order will be delivered shortly!' :
                 user.orderType === 'Pickup' ? '🤝 Ready for pickup soon!' :
                 '🚗 Get ready to receive your Boba at the car park!';
    return await sendWhatsApp(from,
      `🎉 Payment confirmed!
Thanks ${user.name}! ${eta}

🌟 You earned a LOYAL-TEA stamp! Total: ${user.stamps}`
    );
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook running on port ${PORT}`));
