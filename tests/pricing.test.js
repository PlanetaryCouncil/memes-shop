import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processorFee, itemBreakdown, shippingPence, cartBreakdown } from '../js/pricing.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const config = load('config.json');
const products = load('products.json');
const byId = Object.fromEntries(products.map((p) => [p.id, p]));

test('processor fee grosses up so the net equals the amount', () => {
  const amount = 1380;
  const fee = processorFee(amount, 0.015);
  const charged = amount + fee;
  assert.ok(charged - charged * 0.015 >= amount, 'net must cover the amount');
  assert.ok(charged - 1 - (charged - 1) * 0.015 < amount, 'fee must be the smallest that covers it');
});

test('processor fee is zero for zero percent or zero amount', () => {
  assert.equal(processorFee(1000, 0), 0);
  assert.equal(processorFee(0, 0.015), 0);
});

test('artist gets 20% of production, components sum to total', () => {
  const b = itemBreakdown(byId.tshirt, config);
  assert.equal(b.production, 1150);
  assert.equal(b.artist, 230);
  assert.equal(b.production + b.artist + b.shop + b.processor, b.total);
});

test('shop share is applied when configured', () => {
  const b = itemBreakdown(byId.tshirt, { ...config, shopShareOfProduction: 0.1 });
  assert.equal(b.shop, 115);
});

test('shipping: most expensive first-rate once, extras for the rest', () => {
  const lines = [
    { productId: 'sticker', qty: 3 },
    { productId: 'jumper', qty: 1 },
    { productId: 'tshirt', qty: 2 },
  ];
  // jumper first (550) + 2 tshirt extras (150*2) + 3 sticker extras (0)
  assert.equal(shippingPence(lines, byId), 550 + 300);
});

test('cart total equals the sum of its visible lines', () => {
  const lines = [
    { productId: 'mug', qty: 1 },
    { productId: 'poster', qty: 2 },
  ];
  const c = cartBreakdown(lines, byId, config);
  assert.equal(c.total, c.production + c.artist + c.shop + c.shipping + c.processor);
  assert.equal(c.units, 3);
  // Customer's payment, after the processor's cut, covers everything else exactly or better.
  const net = c.total - (c.total * config.paymentFee.percent + config.paymentFee.fixedPence);
  assert.ok(net >= c.production + c.artist + c.shop + c.shipping - 1e-9);
});

test('empty cart costs nothing', () => {
  assert.equal(cartBreakdown([], byId, config).total, 0);
});
