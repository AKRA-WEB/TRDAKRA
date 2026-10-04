const test = require('node:test');
const assert = require('node:assert/strict');
const { requestRuntime } = require('./helpers/request-runtime.cjs');
const rows = Array.from({ length: 20 }, (_, index) => ({
  itemName: `สินค้า ${index + 1}`, qty: String(index + 1), parLevel: '30', oldExpiry: ''
}));

for (const kind of ['single', 'bulk', 'survey', 'zone']) {
  test(`${kind} creates distinct requests without touching legacy dispatched IDs`, async () => {
    const historical = { id: 'REQ-1000', itemName: 'ประวัติเดิม', status: 'รับสินค้าแล้ว', requestQty: 9, receiveQty: 9 };
    const stored = new Map([[historical.id, { ...historical }]]);
    const f = requestRuntime({ write: async payload => {
      if (payload.action !== 'mutateInventoryDelta') return { status: 'success' };
      const inserts = payload.operations.filter(op => op.op === 'append').map(op => op.item);
      const seen = new Set();
      for (const item of inserts) {
        if (stored.has(item.id)) throw Error('stale_dispatch_status');
        if (seen.has(item.id)) throw Error('duplicate_id');
        seen.add(item.id);
      }
      for (const item of inserts) stored.set(item.id, item);
      return { status: 'success' };
    } });
    f.state.items = [{ ...historical }];
    const input = kind === 'single' ? rows.slice(0, 1) : rows;
    await f.submit(kind, input);
    assert.equal(stored.size, input.length + 1, f.alerts.join('\n'));
    assert.deepEqual(stored.get(historical.id), historical);
    const newItems = f.state.items.filter(item => item.id !== historical.id);
    assert.equal(newItems.length, input.length);
    assert.equal(new Set(newItems.map(item => item.id)).size, input.length);
    assert.deepEqual(Array.from(newItems, item => item.itemName), input.map(row => row.itemName));
    assert.deepEqual(Array.from(newItems, item => item.requestQty), input.map(row => Number(row.qty)));
    assert.ok(newItems.every(item => item.status === 'สั่งเบิก'));
  });
}

test('bulk keeps stockout restore IDs and skips pending products and duplicate rows', async () => {
  const f = requestRuntime();
  f.state.items = [
    { id: 'REQ-RESTORE', itemName: 'คืนรายการ', status: 'สินค้าหมด', requestQty: 1 },
    { id: 'REQ-PENDING', itemName: 'รอจัด', status: 'สั่งเบิก', requestQty: 2 }
  ];
  await f.submit('bulk', [
    { itemName: 'คืนรายการ', qty: '5' }, { itemName: 'ใหม่', qty: '3' },
    { itemName: 'ใหม่', qty: '4' }, { itemName: 'รอจัด', qty: '6' }
  ]);
  const ops = f.calls.find(call => call.action === 'mutateInventoryDelta').operations;
  assert.equal(ops.length, 2);
  assert.equal(ops[0].op, 'updateById');
  assert.equal(ops[0].id, 'REQ-RESTORE');
  assert.equal(ops[0].patch.requestQty, 5);
  assert.equal(ops[1].op, 'append');
  assert.equal(ops[1].item.requestQty, 3);
  assert.ok(f.alerts.some(message => message.includes('ข้ามรายการที่เบิกซ้ำ 2')));
});

test('request IDs stay unique across independent sessions with legacy Math.random fixed', () => {
  const first = requestRuntime(), second = requestRuntime();
  const ids = [];
  for (let index = 0; index < 1000; index++) {
    ids.push(first.ctx.createRequestId(), second.ctx.createRequestId());
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => !/^REQ-\d{4}$/.test(id)));
});
