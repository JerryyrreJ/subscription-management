import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedTaskGate } from '../../src/utils/scopedTaskGate.ts';

test('scoped task gate invalidates older tasks within the same scope', () => {
 const gate = createScopedTaskGate<'user:a' | 'user:b'>();

 const firstToken = gate.claim('user:a');
 const secondToken = gate.claim('user:a');

 assert.equal(gate.isCurrent('user:a', firstToken), false);
 assert.equal(gate.isCurrent('user:a', secondToken), true);
});

test('scoped task gate keeps different scopes isolated', () => {
 const gate = createScopedTaskGate<'user:a' | 'user:b'>();

 const userAToken = gate.claim('user:a');
 const userBToken = gate.claim('user:b');

 assert.equal(gate.isCurrent('user:a', userAToken), true);
 assert.equal(gate.isCurrent('user:b', userBToken), true);
});

test('scoped task gate only releases the latest task for a scope', () => {
 const gate = createScopedTaskGate<'user:a'>();

 const staleToken = gate.claim('user:a');
 const currentToken = gate.claim('user:a');

 gate.release('user:a', staleToken);
 assert.equal(gate.isCurrent('user:a', currentToken), true);

 gate.release('user:a', currentToken);
 assert.equal(gate.isCurrent('user:a', currentToken), false);
});
