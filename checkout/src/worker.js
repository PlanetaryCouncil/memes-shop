// Stripe Checkout endpoint (Cloudflare Worker).
//
// POST /checkout  { lines: [{ designId, productId, variant, qty }] }
//   → { url }  (redirect the browser there)
//
// Prices are recomputed here from the same data + pricing code the shop shows,
// so what the customer reads on the receipt is exactly what Stripe charges.
// The browser never sends a price.

import { itemBreakdown, cartBreakdown } from '../../js/pricing.js';
import config from '../../data/config.json' with { type: 'json' };
import products from '../../data/products.json' with { type: 'json' };
import designs from '../../data/designs.json' with { type: 'json' };

const productsById = Object.fromEntries(products.map((p) => [p.id, p]));
const designsById = Object.fromEntries(designs.map((d) => [d.id, d]));
const MAX_LINES = 50;
const MAX_QTY = 99;

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.SHOP_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/checkout') return json({ error: 'not found' }, 404);

    let lines;
    try {
      lines = validateLines((await request.json()).lines);
    } catch (e) {
      return json({ error: e.message }, 400);
    }

    try {
      const session = await stripe(env, 'POST', '/v1/checkout/sessions', sessionParams(lines, env));
      return json({ url: session.url });
    } catch (e) {
      console.error(e);
      return json({ error: 'Payment provider error. Nothing was charged.' }, 502);
    }
  },
};

export function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('Cart is empty');
  if (lines.length > MAX_LINES) throw new Error('Too many lines');
  return lines.map((l) => {
    const p = productsById[l?.productId];
    if (!p) throw new Error(`Unknown product ${l?.productId}`);
    if (!designsById[l.designId]) throw new Error(`Unknown design ${l.designId}`);
    const variant = l.variant || '';
    if (p.variants.length ? !p.variants.includes(variant) : variant) throw new Error(`Bad size for ${p.name}`);
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error('Bad quantity');
    return { designId: l.designId, productId: p.id, variant, qty };
  });
}

// Stripe line items = the items. Shipping + the per-order card fee = one shipping option.
// Their sum equals cartBreakdown().total exactly (asserted in tests).
export function sessionParams(lines, env) {
  const t = cartBreakdown(lines, productsById, config);
  const itemsTotal = lines.reduce((s, l) => s + itemBreakdown(productsById[l.productId], config).total * l.qty, 0);
  const orderLevel = t.total - itemsTotal;
  const currency = config.currency.toLowerCase();

  const params = {
    mode: 'payment',
    success_url: `${env.SHOP_ORIGIN}${env.SHOP_PATH || '/'}#/thanks?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.SHOP_ORIGIN}${env.SHOP_PATH || '/'}#/`,
    'shipping_address_collection[allowed_countries]': (env.SHIP_COUNTRIES || 'GB').split(','),
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][display_name]': 'Shipping + card fee (at cost)',
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': orderLevel,
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': currency,
    'metadata[cart]': JSON.stringify(lines.map((l) => [l.designId, l.productId, l.variant, l.qty])).slice(0, 500),
    'metadata[artist_total_pence]': t.artist,
    'metadata[production_total_pence]': t.production,
  };

  lines.forEach((l, i) => {
    const p = productsById[l.productId];
    const d = designsById[l.designId];
    const b = itemBreakdown(p, config);
    const k = `line_items[${i}]`;
    params[`${k}[quantity]`] = l.qty;
    params[`${k}[price_data][currency]`] = currency;
    params[`${k}[price_data][unit_amount]`] = b.total;
    params[`${k}[price_data][product_data][name]`] = `${d.title} — ${p.name}${l.variant ? ` (${l.variant})` : ''}`;
    params[`${k}[price_data][product_data][description]`] =
      `Making ${money(b.production)} · Artist ${money(b.artist)} · Shop ${money(b.shop)} · Card fee ${money(b.processor)}`;
    params[`${k}[price_data][product_data][metadata][design]`] = d.id;
    params[`${k}[price_data][product_data][metadata][product]`] = p.id;
    params[`${k}[price_data][product_data][metadata][variant]`] = l.variant;
  });
  return params;
}

function money(pence) {
  return new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency }).format(pence / 100);
}

// Stripe's API takes form encoding; arrays become key[0], key[1], ...
export function formEncode(params) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x, i) => out.append(`${k}[${i}]`, x));
    else out.append(k, String(v));
  }
  return out;
}

async function stripe(env, method, path, params) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formEncode(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message}`);
  return data;
}
