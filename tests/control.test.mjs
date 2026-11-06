import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControlClient, ControlServer } from '../scripts/lib/control.mjs';

async function withServer(run) {
  const received = [];
  const server = new ControlServer({
    token: 'secret',
    onCommand: (command) => {
      received.push(command);
      return command === 'pause' ? 'ok' : 'unknown';
    },
  });
  const port = await server.listen();
  try {
    await run({ port, received });
  } finally {
    server.close();
  }
}

test('a command with the right token reaches the handler and gets its reply', async () => {
  await withServer(async ({ port, received }) => {
    const reply = await new ControlClient().send({ port, token: 'secret' }, 'pause');

    assert.equal(reply, 'ok');
    assert.deepEqual(received, ['pause']);
  });
});

test('an unknown command is answered, not ignored', async () => {
  await withServer(async ({ port }) => {
    assert.equal(await new ControlClient().send({ port, token: 'secret' }, 'dance'), 'unknown');
  });
});

test('a wrong token is denied and never reaches the handler', async () => {
  await withServer(async ({ port, received }) => {
    const reply = await new ControlClient().send({ port, token: 'guess' }, 'pause');

    assert.equal(reply, 'denied');
    assert.deepEqual(received, []);
  });
});

test('sending to a port nobody listens on rejects', async () => {
  const server = new ControlServer({ token: 't', onCommand: () => 'ok' });
  const port = await server.listen();
  server.close();

  await assert.rejects(new ControlClient(500).send({ port, token: 't' }, 'pause'));
});
