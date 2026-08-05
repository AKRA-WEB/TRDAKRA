const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function inventoryRow({
    id,
    requestAt,
    name,
    requestQty,
    status,
    receiveQty = '',
    dispatchAt = '',
    requestedBy = 'Tester'
}) {
    return [
        id, requestAt, name, requestQty, status,
        '', '', receiveQty, '', '', 0, dispatchAt, requestedBy,
        '', '', '', ''
    ];
}

function bangkokDate(year, month, day, hour = 0, minute = 0) {
    return new Date(Date.UTC(year, month, day, hour, minute) - 7 * 60 * 60 * 1000);
}

function createRuntime() {
    const cacheValues = {};
    const scriptCache = {
        get(key) { return Object.prototype.hasOwnProperty.call(cacheValues, key) ? cacheValues[key] : null; },
        getAll(keys) {
            return keys.reduce((found, key) => {
                if (Object.prototype.hasOwnProperty.call(cacheValues, key)) found[key] = cacheValues[key];
                return found;
            }, {});
        },
        put(key, value) { cacheValues[key] = value; },
        putAll(entries) { Object.assign(cacheValues, entries); },
        remove(key) { delete cacheValues[key]; }
    };
    const context = {
        console,
        Date,
        JSON,
        Math,
        Object,
        String,
        Array,
        Number,
        RegExp,
        parseInt,
        parseFloat,
        isFinite,
        isNaN,
        PropertiesService: { getScriptProperties() { return { getProperty() { return null; }, setProperty() {} }; } },
        CacheService: { getScriptCache() { return scriptCache; } },
        SpreadsheetApp: { openById() { throw new Error('Spreadsheet access is not expected in helper tests'); } },
        LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
        Utilities: { formatDate(date) { return date.toISOString(); } },
        Logger: { log() {} },
        Session: { getScriptTimeZone() { return 'Asia/Bangkok'; } },
        ScriptApp: {},
        UrlFetchApp: {},
        ContentService: { MimeType: { JSON: 'json' } }
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs.txt'), 'utf8');
    vm.runInContext(source, context, { filename: 'Code.gs.txt' });
    vm.runInContext('getProductMovementInventoryRows_ = function() { return []; }; getProductList = function() { return []; };', context);
    return vm.runInContext(`({
        parseMovementPeriod_,
        buildProductMovementReport_,
        buildProductMovementDetail_,
        validateProductMovementPeriod_,
        validateProductMovementDetailLimit_,
        utf8ByteLength_,
        writeProductMovementCache_,
        readProductMovementCache_,
        getCachedProductMovementReport_,
        getProductMovementReport
    })`, context);
}

const api = createRuntime();
const now = new Date('2026-08-05T12:00:00+07:00');
const products = [
    { name: 'สินค้า A', unit: 'ลัง', floor: '1', location: 'A1', parLevel: 20 },
    { name: 'สินค้า B', unit: 'ชิ้น', floor: '2', location: 'B1', parLevel: 10 },
    { name: 'สินค้า C', unit: 'ชิ้น', floor: '3', location: 'C1', parLevel: 5 },
    { name: 'สินค้า D', unit: 'ชิ้น', floor: 'NOSTK', location: '', parLevel: 0 },
    { name: 'สินค้า F', unit: 'ชิ้น', floor: '1', location: 'A2', parLevel: 8 },
    { name: 'สินค้า G', unit: 'ชิ้น', floor: '1', location: 'A3', parLevel: 8 }
];

const rows = [
    // Request and dispatch belong to different periods: demand uses requestAt, movement uses dispatchAt.
    inventoryRow({ id: 'A-PART', requestAt: bangkokDate(2026, 7, 2, 9), name: 'สินค้า A', requestQty: 10, status: 'จัดส่งไม่ครบ', receiveQty: 6, dispatchAt: bangkokDate(2026, 7, 4, 10) }),
    inventoryRow({ id: 'A-FULL', requestAt: bangkokDate(2026, 7, 3, 9), name: 'สินค้า A', requestQty: 4, status: 'จัดส่งแล้ว', receiveQty: 4, dispatchAt: bangkokDate(2026, 7, 3, 11) }),
    inventoryRow({ id: 'A-PRIOR', requestAt: bangkokDate(2026, 6, 28, 8), name: 'สินค้า A', requestQty: 5, status: 'รับสินค้าแล้ว', receiveQty: 5, dispatchAt: bangkokDate(2026, 6, 28, 9) }),
    inventoryRow({ id: 'B-PENDING', requestAt: bangkokDate(2026, 7, 4, 8), name: 'สินค้า B', requestQty: 8, status: 'กำลังจัดสินค้า' }),
    inventoryRow({ id: 'B-OLD-PENDING', requestAt: bangkokDate(2026, 5, 1, 8), name: 'สินค้า B', requestQty: 2, status: 'สั่งเบิก' }),
    inventoryRow({ id: 'C-OLD', requestAt: bangkokDate(2026, 3, 1, 8), name: 'สินค้า C', requestQty: 3, status: 'จัดส่งแล้ว', receiveQty: 3, dispatchAt: bangkokDate(2026, 3, 1, 9) }),
    inventoryRow({ id: 'E-HISTORY', requestAt: bangkokDate(2026, 7, 5, 8), name: 'สินค้า E', requestQty: 9, status: 'จัดส่งแล้ว', receiveQty: 9, dispatchAt: bangkokDate(2026, 7, 5, 9) }),
    inventoryRow({ id: 'F-STOCKOUT', requestAt: bangkokDate(2026, 5, 1, 8), name: 'สินค้า F', requestQty: 7, status: 'สินค้าหมด', dispatchAt: bangkokDate(2026, 7, 4, 9) }),
    inventoryRow({ id: 'G-LEGACY', requestAt: bangkokDate(2026, 7, 5, 7), name: 'สินค้า G', requestQty: 2, status: 'จัดส่งแล้ว', receiveQty: 2 }),
    inventoryRow({ id: 'CANCELLED', requestAt: bangkokDate(2026, 5, 1, 7), name: 'สินค้า B', requestQty: 99, status: 'ยกเลิกรายการ', dispatchAt: bangkokDate(2026, 7, 5, 7) }),
    inventoryRow({ id: 'VARIANT', requestAt: bangkokDate(2026, 7, 5, 6), name: 'สินค้า a', requestQty: 1, status: 'สั่งเบิก' })
];

{
    assert.strictEqual(api.validateProductMovementPeriod_('week'), 'week');
    assert.strictEqual(api.validateProductMovementPeriod_('30'), '30');
    assert.throws(() => api.validateProductMovementPeriod_('custom'), /invalid_period/);
    assert.strictEqual(api.validateProductMovementDetailLimit_('30'), 30);
    assert.strictEqual(api.validateProductMovementDetailLimit_('500'), 50);
    assert.throws(() => api.validateProductMovementDetailLimit_('zero'), /invalid_limit/);
    assert.ok(api.utf8ByteLength_('สินค้า') > 'สินค้า'.length, 'cache sizing counts UTF-8 bytes for Thai text');
}

{
    const values = {};
    const cache = {
        get(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        getAll(keys) {
            return keys.reduce((found, key) => {
                if (Object.prototype.hasOwnProperty.call(values, key)) found[key] = values[key];
                return found;
            }, {});
        },
        putAll(entries) { Object.assign(values, entries); },
        put(key, value) { values[key] = value; }
    };
    const serialized = JSON.stringify({ ascii: 'x'.repeat(1100000), thai: 'สินค้า'.repeat(25000) });
    assert.ok(api.utf8ByteLength_(serialized) >= 1500000, 'fixture matches the measured production payload class');
    const write = api.writeProductMovementCache_(cache, 'movement:test', serialized);
    assert.strictEqual(write.stored, true);
    assert.ok(write.shardCount > 1, 'large report is split across cache entries');
    assert.ok(write.shardCount <= 100, 'production-sized response stays within the explicit shard cap');
    const manifest = JSON.parse(values['movement:test:manifest']);
    assert.strictEqual(manifest.version, 2);
    assert.strictEqual(manifest.shardCount, write.shardCount);
    assert.ok(manifest.generation, 'manifest points to generation-scoped shards');
    assert.strictEqual(manifest.utf8Bytes, api.utf8ByteLength_(serialized));
    assert.ok(manifest.checksum, 'manifest protects reconstruction from complete hybrid payloads');
    for (let index = 0; index < manifest.shardCount; index++) {
        assert.ok(api.utf8ByteLength_(values[`movement:test:gen:${manifest.generation}:part:${index}`]) <= 90000, 'every generation shard stays within the cache item limit');
    }
    assert.strictEqual(api.readProductMovementCache_(cache, 'movement:test'), serialized, 'shards round-trip exactly');
    delete values[`movement:test:gen:${manifest.generation}:part:1`];
    assert.strictEqual(api.readProductMovementCache_(cache, 'movement:test'), null, 'an incomplete cache is treated as a miss');

    api.writeProductMovementCache_(cache, 'movement:test', serialized);
    const integrityManifest = JSON.parse(values['movement:test:manifest']);
    const integrityKey = `movement:test:gen:${integrityManifest.generation}:part:0`;
    values[integrityKey] = `z${values[integrityKey].slice(1)}`;
    assert.strictEqual(api.readProductMovementCache_(cache, 'movement:test'), null, 'byte-valid but modified shards fail checksum validation');

    const stableSerialized = JSON.stringify({ state: 'stable generation' });
    api.writeProductMovementCache_(cache, 'movement:test', stableSerialized);
    const interruptedCache = {
        putAll(entries) {
            Object.assign(values, entries);
            throw new Error('interrupted before manifest publish');
        },
        put() { throw new Error('manifest must not publish after shard failure'); }
    };
    assert.throws(() => api.writeProductMovementCache_(interruptedCache, 'movement:test', JSON.stringify({ state: 'new generation' })));
    assert.strictEqual(api.readProductMovementCache_(cache, 'movement:test'), stableSerialized, 'an interrupted generation leaves the prior manifest readable');

    const failingCache = { get() { throw new Error('cache unavailable'); } };
    const failedRead = api.getCachedProductMovementReport_(failingCache, 'movement:test');
    assert.strictEqual(failedRead.report, null);
    assert.strictEqual(failedRead.readFailed, true, 'cache service failures degrade to a cold recompute');
    const corruptCache = { get(key) { return key.endsWith(':manifest') ? null : '{invalid json'; } };
    const corruptRead = api.getCachedProductMovementReport_(corruptCache, 'movement:test');
    assert.strictEqual(corruptRead.report, null);
    assert.strictEqual(corruptRead.corrupt, true, 'invalid cached JSON degrades to a cold recompute');
}

{
    const legacyEndpoint = api.getProductMovementReport('week', true, false);
    assert.strictEqual(legacyEndpoint.status, 'success', 'legacy three-argument endpoint signature remains supported');
    assert.match(legacyEndpoint.period.selectedWeek, /^\d{4}-W\d{2}$/);

    const selectedEndpoint = api.getProductMovementReport('week', '2026-W31', true, false);
    assert.strictEqual(selectedEndpoint.status, 'success');
    assert.strictEqual(selectedEndpoint.period.selectedWeek, '2026-W31', 'public report endpoint forwards the selected week');
    assert.strictEqual(selectedEndpoint.period.isCurrentWeek, false);
    const rollingEndpoint = api.getProductMovementReport('7', '2026-W31', true, false);
    assert.strictEqual(rollingEndpoint.period.selectedWeek, null, 'rolling periods ignore the calendar-week selector');
}

{
    const period = api.parseMovementPeriod_('week', now);
    assert.strictEqual(period.start.toISOString(), '2026-08-02T17:00:00.000Z', 'this-week period starts Monday 00:00 Bangkok');
    assert.strictEqual(period.end.getTime(), now.getTime());
    assert.strictEqual(period.priorEnd.getTime() - period.priorStart.getTime(), period.end.getTime() - period.start.getTime());
    assert.strictEqual(period.priorStart.toISOString(), '2026-07-26T17:00:00.000Z', 'comparison starts on the previous Bangkok Monday');
    assert.strictEqual(period.priorEnd.toISOString(), '2026-07-29T05:00:00.000Z', 'comparison ends at the same Bangkok-local elapsed point in the previous week');
}

{
    const selected = api.parseMovementPeriod_('week', now, '2026-W31');
    assert.strictEqual(selected.selectedWeek, '2026-W31');
    assert.strictEqual(selected.isCurrentWeek, false);
    assert.strictEqual(selected.start.toISOString(), '2026-07-26T17:00:00.000Z', 'selected ISO week starts Monday 27 July in Bangkok');
    assert.strictEqual(selected.end.toISOString(), '2026-08-02T16:59:59.999Z', 'past selected week ends Sunday 2 August in Bangkok');
    assert.strictEqual(selected.priorStart.toISOString(), '2026-07-19T17:00:00.000Z');
    assert.strictEqual(selected.priorEnd.toISOString(), '2026-07-26T16:59:59.999Z');
}

{
    const current = api.parseMovementPeriod_('week', now, '2026-W32');
    assert.strictEqual(current.isCurrentWeek, true);
    assert.strictEqual(current.end.getTime(), now.getTime(), 'explicit current week remains partial through now');
    const crossYear = api.parseMovementPeriod_('week', new Date('2026-01-10T12:00:00+07:00'), '2026-W01');
    assert.strictEqual(crossYear.start.toISOString(), '2025-12-28T17:00:00.000Z', 'ISO week 1 can start in the preceding calendar year');
    assert.strictEqual(crossYear.end.toISOString(), '2026-01-04T16:59:59.999Z');
    assert.throws(() => api.parseMovementPeriod_('week', now, '2026-W33'), /future_week/);
    assert.throws(() => api.parseMovementPeriod_('week', now, '2026-W54'), /invalid_week/);
}

{
    const bangkokMonday = new Date('2026-08-09T18:00:00.000Z');
    const period = api.parseMovementPeriod_('week', bangkokMonday);
    assert.strictEqual(period.selectedWeek, '2026-W33', 'Sunday UTC is already Monday of the next ISO week in Bangkok');
    assert.strictEqual(period.start.toISOString(), '2026-08-09T17:00:00.000Z');
}

{
    const boundary = new Date('2026-07-26T16:59:59.999Z');
    const boundaryRows = [
        inventoryRow({ id: 'PRIOR-END', requestAt: boundary, name: 'สินค้า A', requestQty: 3, status: 'จัดส่งแล้ว', receiveQty: 3, dispatchAt: boundary })
    ];
    const report = api.buildProductMovementReport_(boundaryRows, products, 'week', now, '2026-W31');
    const productA = report.products.find(product => product.name === 'สินค้า A');
    assert.strictEqual(report.summary.priorRequestedRounds, 1, 'exact priorEnd request remains inside the prior full week');
    assert.strictEqual(productA.priorFulfilledRounds, 1, 'exact priorEnd dispatch remains inside the prior full week');
}

{
    const report = api.buildProductMovementReport_(rows, products, 'week', now, '2026-W31');
    assert.strictEqual(report.period.selectedWeek, '2026-W31');
    assert.strictEqual(report.period.isCurrentWeek, false);
    const productA = report.products.find(product => product.name === 'สินค้า A');
    assert.strictEqual(productA.requestedRounds, 2, 'selected past week uses its own Monday-Sunday request window');
    assert.strictEqual(productA.requestedQty, 15);
    assert.strictEqual(productA.fulfilledRounds, 1);
    assert.strictEqual(productA.fulfilledQty, 5);
}

{
    const report = api.buildProductMovementReport_(rows, products, 'week', now);
    assert.strictEqual(report.status, 'success');
    assert.strictEqual(report.contractVersion, 2, 'weekly comparison fields ship as a new report contract');
    assert.strictEqual(report.summary.masterProductCount, 6);
    assert.strictEqual(report.summary.movedProductCount, 3);
    assert.strictEqual(report.summary.fulfilledRounds, 4);
    assert.strictEqual(report.summary.fulfilledQty, 21);
    assert.strictEqual(report.summary.requestedRounds, 5, 'current week counts non-cancelled requests by request time');
    assert.strictEqual(report.summary.requestedQty, 24);
    assert.strictEqual(report.summary.priorRequestedRounds, 1, 'prior week uses the same elapsed Monday-to-now window');
    assert.strictEqual(report.summary.priorRequestedQty, 5);
    assert.strictEqual(report.summary.requestedRoundsTrendPct, 400);
    assert.strictEqual(report.summary.requestedQtyTrendPct, 380);
    assert.strictEqual(report.summary.inactive90, 1);
    assert.strictEqual(report.summary.neverMoved, 3);
    assert.strictEqual(report.summary.historyOnly, 2);
    assert.strictEqual(report.summary.cancelledCount, 1);
    assert.strictEqual(report.diagnostics.legacyDateFallbacks, 1);
    assert.strictEqual(
        report.timeOfDay.dispatchBuckets.reduce((total, bucket) => total + bucket.currentRounds, 0),
        3,
        'legacy fulfilled rows without dispatch time do not enter picking-time proxy buckets'
    );
    assert.strictEqual(
        report.timeOfDay.dispatchBuckets.find(bucket => bucket.startHour === 6).currentRounds,
        0,
        'cancelled exception timestamps do not enter fulfilled dispatch-time buckets'
    );

    const productA = report.products.find(product => product.name === 'สินค้า A');
    assert.ok(productA);
    assert.strictEqual(productA.requestedRounds, 1);
    assert.strictEqual(productA.requestedQty, 4);
    assert.strictEqual(productA.fulfilledRounds, 2);
    assert.strictEqual(productA.fulfilledQty, 10);
    assert.strictEqual(productA.fulfilledRequestedQty, 14);
    assert.strictEqual(productA.averageFulfilledQty, 5);
    assert.strictEqual(productA.medianFulfilledQty, 5);
    assert.strictEqual(productA.maxFulfilledQty, 6);
    assert.strictEqual(productA.partialCount, 1);
    assert.strictEqual(productA.shortageQty, 4);
    assert.strictEqual(productA.priorFulfilledRounds, 1);
    assert.strictEqual(productA.priorFulfilledQty, 5);
    assert.strictEqual(productA.roundTrendPct, 100);
    assert.strictEqual(productA.qtyTrendPct, 100);
    assert.strictEqual(productA.fulfillmentRate, 71);
    assert.deepStrictEqual(Array.from(productA.nameVariants), ['สินค้า a']);

    const productB = report.products.find(product => product.name === 'สินค้า B');
    assert.strictEqual(productB.pendingRounds, 2, 'old current backlog remains visible outside the selected period');
    assert.strictEqual(productB.pendingQty, 10);
    assert.strictEqual(productB.requestedQty, 8, 'cancelled demand is excluded');
    assert.strictEqual(productB.cancelledCount, 1, 'cancellation evidence uses the exception event date');
    assert.strictEqual(productB.cancelledQty, 99);
    assert.strictEqual(productB.movementState, 'never');

    const productC = report.products.find(product => product.name === 'สินค้า C');
    assert.strictEqual(productC.movementState, 'inactive90');
    assert.ok(productC.daysInactive >= 90);

    const productD = report.products.find(product => product.name === 'สินค้า D');
    assert.strictEqual(productD.isNostk, true);
    assert.strictEqual(productD.movementState, 'never');

    const productE = report.products.find(product => product.name === 'สินค้า E');
    assert.strictEqual(productE.inProductMaster, false);
    assert.strictEqual(productE.movementState, 'active');

    const productF = report.products.find(product => product.name === 'สินค้า F');
    assert.strictEqual(productF.stockoutCount, 1);
    assert.strictEqual(productF.requestedQty, 0, 'old request demand stays outside the period while a current stockout remains visible');

    const productG = report.products.find(product => product.name === 'สินค้า G');
    assert.strictEqual(productG.fulfilledRounds, 1);
    assert.strictEqual(productG.legacyDateFallbackCount, 1);
}

{
    const timeRows = [
        inventoryRow({ id: 'TIME-NOW-1', requestAt: new Date('2026-08-05T08:30:00+07:00'), name: 'สินค้า A', requestQty: 4, status: 'จัดส่งแล้ว', receiveQty: 4, dispatchAt: new Date('2026-08-05T10:15:00+07:00') }),
        inventoryRow({ id: 'TIME-NOW-2', requestAt: new Date('2026-08-05T09:45:00+07:00'), name: 'สินค้า B', requestQty: 6, status: 'สั่งเบิก' }),
        inventoryRow({ id: 'TIME-PRIOR', requestAt: new Date('2026-07-29T08:00:00+07:00'), name: 'สินค้า A', requestQty: 5, status: 'จัดส่งแล้ว', receiveQty: 5, dispatchAt: new Date('2026-07-29T10:30:00+07:00') })
    ];
    const report = api.buildProductMovementReport_(timeRows, products, 'week', new Date('2026-08-05T12:00:00+07:00'));
    assert.strictEqual(report.timeOfDay.timezone, 'Asia/Bangkok');
    assert.strictEqual(report.timeOfDay.bucketHours, 2);
    assert.strictEqual(report.timeOfDay.requestBuckets.length, 12);
    const requestMorning = report.timeOfDay.requestBuckets.find(bucket => bucket.startHour === 8);
    assert.strictEqual(requestMorning.label, '08:00–09:59');
    assert.strictEqual(requestMorning.currentRounds, 2);
    assert.strictEqual(requestMorning.currentQty, 10);
    assert.strictEqual(requestMorning.priorRounds, 1);
    assert.strictEqual(requestMorning.priorQty, 5);
    const dispatchMorning = report.timeOfDay.dispatchBuckets.find(bucket => bucket.startHour === 10);
    assert.strictEqual(dispatchMorning.currentRounds, 1, 'fulfilled dispatch time is the picking-activity proxy');
    assert.strictEqual(dispatchMorning.currentQty, 4);
    assert.strictEqual(dispatchMorning.priorRounds, 1);
    assert.strictEqual(dispatchMorning.priorQty, 5);
}

{
    const detail = api.buildProductMovementDetail_(rows, 'สินค้า A', 2, now);
    assert.strictEqual(detail.status, 'success');
    assert.strictEqual(detail.contractVersion, 1);
    assert.strictEqual(detail.productName, 'สินค้า A');
    assert.strictEqual(detail.totalCount, 3);
    assert.strictEqual(detail.records.length, 2);
    assert.strictEqual(detail.records[0].id, 'A-PART');
    assert.strictEqual(detail.records[0].shortageQty, 4);
    assert.strictEqual(detail.records[0].legacyDateFallback, false);
    assert.strictEqual(detail.records[1].id, 'A-FULL');
    assert.strictEqual(detail.windows['3'].fulfilledQty, 10);
    assert.strictEqual(detail.windows['3'].requestedQty, 4);
    assert.strictEqual(detail.windows['7'].priorFulfilledQty, 5);

    const legacy = api.buildProductMovementDetail_(rows, 'สินค้า G', 30, now);
    assert.strictEqual(legacy.records[0].legacyDateFallback, true);

    const stockout = api.buildProductMovementDetail_(rows, 'สินค้า F', 30, now);
    assert.strictEqual(stockout.records[0].dispatchAt, null, 'stockout event time is not presented as an actual dispatch');
}

{
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inlineScript, 'index.html inline script must exist');
    new vm.Script(inlineScript[1], { filename: 'index.html' });
    assert.match(inlineScript[1], /action=getProductMovementReport/);
    assert.match(inlineScript[1], /action=getProductMovementDetail/);
    assert.match(inlineScript[1], /requestId !== state\.productMovementRequestId/);
    assert.match(inlineScript[1], /requestId !== state\.productMovementDetailRequestId/);
    const currentVersion = html.match(/const CURRENT_VERSION = "([^"]+)"/);
    const versionConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
    assert.ok(currentVersion, 'CURRENT_VERSION must exist');
    assert.strictEqual(currentVersion[1], versionConfig.version, 'frontend and version.json must match');
}

console.log('product-movement-report tests: PASS');
