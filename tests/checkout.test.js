import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { validateLines, sessionParams, formEncode } from '../checkout/src/worker.js';
import { cartBreakdown } from '../js/pricing.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const config = load('config.json');
const byId = Object.fromEntries(load('products.json').map((p) => [p.id, p]));
const env = { SHOP_ORIGIN: 'https://shop.example', STRIPE_SECRET_KEY: 'sk_test_x' };

const cart = [
  { designId: 'ctrl-c', productId: 'tshirt', variant: 'M', qty: 2 },
  { designId: 'market-share', productId: 'sticker', variant: '', qty: 3 },
  { designId: 'extraction', productId: 'mug', variant: '', qty: 1 },
];

test('Stripe charges exactly the total the shop shows', () => {
  const p = sessionParams(cart, env);
  let sum = p['shipping_options[0][shipping_rate_data][fixed_amount][amount]'];
  cart.forEach((_, i) => { sum += p[`line_items[${i}][price_data][unit_amount]`] * p[`line_items[${i}][quantity]`]; });
  assert.equal(sum, cartBreakdown(cart, byId, config).total);
});

test('line items carry the breakdown and fulfilment metadata', () => {
  const p = sessionParams(cart, env);
  assert.equal(p['line_items[0][price_data][product_data][name]'], 'Ctrl+C Is a Love Language — T-shirt (M)');
  assert.match(p['line_items[0][price_data][product_data][description]'], /Artist £2\.30/);
  assert.equal(p['line_items[0][price_data][product_data][metadata][variant]'], 'M');
  assert.equal(p['line_items[0][price_data][currency]'], 'gbp');
  assert.equal(p.mode, 'payment');
  assert.match(p.success_url, /\{CHECKOUT_SESSION_ID\}/);
});

test('validation rejects tampering', () => {
  assert.throws(() => validateLines([]), /empty/);
  assert.throws(() => validateLines([{ designId: 'ctrl-c', productId: 'yacht', qty: 1 }]), /Unknown product/);
  assert.throws(() => validateLines([{ designId: 'nope', productId: 'mug', qty: 1 }]), /Unknown design/);
  assert.throws(() => validateLines([{ designId: 'ctrl-c', productId: 'tshirt', variant: 'XXXXL', qty: 1 }]), /size/);
  assert.throws(() => validateLines([{ designId: 'ctrl-c', productId: 'mug', variant: 'M', qty: 1 }]), /size/);
  assert.throws(() => validateLines([{ designId: 'ctrl-c', productId: 'mug', qty: 0 }]), /quantity/);
  assert.throws(() => validateLines([{ designId: 'ctrl-c', productId: 'mug', qty: 1.5 }]), /quantity/);
  // A client-sent price is simply dropped.
  assert.deepEqual(validateLines([{ designId: 'ctrl-c', productId: 'mug', qty: 1, unit_amount: 1 }]),
    [{ designId: 'ctrl-c', productId: 'mug', variant: '', qty: 1 }]);
});

test('form encoding flattens arrays the way Stripe expects', () => {
  const f = formEncode({ a: 1, 'b[c]': ['GB', 'IE'] });
  assert.equal(f.toString(), 'a=1&b%5Bc%5D%5B0%5D=GB&b%5Bc%5D%5B1%5D=IE');
});

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('POST /checkout returns the Stripe URL', async () => {
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = { url, auth: opts.headers.Authorization, body: opts.body.toString() };
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
  };
  const res = await worker.fetch(new Request('https://api.example/checkout', {
    method: 'POST', body: JSON.stringify({ lines: cart }),
  }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  assert.equal(sent.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(sent.auth, 'Bearer sk_test_x');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://shop.example');
});

test('bad cart → 400, Stripe failure → 502, nothing leaks', async () => {
  const bad = await worker.fetch(new Request('https://api.example/checkout', {
    method: 'POST', body: JSON.stringify({ lines: [] }),
  }), env);
  assert.equal(bad.status, 400);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Invalid API Key sk_live_secret' } }), { status: 401 });
  const orig = console.error; console.error = () => {};
  const res = await worker.fetch(new Request('https://api.example/checkout', {
    method: 'POST', body: JSON.stringify({ lines: cart }),
  }), env);
  console.error = orig;
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /sk_/);
});
