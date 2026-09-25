# Memes Shop

**The meme is free. The atoms cost money. Here's exactly how much.**

A small, static, transparent-pricing shop for memes on t-shirts, jumpers, stickers, posters and mugs.
Every design is free to download (CC BY-SA by default). If you want it printed on something, the price
is the cost of making and shipping it, plus the artist's cut, plus card fees — and every product page
shows that receipt.

## Run it

```sh
npm start      # serves on http://localhost:8080 (needs python3)
npm test       # pricing tests (node >= 20)
```

No build step, no dependencies, no trackers, no third-party requests. Deploys anywhere that serves
static files (GitHub Pages, Netlify, Cloudflare Pages).

## How prices work

All logic lives in `js/pricing.js` and all money is integer pence.

```
item price = making + artist + shop + card fee
artist     = artistShareOfProduction × making   (20%)
shop       = shopShareOfProduction × making     (0% — business model TBD)
card fee   = grossed-up % so the net after the processor's cut covers everything
order      = Σ items + shipping (once per parcel) + fixed card fee (+ its % fee)
```

Shipping is per parcel: the item with the highest "first item" rate pays that, every other unit adds
its "extra item" rate.

## Where to change things

| What | File |
|---|---|
| Artist %, shop %, card fees, currency, checkout on/off | `data/config.json` |
| Product types, making costs, shipping, sizes | `data/products.json` |
| Designs, artist credit, licence | `data/designs.json` + an SVG in `memes/` |

To add a meme: drop an SVG (square, 1000×1000 viewBox works best) into `memes/` and add an entry to
`data/designs.json`. It appears on every product automatically.

## Status: what's placeholder

- **Making and shipping costs are estimates**, not supplier quotes. Replace with real numbers from your
  print-on-demand partner or printer before taking money.
- **Card fee** (1.5% + 20p) is a placeholder for a typical UK card rate. Use your processor's actual rate.
- **Checkout is off** (`checkoutLive: false`). The cart works and persists in the browser; nothing is charged.
- **Artist** is "House (placeholder)" on all six starter designs, which were made for this repo.
- **Meme SVGs use live text**, so they render in whatever fonts the viewer has. Convert text to outlines
  before sending to a printer.

## Open questions (the actual business model)

1. **Does the shop take a cut?** At 0% the shop cannot pay for hosting, misprints, returns or lost parcels.
   Someone absorbs those costs; the ledger should say who.
2. **Is 20%-of-making the right artist deal?** It's simple and honest, but it pays per unit of *cost*, not
   per unit of *art*: a sticker earns the artist 24p, a jumper £4.80, for the same design. Alternatives:
   flat fee per item sold, or a % of the final price.
3. **VAT.** If the business registers for VAT, 20% is added on top of everything, and it should appear as
   its own line in the breakdown.
4. **Payments + fulfilment.** Likely path: Stripe Checkout (or similar) for payment, and a print-on-demand
   API (Printful, Gelato, Prodigi, etc.) for making and shipping. The cart's line format
   (`designId`, `productId`, `variant`, `qty`) maps directly onto both.
