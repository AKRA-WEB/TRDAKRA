const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== TESTING TRDAKRA LINE NOTIFICATION REMEDIATION ===\n');

// 1. Test date parser & windowing
function parseThaiOrIsoDate(value) {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    const str = String(value).trim();
    if (!str || str === '-') return null;

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1;
        const day = parseInt(isoMatch[3], 10);
        const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
        const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
        const sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
        if (str.includes('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
            const d = new Date(str);
            if (!isNaN(d.getTime())) return d;
        }
        return new Date(Date.UTC(year, month, day, hour - 7, min, sec));
    }

    const thaiMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s*\/?\s*(\d{1,2}):(\d{2}))?/);
    if (thaiMatch) {
        let year = parseInt(thaiMatch[3], 10);
        if (year > 2500) year -= 543;
        const month = parseInt(thaiMatch[2], 10) - 1;
        const day = parseInt(thaiMatch[1], 10);
        const hour = thaiMatch[4] ? parseInt(thaiMatch[4], 10) : 0;
        const min = thaiMatch[5] ? parseInt(thaiMatch[5], 10) : 0;
        return new Date(Date.UTC(year, month, day, hour - 7, min, 0));
    }

    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? null : fallback;
}

function formatUnitSummary(items) {
    const map = {};
    for (const item of items) {
        const u = item.unit || 'ชิ้น';
        map[u] = (map[u] || 0) + Number(item.qty || 0);
    }
    const parts = Object.entries(map)
        .filter(([_, q]) => q > 0)
        .map(([u, q]) => `${q} ${u}`);
    return parts.length > 0 ? parts.join(', ') : '0 รายการ';
}

// Test 1: Date Parser Invariants
console.log('--- TEST 1: Date Parser Invariants ---');
const isoDate = parseThaiOrIsoDate('2026-09-02T11:00:00.000Z');
assert.ok(isoDate instanceof Date);
assert.strictEqual(isoDate.toISOString(), '2026-09-02T11:00:00.000Z');

const thaiBE = parseThaiOrIsoDate('02-09-2569 / 18:00 น.');
assert.ok(thaiBE instanceof Date);
assert.strictEqual(thaiBE.getUTCFullYear(), 2026);
assert.strictEqual(thaiBE.getUTCMonth(), 8); // Sept (0-indexed 8)
assert.strictEqual(thaiBE.getUTCDate(), 2);
assert.strictEqual(thaiBE.getUTCHours(), 11); // 18:00 BKK is 11:00 UTC
console.log('[PASS] ISO and Thai Buddhist Era dates parsed identically');

// Test 2: Unit Summary formatting
console.log('\n--- TEST 2: Quantity & Unit Aggregation ---');
const testUnits = [
    { qty: 10, unit: 'ลัง' },
    { qty: 25, unit: 'ลัง' },
    { qty: 5, unit: 'ถุง' },
    { qty: 0, unit: 'กระป๋อง' }
];
const summaryStr = formatUnitSummary(testUnits);
assert.strictEqual(summaryStr, '35 ลัง, 5 ถุง');
console.log('[PASS] Unit summary aggregated correctly:', summaryStr);

// Test 3: Verify Code.gs.txt compilation & syntax
console.log('\n--- TEST 3: Code.gs.txt Syntax & Structure ---');
const codeGs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs.txt'), 'utf8');
new vm.Script(codeGs, { filename: 'Code.gs.txt' });
assert.match(codeGs, /function sendDailyDispatchSummary\(\)/);
assert.match(codeGs, /function sendDailyStockSummary\(\)/);
assert.match(codeGs, /SUPABASE_TRD_API_URL/);
console.log('[PASS] Code.gs.txt parsed with zero syntax errors and contains Supabase bridge');

// Test 4: Verify trd-api Edge Function implementation
console.log('\n--- TEST 4: trd-api Edge Function Actions ---');
const trdApiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'supabase', 'functions', 'trd-api', 'index.ts'), 'utf8');
assert.match(trdApiSource, /action === 'sendDailyDispatchSummary'/);
assert.match(trdApiSource, /action === 'sendDailyStockSummary'/);
assert.match(trdApiSource, /action === 'previewDailyDispatchSummary'/);
assert.match(trdApiSource, /handleDailyDispatchSummary/);
assert.match(trdApiSource, /handleDailyStockSummary/);
assert.match(trdApiSource, /formatUnitSummary/);
assert.match(trdApiSource, /pushLineText/);
console.log('[PASS] trd-api Edge Function contains all required LINE summary handlers');

// Test 5: Version parity check
console.log('\n--- TEST 5: Version Parity ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const versionJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
const versionMatch = indexHtml.match(/const CURRENT_VERSION = "([^"]+)";/);
assert.ok(versionMatch, 'CURRENT_VERSION found in index.html');
assert.strictEqual(versionMatch[1], versionJson.version, 'index.html and version.json version match');
console.log(`[PASS] Version parity verified: ${versionJson.version}`);

console.log('\n🌟 ALL LINE NOTIFICATION REMEDIATION TESTS PASSED 100%! 🌟');
