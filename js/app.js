import { itemBreakdown, cartBreakdown } from './pricing.js';
import { mockup } from './mockups.js';

const $ = (sel, root = document) => root.querySelector(sel);
const CART_KEY = 'memes-shop-cart-v1';

const [config, products, designs] = await Promise.all(
  ['config', 'products', 'designs'].map((f) => fetch(`data/${f}.json`).then((r) => r.json()))
);
const productsById = Object.fromEntries(products.map((p) => [p.id, p]));
const designsById = Object.fromEntries(designs.map((d) => [d.id, d]));

const fmt = new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency });
const money = (pence) => fmt.format(pence / 100);
const pct = (x) => `${+(x * 100).toFixed(2)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The five things money can go to. Same order + colours everywhere.
const PARTS = [
  { key: 'production', label: 'Making it', cls: 'c-prod' },
  { key: 'artist', label: 'Artist', cls: 'c-artist' },
  { key: 'shop', label: 'Shop', cls: 'c-shop' },
  { key: 'shipping', label: 'Shipping', cls: 'c-ship' },
  { key: 'processor', label: 'Card fees', cls: 'c-fee' },
];

function splitBar(b) {
  const parts = PARTS.filter((p) => (b[p.key] || 0) > 0);
  return `<div class="bar" role="img" aria-label="Price breakdown">${parts
    .map((p) => `<span class="${p.cls}" style="flex:${b[p.key]}" title="${p.label}: ${money(b[p.key])}"></span>`)
    .join('')}</div>`;
}

function breakdownList(b) {
  return `<dl class="breakdown">${PARTS.filter((p) => p.key in b)
    .map((p) => `<div><dt><i class="${p.cls}"></i>${p.label}${p.key === 'shop' && b.shop === 0 ? ' <small>(TBD)</small>' : ''}</dt><dd>${money(b[p.key])}</dd></div>`)
    .join('')}<div class="total"><dt>Total</dt><dd>${money(b.total)}</dd></div></dl>`;
}

// ---------- cart state ----------
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }
cart = cart.filter((l) => productsById[l.productId] && designsById[l.designId]);

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode: cart lives in memory */ }
  renderCart();
}
const lineKey = (l) => `${l.designId}|${l.productId}|${l.variant || ''}`;

function addToCart(line) {
  const existing = cart.find((l) => lineKey(l) === lineKey(line));
  if (existing) existing.qty += line.qty; else cart.push(line);
  saveCart();
  openCart();
}

// ---------- views ----------
const cheapest = Math.min(...products.map((p) => itemBreakdown(p, config).total));

function viewShop() {
  return `
  <section class="hero">
    <h1>${esc(config.tagline)}</h1>
    <p>Every design here is free to download, copy, remix and spread. If you want it on a thing,
      you pay what the thing costs to make and ship, plus ${pct(config.artistShareOfProduction)} of the
      making cost to the artist. Every price shows its receipt. <a href="#/ledger">Read the ledger →</a></p>
  </section>
  <section class="grid">
    ${designs.map((d) => `
      <a class="card" href="#/d/${d.id}">
        <img src="${d.file}" alt="${esc(d.title)}" loading="lazy">
        <div class="card-body">
          <h2>${esc(d.title)}</h2>
          <p>${esc(d.blurb)}</p>
          <span class="from">from ${money(cheapest)}</span>
        </div>
      </a>`).join('')}
  </section>`;
}

function viewDesign(id, productId) {
  const d = designsById[id];
  if (!d) return viewNotFound();
  const p = productsById[productId] || products[0];
  const b = itemBreakdown(p, config);
  return `
  <a class="back" href="#/">← all memes</a>
  <section class="design">
    <div class="mock">${mockup(p.id, d.file, `${d.title} on a ${p.name}`)}</div>
    <div class="panel">
      <h1>${esc(d.title)}</h1>
      <p class="muted">by ${esc(d.artist)} · ${esc(d.license)}</p>
      <div class="tabs" role="tablist">
        ${products.map((x) => `<a role="tab" aria-selected="${x.id === p.id}" href="#/d/${d.id}/${x.id}">${x.name}</a>`).join('')}
      </div>
      <p class="spec">${esc(p.spec)}</p>
      <p class="price">${money(b.total)} <small>+ shipping</small></p>

      <form id="add" class="add">
        ${p.variants.length ? `<label>Size <select name="variant">${p.variants.map((v) => `<option>${v}</option>`).join('')}</select></label>` : ''}
        <label>Qty <input name="qty" type="number" min="1" max="99" value="1"></label>
        <button type="submit">Add to cart</button>
      </form>

      <h3>Where your ${money(b.total)} goes</h3>
      ${splitBar(b)}
      ${breakdownList(b)}
      <p class="muted small">Shipping is per parcel: ${money(p.shippingFirstPence)} if this is the heaviest thing
        in your order, ${money(p.shippingExtraPence)} if it rides along with something else.
        ${config.costsAreEstimates ? 'Costs are current estimates — see the ledger.' : ''}</p>

      <div class="free">
        <strong>Just want the meme?</strong> Take it. It's ${esc(d.license)}.
        <a class="btn-ghost" href="${d.file}" download>Download SVG</a>
      </div>
    </div>
  </section>`;
}

function viewLedger() {
  const rows = products.map((p) => ({ p, b: itemBreakdown(p, config) }));
  return `
  <section class="prose">
    <h1>The ledger</h1>
    <p>This is the whole pricing model. No hidden margin, no "compare at" prices, no countdown timers.
      If a number changes, it changes here first.</p>

    <h2>The formula</h2>
    <pre class="formula">price  = making + artist + shop + card fees
