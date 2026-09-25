// Telegram → GitHub inbox bot (Cloudflare Worker).
//
// Send it a photo/file/text from your phone. It commits files to
// inbox/issue-<N>/ on the configured branch and posts a comment on issue N,
// so any cloud session can read both the brief (issue) and the files (repo).
//
// Targeting:  caption/text starting with "#12" → issue 12.
//             otherwise → newest open issue labelled `inbox` (created if none).
// Commands:   /new <title>  start a new inbox issue
//             /where        show which issue things go to
//             /help

import { Buffer } from 'node:buffer';

const GH = 'https://api.github.com';
const INBOX_LABEL = 'inbox';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('ok');
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 403 });
    }
    const update = await request.json();
    const msg = update.message;
    // Strangers get silence, not an error message that confirms the bot exists.
    if (!msg || !isAllowed(env, msg.from?.id)) return new Response('ok');
    try {
      await handle(msg, env);
    } catch (e) {
      await reply(env, msg.chat.id, `⚠️ ${e.message}`);
    }
    // Always 200: a non-200 makes Telegram redeliver the same message forever.
    return new Response('ok');
  },
};

export function isAllowed(env, userId) {
  return String(env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).includes(String(userId));
}

export function parseTarget(text) {
  const m = /^\s*#(\d+)\b\s*/.exec(text || '');
  return m ? { issue: Number(m[1]), rest: text.slice(m[0].length).trim() } : { issue: null, rest: (text || '').trim() };
}

export function slugify(s, max = 40) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
    .trim().replace(/[\s_-]+/g, '-').slice(0, max).replace(/-+$/, '');
}

// Largest photo size, or a document sent "as file" (uncompressed — best for artwork).
export function pickFile(msg) {
  if (msg.photo?.length) {
    const p = msg.photo[msg.photo.length - 1];
    return { id: p.file_id, name: 'photo.jpg' };
  }
  if (msg.document) return { id: msg.document.file_id, name: msg.document.file_name || 'file' };
  return null;
}

export function filePath(issue, msg, file, caption) {
  const d = new Date(msg.date * 1000);
  const stamp = d.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'bin';
  const base = slugify(caption) || slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || 'file';
  return `inbox/issue-${issue}/${stamp}-${msg.message_id}-${base}.${ext}`;
}

export async function handle(msg, env) {
  const chat = msg.chat.id;
  const text = msg.text ?? msg.caption ?? '';
  const file = pickFile(msg);

  if (/^\/(start|help)\b/.test(text)) {
    return reply(env, chat, [
      'Send photos, files or text. They land on a GitHub issue.',
      '"#12 some text" → issue 12. Otherwise → newest open "inbox" issue.',
      '/new <title> – start a new issue',
      '/where – which issue is current',
      'Tip: send artwork "as file" to avoid Telegram compression.',
    ].join('\n'));
  }
  if (/^\/new\b/.test(text)) {
    const title = text.replace(/^\/new\s*/, '').trim() || `Inbox ${today()}`;
    const issue = await createIssue(env, title);
    return reply(env, chat, `New issue #${issue.number}: ${issue.html_url}`);
  }
  if (/^\/where\b/.test(text)) {
    const cur = await currentIssue(env);
    return reply(env, chat, cur ? `Current: #${cur.number} ${cur.title}\n${cur.html_url}` : 'No open inbox issue — next message creates one.');
  }

  const { issue: explicit, rest } = parseTarget(text);
  if (!file && !rest) return;
  const issue = explicit ?? (await currentIssue(env))?.number ?? (await createIssue(env, `Inbox ${today()}`)).number;

  let body = rest;
  let saved = null;
  if (file) {
    saved = await saveFile(env, issue, msg, file, rest);
    const img = /\.(png|jpe?g|gif|webp|svg)$/.test(saved.path) ? `![${rest || 'image'}](${saved.url}?raw=true)\n` : '';
    body = `${rest ? `${rest}\n\n` : ''}${img}📎 \`${saved.path}\``;
  }
  await gh(env, 'POST', `/issues/${issue}/comments`, { body: `${body}\n\n<sub>via Telegram</sub>` });
  await reply(env, chat, saved ? `✅ #${issue} ← ${saved.path}` : `✅ #${issue}`);
}

async function saveFile(env, issue, msg, file, caption) {
  const meta = await tg(env, 'getFile', { file_id: file.id });
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_TOKEN}/${meta.file_path}`);
  if (!res.ok) throw new Error(`Telegram download failed (${res.status})`);
  const content = Buffer.from(await res.arrayBuffer()).toString('base64');
  if (file.name === 'photo.jpg' && meta.file_path.includes('.')) file = { ...file, name: meta.file_path.split('/').pop() };
  const path = filePath(issue, msg, file, caption);

  // Several photos sent at once commit concurrently; GitHub may answer 409 while the
  // branch head moves. Retry a few times with a short backoff.
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await gh(env, 'PUT', `/contents/${path}`, {
        message: `Inbox: ${caption || file.name} (#${issue})`,
        content,
        branch: env.GITHUB_BRANCH,
      });
      return { path, url: out.content.html_url };
    } catch (e) {
      if (e.status !== 409 || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
}

async function currentIssue(env) {
  const list = await gh(env, 'GET', `/issues?labels=${INBOX_LABEL}&state=open&per_page=1&sort=created&direction=desc`);
  return list[0] || null;
}

function createIssue(env, title) {
  return gh(env, 'POST', '/issues', { title, labels: [INBOX_LABEL], body: 'Created from Telegram.' });
}

async function gh(env, method, path, body) {
  const res = await fetch(`${GH}/repos/${env.GITHUB_REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'memes-shop-inbox-bot',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path.split('?')[0]} → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function tg(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

function reply(env, chatId, text) {
  return tg(env, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
