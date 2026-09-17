import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearWorkspaceCache, announceWorkspaceChange, WORKSPACE_CHANGED } from '../app/lib/workspace.ts';
import { workspaceFetch } from '../app/lib/api.ts';

function mockGlobal(t, key, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
}

function storage(initial = {}) {
  const result = { ...initial };
  Object.defineProperties(result, {
    removeItem: { value: key => { delete result[key]; } },
    setItem: { value: (key, value) => { result[key] = value; } },
  });
  return result;
}

test('clears private cache and preserves unrelated browser preferences', t => {
  const cache = storage({ currentAnalysis: 'private', workspaceOwner: 'account-a', 'dashboard:123': 'board', theme: 'dark' });
  mockGlobal(t, 'sessionStorage', cache);
  clearWorkspaceCache();
  assert.deepEqual(Object.keys(cache), ['theme']);
});

test('identity changes clear this tab and notify other tabs', t => {
  const cache = storage({ currentAnalysis: 'private' });
  const shared = storage();
  const messages = [];
  mockGlobal(t, 'sessionStorage', cache);
  mockGlobal(t, 'localStorage', shared);
  mockGlobal(t, 'BroadcastChannel', class {
    constructor(name) { assert.equal(name, WORKSPACE_CHANGED); }
    postMessage(message) { messages.push(message); }
    close() { messages.push('closed'); }
  });
  announceWorkspaceChange();
  assert.equal(cache.currentAnalysis, undefined);
  assert.equal(typeof shared[WORKSPACE_CHANGED], 'string');
  assert.deepEqual(messages, ['changed', 'closed']);
});

test('private API requests signal session expiry and disable response caching', async t => {
  const events = [];
  mockGlobal(t, 'window', { dispatchEvent: event => events.push(event.type) });
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    assert.equal(init.credentials, 'include');
    assert.equal(init.cache, 'no-store');
    return new Response('{}', { status: 401 });
  });
  const response = await workspaceFetch('http://localhost:8000/datasets', { credentials: 'include' });
  assert.equal(response.status, 401);
  assert.deepEqual(events, ['smart-analyzer-session-expired']);
});

test('successful private responses do not signal expiry', async t => {
  const events = [];
  mockGlobal(t, 'window', { dispatchEvent: event => events.push(event.type) });
  t.mock.method(globalThis, 'fetch', async () => new Response('[]'));
  assert.equal((await workspaceFetch('http://localhost:8000/datasets')).status, 200);
  assert.deepEqual(events, []);
});