artist = ${pct(config.artistShareOfProduction)} × making
shop   = ${pct(config.shopShareOfProduction)} × making   ← ${esc(config.shopShareNote)}
fees   = what the card processor takes (${pct(config.paymentFee.percent)} + ${money(config.paymentFee.fixedPence)} per order)
+ shipping, once per parcel</pre>

    <h2>Every product, itemised</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Making</th><th>Artist</th><th>Shop</th><th>Card fees</th><th>Price</th><th>Ship first / extra</th></tr></thead>
      <tbody>${rows.map(({ p, b }) => `
        <tr><td><strong>${p.name}</strong><br><small>${esc(p.spec)}</small></td>
        <td>${money(b.production)}</td><td>${money(b.artist)}</td><td>${money(b.shop)}</td>
        <td>${money(b.processor)}</td><td><strong>${money(b.total)}</strong></td>
        <td>${money(p.shippingFirstPence)} / ${money(p.shippingExtraPence)}</td></tr>`).join('')}
      </tbody>
    </table></div>
    ${config.costsAreEstimates ? `<p class="note">⚠ Making and shipping costs are <strong>estimates</strong> until supplier contracts are signed. Card fee rate is a placeholder. When real quotes land, this table updates and so do prices.</p>` : ''}

    <h2>Why the artist's cut is tied to making cost</h2>
    <p>The meme itself is free — that's the point. What we sell is labour and materials. The artist gets a fixed
      share of that, so a jumper pays them more than a sticker, and nobody's art is priced like a luxury good.</p>

    <h2>What's not decided yet</h2>
    <ul>
      <li>Whether the shop takes a cut, and how much. Right now: nothing.</li>
      <li>Who covers misprints, returns and lost parcels.</li>
      <li>Payments. Checkout is ${config.checkoutLive ? 'live' : 'not live yet'}.</li>
    </ul>

    <h2>What we don't do</h2>
    <ul>
      <li>No trackers, analytics or third-party scripts. This page makes zero requests to anyone but us.</li>
      <li>No fake scarcity, no "only 3 left", no dark patterns.</li>
      <li>No lock-in on the art. Download it, print it yourself, we won't mind.</li>
    </ul>
  </section>`;
}

function viewNotFound() {
  return `<section class="prose"><h1>404</h1><p>This meme escaped. <a href="#/">Back to the shop</a>.</p></section>`;
}

// ---------- cart drawer ----------
function renderCart() {
  const count = cart.reduce((n, l) => n + l.qty, 0);
  $('#cart-count').textContent = count;
  const body = $('#cart-body');
  if (!cart.length) {
    body.innerHTML = `<p class="muted">Empty. Which is also fine — the memes are free.</p>`;
    return;
  }
  const t = cartBreakdown(cart, productsById, config);
  body.innerHTML = `
    <ul class="lines">${cart.map((l, i) => {
      const d = designsById[l.designId], p = productsById[l.productId];
      return `<li>
        <img src="${d.file}" alt="">
        <div><strong>${esc(d.title)}</strong><br><small>${p.name}${l.variant ? ` · ${l.variant}` : ''} · ${money(itemBreakdown(p, config).total)}</small></div>
        <div class="qty">
          <button data-i="${i}" data-d="-1" aria-label="One fewer">−</button><span>${l.qty}</span><button data-i="${i}" data-d="1" aria-label="One more">+</button>
        </div></li>`;
    }).join('')}</ul>
    ${splitBar(t)}
    ${breakdownList(t)}
    <button class="checkout" ${config.checkoutLive ? '' : 'disabled'}>Checkout</button>
    ${config.checkoutLive ? '' : `<p class="muted small">Checkout isn't live yet — payments are still being set up. Your cart is saved in this browser only.</p>`}`;
}

function openCart() { $('#cart').classList.add('open'); $('#cart').setAttribute('aria-hidden', 'false'); }
function closeCart() { $('#cart').classList.remove('open'); $('#cart').setAttribute('aria-hidden', 'true'); }

$('#cart-toggle').addEventListener('click', openCart);
$('#cart-close').addEventListener('click', closeCart);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
$('#cart-body').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-i]');
  if (!btn) return;
  const line = cart[+btn.dataset.i];
  line.qty += +btn.dataset.d;
  if (line.qty <= 0) cart.splice(+btn.dataset.i, 1);
  saveCart();
});

// ---------- router ----------
function route() {
  const [, view, a, b] = (location.hash || '#/').split('/');
  closeCart();
  const main = $('#main');
  if (!view) main.innerHTML = viewShop();
  else if (view === 'd') main.innerHTML = viewDesign(a, b);
  else if (view === 'ledger') main.innerHTML = viewLedger();
  else main.innerHTML = viewNotFound();

  const form = $('#add');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    addToCart({
      designId: a,
      productId: productsById[b] ? b : products[0].id,
      variant: fd.get('variant') || '',
      qty: Math.max(1, Math.min(99, parseInt(fd.get('qty'), 10) || 1)),
    });
  });
  document.querySelectorAll('.nav a').forEach((l) =>
    l.toggleAttribute('aria-current', l.getAttribute('href') === `#/${view || ''}`));
  if (!b) window.scrollTo(0, 0);
}

document.title = config.shopName;
$('#brand').textContent = config.shopName;
window.addEventListener('hashchange', route);
route();
renderCart();
