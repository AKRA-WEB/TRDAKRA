const assert = require('assert');
const trdClient = require('../js/supabase-trdakra-client.js');

async function runTests() {
  console.log('=== TESTING TRDAKRA SUPABASE API CLIENT ADAPTER ===\n');

  // 1. Record Stock Movement
  console.log('[1/3] Testing recordStockMovement (W1 -> W2 Transfer)...');
  const moveRes = await trdClient.recordStockMovement({
    movementDate: '2026-08-19',
    sourceWarehouse: 'W1',
    targetWarehouse: 'W2',
    sku: 'FF21610104',
    productName: 'มายองเนส SE เบสท์ฟู้ดส์ (ลัง12x910g)',
    qty: 15,
    unit: 'ลัง',
    requester: 'TRD Manager',
    dispatcher: 'W1 Warehouse Staff'
  });
  assert.strictEqual(moveRes.status, 'success');
  assert(moveRes.movementId, 'Must return generated movementId');
  console.log(`  -> Created Stock Movement ID: [${moveRes.movementId}]`);

  // 2. Record Survey Log
  console.log('\n[2/3] Testing recordSurveyLog...');
  const surveyRes = await trdClient.recordSurveyLog({
    surveyDate: '2026-08-19',
    surveyTime: '15:00:00',
    warehouse: 'W2',
    sku: 'FF21610104',
    productName: 'มายองเนส SE เบสท์ฟู้ดส์ (ลัง12x910g)',
    zone: 'Rack-B2',
    stockQty: 42,
    surveyor: 'Inspector Staff'
  });
  assert.strictEqual(surveyRes.status, 'success');
  assert(surveyRes.surveyId, 'Must return generated surveyId');
  console.log(`  -> Created Survey Log ID: [${surveyRes.surveyId}]`);

  // 3. Product Movement & Survey History Report (<25ms)
  console.log('\n[3/3] Testing getProductMovementReport (30-day movement query)...');
  const t0 = Date.now();
  const reportRes = await trdClient.getProductMovementReport('FF21610104', 30);
  const reportMs = Date.now() - t0;
  assert.strictEqual(reportRes.status, 'success');
  assert(reportRes.movements.length >= 1, 'Must find recent movement');
  assert(reportRes.surveys.length >= 1, 'Must find recent survey log');
  console.log(`  -> Query Latency: ${reportMs}ms`);
  console.log(`  -> Found ${reportRes.totalMovements} movements and ${reportRes.totalSurveys} survey logs for SKU [${reportRes.sku}].`);

  console.log('\n🌟 TRDAKRA SUPABASE API CLIENT ADAPTER TESTS PASSED 100%! 🌟');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
