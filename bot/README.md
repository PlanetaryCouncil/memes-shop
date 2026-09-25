# Inbox bot (Telegram → GitHub)

Send a photo, file or note to the bot from your phone. It:

1. commits the file to `inbox/issue-<N>/` on the configured branch,
2. comments on issue N with your caption, the image and the file path,
3. replies `✅ #N ← inbox/issue-N/…`.

Issues stay the source of truth; files live in the repo where any cloud session can read them.

## Using it

| You send | Goes to |
|---|---|
| `#12 frontier liberation front` + photo | issue 12, file named after the caption |
| photo / text with no `#N` | newest open issue labelled `inbox` (one is created if none) |
| `/new Moonshots batch 2` | new `inbox` issue, which becomes the current one |
| `/where` | tells you the current issue |

**Send artwork "as file"** (paperclip → File), not as a photo. Telegram compresses photos to ~1280px
JPEG, which is not print quality. Bot downloads are capped at 20 MB by Telegram.

An album arrives as separate messages: each image becomes its own commit + comment, and only the
first carries the caption. Start with `#N` in the caption if the album should go to a specific issue
(the other images then go to the current inbox issue, so use `/new` first for a clean batch).

## Setup (~15 minutes, once)

1. **Bot:** in Telegram, message `@BotFather` → `/newbot` → copy the token.
2. **Your user id:** message `@userinfobot`, copy the number.
3. **GitHub token:** github.com → Settings → Developer settings → Fine-grained tokens → Generate.
   Resource owner `PlanetaryCouncil` (an org owner may need to approve it), repository access
   *Only* `memes-shop`, permissions **Contents: Read and write**, **Issues: Read and write**.
   Set an expiry you'll remember to renew.
4. **Deploy** (free Cloudflare account):
   ```sh
   cd bot
   npx wrangler login
   npx wrangler secret put TELEGRAM_TOKEN
   npx wrangler secret put WEBHOOK_SECRET      # e.g. output of: openssl rand -hex 32
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put ALLOWED_USER_IDS
   npx wrangler deploy                         # prints https://memes-inbox-bot.<you>.workers.dev
   ```
5. **Point Telegram at it:**
   ```sh
   curl "https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook" \
     -d url=https://memes-inbox-bot.<you>.workers.dev \
     -d secret_token=<WEBHOOK_SECRET> \
     -d 'allowed_updates=["message"]'
   ```
6. Message the bot `/help`, then send a test photo.

## Security

- Only user ids in `ALLOWED_USER_IDS` are served; everyone else is silently ignored.
- Requests without the webhook secret get 403, so nobody can call the Worker pretending to be Telegram.
- The GitHub token can only touch this one repo. If the phone is lost, revoke the token on GitHub
  and `/revoke` the bot in @BotFather.

## Limits worth knowing

- Cloudflare's free plan caps CPU time per request. Uploads mostly wait on the network (which doesn't
  count), but very large files may fail there; the bot replies with the error if so.
- Private-repo images in issue comments render for people with repo access. If one doesn't render,
  the file path in the comment is still correct.
