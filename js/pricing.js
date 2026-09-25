// Pure pricing logic. All money is integer pence to avoid float drift.
// Nothing here is hidden from the customer: every number this returns is shown in the UI.

// Card processors take a % of the whole charge, so we "gross up":
// charge C such that C - C*pct = amount  =>  fee = amount * pct / (1 - pct).
// Round up to the penny so the shop never quietly eats the difference.
export function processorFee(amountPence, percent) {
  if (amountPence <= 0 || percent <= 0) return 0;
  return Math.ceil(amountPence * percent / (1 - percent) - 1e-9);
}

export function itemBreakdown(product, config) {
  const production = product.productionPence;
  const artist = Math.round(production * config.artistShareOfProduction);
  const shop = Math.round(production * config.shopShareOfProduction);
  const processor = processorFee(production + artist + shop, config.paymentFee.percent);
  return { production, artist, shop, processor, total: production + artist + shop + processor };
}

// Shipping is per parcel, not per item: the most expensive item to ship pays its
// "first item" rate, every other unit adds its (smaller) "extra item" rate.
export function shippingPence(lines, productsById) {
  const units = [];
  for (const line of lines) {
    const p = productsById[line.productId];
    for (let i = 0; i < line.qty; i++) units.push(p);
  }
  if (units.length === 0) return 0;
  units.sort((a, b) => b.shippingFirstPence - a.shippingFirstPence);
  return units[0].shippingFirstPence +
    units.slice(1).reduce((sum, p) => sum + p.shippingExtraPence, 0);
}

export function cartBreakdown(lines, productsById, config) {
  const t = { production: 0, artist: 0, shop: 0, shipping: 0, processor: 0, total: 0, units: 0 };
  if (lines.length === 0) return t;

  for (const line of lines) {
    const b = itemBreakdown(productsById[line.productId], config);
    t.production += b.production * line.qty;
    t.artist += b.artist * line.qty;
    t.shop += b.shop * line.qty;
    t.processor += b.processor * line.qty;
    t.units += line.qty;
  }

  t.shipping = shippingPence(lines, productsById);
  // Fixed per-order card fee, plus the % fee on shipping + that fixed fee.
  const orderLevel = t.shipping + config.paymentFee.fixedPence;
  t.processor += config.paymentFee.fixedPence + processorFee(orderLevel, config.paymentFee.percent);

  t.total = t.production + t.artist + t.shop + t.shipping + t.processor;
  return t;
}
