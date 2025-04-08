
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
