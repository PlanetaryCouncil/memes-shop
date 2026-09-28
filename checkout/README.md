# Checkout (Stripe)

A Cloudflare Worker that turns a cart into a Stripe Checkout session. Prices are recomputed
server-side from `data/*.json` + `js/pricing.js`, so the charge always equals the receipt the
shop shows. Customers get Stripe's hosted page: saved cards via Link, Apple Pay, Google Pay.

## Go live

1. Stripe account → Developers → API keys → copy the **test** secret key (`sk_test_…`).
2. Set `SHOP_ORIGIN` / `SHOP_PATH` in `wrangler.toml` to where the shop is hosted.
3. Deploy:
   ```sh
   cd checkout
   npx wrangler login
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler deploy        # prints https://memes-checkout.<you>.workers.dev
   ```
4. In `data/config.json`: `"checkoutUrl": "https://memes-checkout.<you>.workers.dev/checkout"`,
   `"checkoutLive": true`.
5. Buy something with test card `4242 4242 4242 4242`. Check it in Stripe → Payments.
6. Swap in `sk_live_…` (step 3's `secret put` again). Real money from here.

Deploying `checkout/` bundles `data/` and `js/pricing.js` into the Worker: **redeploy after any
price or product change**, or the shop and the charge disagree (the charge wins).

## Orders

Each payment in the Stripe dashboard holds the shipping address and, per line, the `design`,
`product` and `variant` metadata, which is everything a printer needs. Session metadata also records
`artist_total_pence` for paying artists. Fulfilment is manual for now; automating it means adding a
`checkout.session.completed` webhook that forwards the order to the print-on-demand API.
