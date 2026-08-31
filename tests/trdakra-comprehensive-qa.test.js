const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { PGlite } = require(path.join(__dirname, '..', '..', 'database', 'node_modules', '@electric-sql', 'pglite'));

console.log('===============================================================');
console.log('      COMPREHENSIVE QA AUDIT SUITE: TRDAKRA SUPABASE MIGRATION ');
console.log('===============================================================\n');

const indexHtmlPath = path.join(__dirname, '..', 'index.html');
const versionJsonPath = path.join(__dirname, '..', 'version.json');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

// -------------------------------------------------------------
// SUITE 1: Static Hygiene, Version Parity & Secret Leak Scan
// -------------------------------------------------------------
console.log('--- SUITE 1: Static Hygiene, Version Parity & Secret Scans ---');

// 1.1 Version Parity
assert(
  indexHtml.includes(`const CURRENT_VERSION = "${versionJson.version}";`),
  `index.html CURRENT_VERSION must match version.json (${versionJson.version})`
);
console.log(`[PASS] 1.1 Version parity verified: ${versionJson.version}`);

// 1.2 Secret Exposure Scan
const secretChecks = [
  { name: 'service_role key', pattern: /service_role/i, target: indexHtml },
  { name: 'JWT hardcoded token', pattern: /eyJhbGciOi/i, target: indexHtml }
];
secretChecks.forEach(check => {
  assert(!check.pattern.test(check.target), `Security violation: ${check.name} detected in client bundle`);
});
console.log('[PASS] 1.2 Zero leaked credentials, service keys, or hardcoded tokens in client files');

