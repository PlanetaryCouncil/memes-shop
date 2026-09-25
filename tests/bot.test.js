import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { parseTarget, slugify, filePath, isAllowed } from '../bot/src/worker.js';

const env = {
  WEBHOOK_SECRET: 's3cret',
  ALLOWED_USER_IDS: '42, 7',
  TELEGRAM_TOKEN: 'TG',
  GITHUB_TOKEN: 'GHT',
  GITHUB_REPO: 'PlanetaryCouncil/memes-shop',
  GITHUB_BRANCH: 'main',
};

// Fake Telegram + GitHub. Records every call; answers by URL.
let calls;
let openInbox;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  openInbox = [];
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ url, method: opts.method || 'GET', body });
    const json = (x) => new Response(JSON.stringify(x), { status: 200 });
    if (url.includes('/getFile')) return json({ ok: true, result: { file_path: 'photos/file_9.jpg' } });
    if (url.includes('/file/botTG/')) return new Response(new Uint8Array([1, 2, 3]));
    if (url.includes('/sendMessage')) return json({ ok: true, result: {} });
    if (url.includes('/contents/')) return json({ content: { html_url: `https://github.com/x/blob/main/${url.split('/contents/')[1]}` } });
    if (url.includes('/issues?labels=inbox')) return json(openInbox);
    if (url.endsWith('/issues') && opts.method === 'POST') return json({ number: 99, html_url: 'u', title: body.title });
    if (url.includes('/comments')) return json({});
    throw new Error(`unexpected ${url}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const post = (message, secret = 's3cret') => worker.fetch(new Request('https://bot/', {
  method: 'POST',
  headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
  body: JSON.stringify({ message }),
}), env);

const msg = (extra) => ({ message_id: 5, date: 1790000000, chat: { id: 42 }, from: { id: 42 }, ...extra });

test('parseTarget reads a leading #N', () => {
  assert.deepEqual(parseTarget('#12 frontier liberation front'), { issue: 12, rest: 'frontier liberation front' });
  assert.deepEqual(parseTarget('no target'), { issue: null, rest: 'no target' });
  assert.deepEqual(parseTarget(''), { issue: null, rest: '' });
});

test('slugify and filePath are filesystem-safe', () => {
  assert.equal(slugify('Frontier Liberation Front!!'), 'frontier-liberation-front');
  const p = filePath(1, msg(), { name: 'Art Work.PNG' }, '');
  assert.match(p, /^inbox\/issue-1\/\d{8}-\d{6}-5-art-work\.png$/);
});

test('allow-list', () => {
  assert.ok(isAllowed(env, 7));
  assert.ok(!isAllowed(env, 8));
});

test('wrong webhook secret is rejected', async () => {
  const res = await post(msg({ text: 'hi' }), 'nope');
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('strangers are ignored silently', async () => {
  const res = await post(msg({ from: { id: 666 }, text: 'hi' }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('photo with #1 caption is committed and commented on issue 1', async () => {
  await post(msg({ photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: '#1 Frontier liberation front' }));
  const getFile = calls.find((c) => c.url.includes('/getFile'));
  assert.equal(getFile.body.file_id, 'big');
  const put = calls.find((c) => c.method === 'PUT');
  assert.match(put.url, /\/contents\/inbox\/issue-1\/.*-frontier-liberation-front\.jpg$/);
  assert.equal(put.body.branch, 'main');
  assert.equal(put.body.content, Buffer.from([1, 2, 3]).toString('base64'));
  const comment = calls.find((c) => c.url.endsWith('/issues/1/comments'));
  assert.match(comment.body.body, /Frontier liberation front/);
  assert.match(comment.body.body, /inbox\/issue-1\//);
  assert.match(calls.at(-1).body.text, /✅ #1/);
});

test('text with no target and no open inbox issue creates one', async () => {
  await post(msg({ text: 'print the red one first' }));
  const created = calls.find((c) => c.url.endsWith('/issues') && c.method === 'POST');
  assert.deepEqual(created.body.labels, ['inbox']);
  assert.ok(calls.some((c) => c.url.endsWith('/issues/99/comments')));
});

test('text goes to the newest open inbox issue', async () => {
  openInbox = [{ number: 3, title: 'x', html_url: 'u' }];
  await post(msg({ text: 'note' }));
  assert.ok(calls.some((c) => c.url.endsWith('/issues/3/comments')));
  assert.ok(!calls.some((c) => c.url.endsWith('/issues') && c.method === 'POST'));
});

test('errors are reported back to the chat, not retried by Telegram', async () => {
  globalThis.fetch = async (url) => {
    if (url.includes('/sendMessage')) { calls.push({ url }); return new Response('{"ok":true,"result":{}}'); }
    return new Response('{}', { status: 401 });
  };
  const res = await post(msg({ text: 'note' }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
});
