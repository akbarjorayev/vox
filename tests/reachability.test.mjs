import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ReachabilityProbe } from '../scripts/lib/reachability.mjs';

const TARGET = { host: 'voices.example', port: 443, timeoutMs: 1500 };

// A socket that reports one outcome as soon as a listener is attached.
class FakeSocket extends EventEmitter {
  destroyed = false;
  timeoutMs = null;

  constructor(outcome) {
    super();
    queueMicrotask(() => this.emit(outcome, outcome === 'error' ? new Error('ENETUNREACH') : undefined));
  }

  setTimeout(ms) {
    this.timeoutMs = ms;
  }

  destroy() {
    this.destroyed = true;
  }
}

function probeWith(outcome) {
  const sockets = [];
  const connect = (options) => {
    const socket = new FakeSocket(outcome);
    sockets.push({ options, socket });
    return socket;
  };
  return { probe: new ReachabilityProbe({ ...TARGET, connect }), sockets };
}

test('a server that accepts the connection is reachable', async () => {
  const { probe, sockets } = probeWith('connect');

  assert.equal(await probe.isReachable(), true);
  assert.deepEqual(sockets[0].options, { host: 'voices.example', port: 443 });
  assert.equal(sockets[0].socket.timeoutMs, 1500);
  assert.equal(sockets[0].socket.destroyed, true);
});

test('a network error means unreachable', async () => {
  const { probe, sockets } = probeWith('error');

  assert.equal(await probe.isReachable(), false);
  assert.equal(sockets[0].socket.destroyed, true);
});

test('no answer within the time limit means unreachable', async () => {
  const { probe } = probeWith('timeout');

  assert.equal(await probe.isReachable(), false);
});

test('the answer is remembered, so the network is asked only once', async () => {
  const { probe, sockets } = probeWith('connect');

  await Promise.all([probe.isReachable(), probe.isReachable()]);
  await probe.isReachable();

  assert.equal(sockets.length, 1);
});