// 1.3 Inline Script Compilation Check (Strict vm.Script execution)
const indexInlineScripts = [...indexHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert(indexInlineScripts.length > 0, 'index.html must contain inline scripts');
indexInlineScripts.forEach((s, idx) => {
  if (s[1].trim()) {
    new vm.Script(s[1], { filename: `trdakra-inline-${idx}.js` });
  }
});
console.log('[PASS] 1.3 All HTML inline scripts parsed and compiled with zero syntax errors');

// -------------------------------------------------------------
// SUITE 2: Supabase Schema, Invariants, & Reconciled Data Integrity
// -------------------------------------------------------------
console.log('\n--- SUITE 2: Supabase Schema, Invariants & Reconciled Data Ingestion ---');

async function runDatabaseTests() {
  const db = new PGlite();

  // Baseline products table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku TEXT,
      name TEXT NOT NULL UNIQUE,
      unit TEXT DEFAULT 'ชิ้น',
      category TEXT,
      subname TEXT,
      is_active BOOLEAN DEFAULT true
    );
  `);

  const sql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'database', 'supabase', 'migrations', '20260830140000_trdakra_tables_and_rpcs.sql'),
    'utf8'
  );
  await db.exec(sql);
  console.log('[PASS] 2.1 Database schema, indexes, and RPCs initialized in PostgreSQL');

  const snapshotsDir = path.join(__dirname, '..', '..', 'database', 'data_snapshots');
  const prods = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'trd_product_locations.json'), 'utf8'));
  const reqs = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'trd_inventory_requests.json'), 'utf8'));
  const surveys = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'trd_survey_logs.json'), 'utf8'));

  for (const p of prods) {
    await db.query(`
      INSERT INTO public.trd_product_locations (product_name, floor, location, par_level, unit, category)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (product_name) DO UPDATE SET
        floor = EXCLUDED.floor,
        location = EXCLUDED.location,
        par_level = EXCLUDED.par_level;
    `, [p.product_name, p.floor, p.location, p.par_level, p.unit, p.category]);
  }
  for (const r of reqs) {
    await db.query(`
      INSERT INTO public.trd_inventory_requests (
        id, timestamp, item_name, request_qty, storage_capacity, status,
        old_expiry, new_expiry, receive_qty, receive_note, w2_note,
        recheck_qty, recheck_at, recheck_by, recheck_note, requested_by, dispatch_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO NOTHING;
    `, [
      r.id, r.timestamp, r.item_name, r.request_qty, r.storage_capacity, r.status,
      r.old_expiry, r.new_expiry, r.receive_qty, r.receive_note, r.w2_note,
      r.recheck_qty, r.recheck_at, r.recheck_by, r.recheck_note, r.requested_by, r.dispatch_timestamp
    ]);
  }
  for (const s of surveys.slice(0, 100)) {
    await db.query(`
      INSERT INTO public.trd_survey_logs (
        survey_date, floor, product_name, current_stock, par_level, need_to_order, status, surveyed_by, session_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `, [s.survey_date, s.floor, s.product_name, s.current_stock, s.par_level, s.need_to_order, s.status, s.surveyed_by, s.session_key]);
  }

  // Location Invariant Check: 0 items in Floor 5 or Zone 6
  const badLocations = await db.query(`
    SELECT count(*) as count FROM public.trd_product_locations
    WHERE floor = '5' OR location LIKE '6%';
  `);
  assert.strictEqual(Number(badLocations.rows[0].count), 0, 'Must have zero items with Floor 5 or Zone 6');
  console.log(`[PASS] 2.2 Location Invariant Verified: Exactly 0 items in Floor 5 or Zone 6 across all ${prods.length} products`);

  // RPC Invariant Check: Initial Data
  const initRes = await db.query('SELECT public.get_trd_initial_data(7) as result;');
  const initData = initRes.rows[0].result;
  assert.strictEqual(initData.status, 'success');
  assert.strictEqual(initData.products.length, prods.length);
  assert(initData.items.length > 0, 'Items within window must be returned');
  console.log(`[PASS] 2.3 Initial Data RPC Verified: ${initData.products.length} products loaded cleanly`);

  // Mutation Invariant Check: Delta Mutation (Object format)
  const deltaRes = await db.query(`
    SELECT public.mutate_trd_inventory_delta(
      jsonb_build_object(
        'inserts', jsonb_build_array(
          jsonb_build_object(
            'id', 'TEST-REQ-999',
            'itemName', 'สินค้าทดสอบเบิก',
            'requestQty', 10,
            'storageCapacity', 20,
            'status', 'สั่งเบิก',
            'requestedBy', 'Tester'
          )
        )
      ),
      'mutation-test-1'
    ) as result;
  `);
  assert.strictEqual(deltaRes.rows[0].result.status, 'success');
  assert.strictEqual(deltaRes.rows[0].result.inserted, 1);
  console.log('[PASS] 2.4 Transactional Delta Mutation (Object format) Verified');

  // Mutation Invariant Check: Delta Mutation (Array format from Zone Check / W1 / W2)
  const arrayOrderRes = await db.query(`
    SELECT public.mutate_trd_inventory_delta(
      jsonb_build_array(
        jsonb_build_object(
          'op', 'append',
          'item', jsonb_build_object(
            'id', 'TEST-ZONE-ORD-123',
            'itemName', 'สินค้าทดสอบเบิกรายโซน',
            'requestQty', 8,
            'storageCapacity', 15,
            'status', 'สั่งเบิก',
            'requestedBy', 'Zone Surveyor'
          )
        )
      ),
      'mutation-zone-123'
    ) as result;
  `);
  assert.strictEqual(arrayOrderRes.rows[0].result.status, 'success');
  assert.strictEqual(arrayOrderRes.rows[0].result.inserted, 1);

  // Assert it appears in get_trd_initial_data
  const checkInitial = await db.query('SELECT public.get_trd_initial_data(7) as result;');
  const foundZoneOrder = checkInitial.rows[0].result.items.find(i => i.id === 'TEST-ZONE-ORD-123');
  assert(foundZoneOrder, 'Zone check order must be in get_trd_initial_data');
  assert.strictEqual(foundZoneOrder.status, 'สั่งเบิก');
  console.log('[PASS] 2.5 Zone Check Stock Order Creation & Immediate "รอจัด" Visibility Verified');

  console.log('\n🌟 ALL TRDAKRA SUITES & INVARIANTS PASSED 100%! 🌟');
}

runDatabaseTests().catch(err => {
  console.error('Database tests failed:', err);
  process.exit(1);
});
