const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FIXED_NOW = new Date('2026-08-12T11:00:00.000Z'); // 18:00 Asia/Bangkok

class MockSheet {
    constructor(rows) {
        this.rows = rows.map(row => row.slice());
    }

    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(1, ...this.rows.map(row => row.length)); }
    getRange(row, column, rowCount, columnCount) {
        return {
            getValues: () => Array.from({ length: rowCount }, (_, rowOffset) => {
                const source = this.rows[row - 1 + rowOffset] || [];
                return Array.from({ length: columnCount }, (_, columnOffset) =>
                    source[column - 1 + columnOffset] === undefined
                        ? ''
                        : source[column - 1 + columnOffset]
                );
            })
        };
    }
}

function formatBangkok(date, timeZone, pattern) {
    assert.strictEqual(timeZone, 'Asia/Bangkok');
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date).reduce((result, part) => {
        result[part.type] = part.value;
        return result;
    }, {});
    if (pattern === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
    if (pattern === 'dd/MM/yyyy') return `${parts.day}/${parts.month}/${parts.year}`;
    if (pattern === 'HH:mm') {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).format(date);
    }
    if (pattern === 'dd/MM/yyyy HH:mm') {
        const timeParts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).reduce((result, part) => {
            result[part.type] = part.value;
            return result;
        }, {});
        return `${parts.day}/${parts.month}/${parts.year} ${timeParts.hour}:${timeParts.minute}`;
    }
    if (pattern === 'dd MMM yyyy') return `${parts.day} Aug ${parts.year}`;
    throw new Error(`Unsupported date format: ${pattern}`);
}

function inventoryRow({
    id,
    requestAt,
    name,
    requestQty,
    status,
    receiveQty = '',
    dispatchAt = ''
}) {
    return [
        id, requestAt, name, requestQty, status,
        '', '', receiveQty, '', '', 0, dispatchAt, '', '', '', '', ''
    ];
}

function runSummary(rows, options = {}) {
    const lineMessages = [];
    const properties = options.properties || {};
    const fixedNow = options.now || FIXED_NOW;
    const sheet = new MockSheet([
        ['id', 'timestamp', 'itemName', 'requestQty', 'status', 'oldExpiry', 'newExpiry', 'receiveQty', 'receiveNote', 'w2Note', 'storageCapacity', 'dispatchTimestamp', 'requestedBy', 'recheckQty', 'recheckAt', 'recheckBy', 'recheckNote'],
        ...rows
    ]);
    class FixedDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [fixedNow.getTime()]));
        }
        static now() { return fixedNow.getTime(); }
    }
    const context = {
        console,
        Date: FixedDate,
        JSON,
        Math,
        Object,
        String,
        Array,
        Number,
        RegExp,
        parseInt,
        isFinite,
        isNaN,
        SpreadsheetApp: {
            openById() {
                return { getSheetByName() { return sheet; } };
            }
        },
        Utilities: { formatDate: formatBangkok },
        Logger: { log() {} },
        PropertiesService: {
            getScriptProperties() {
                return {
                    getProperty(key) { return properties[key] || null; },
                    setProperty(key, value) { properties[key] = String(value); }
                };
            }
        },
        CacheService: {},
        LockService: {},
        Session: {},
        ScriptApp: {},
        UrlFetchApp: {},
        ContentService: { MimeType: { JSON: 'json' } }
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs.txt'), 'utf8');
    vm.runInContext(source, context, { filename: 'Code.gs.txt' });
    context.__lineMessages = lineMessages;
    context.__lineError = options.lineError || '';
    vm.runInContext(`
        pushLineText_ = function(text) {
            if (__lineError) throw new Error(__lineError);
            __lineMessages.push(text);
        };
    `, context);
    vm.runInContext('sendDailyDispatchSummary()', context);
    assert.strictEqual(lineMessages.length, 1, 'summary sends exactly one LINE message');
    return lineMessages[0];
}

{
    const properties = {
        DAILY_DISPATCH_SUMMARY_LAST_SUCCESS_AT: '2026-08-12T11:00:00.000Z'
    };
    const message = runSummary([
        inventoryRow({
            id: 'AFTER-PREVIOUS-SUMMARY',
            requestAt: '10-08-2026 / 09:00 น.',
            name: 'สินค้าจัดหลังแจ้งเตือน',
            requestQty: 6,
            status: 'รอตรวจรับ',
            receiveQty: 6,
            dispatchAt: '12-08-2026 / 20:00 น.'
        })
    ], {
        now: new Date('2026-08-13T11:00:00.000Z'),
        properties
    });

    assert.match(message, /✅ จัดส่งสำเร็จ 1 รายการ/);
    assert.match(message, /✅ จัดส่งสำเร็จในช่วงนี้/);
    assert.match(message, /สินค้าจัดหลังแจ้งเตือน — 6/);
    assert.match(message, /สินค้าจัดหลังแจ้งเตือน — 6 \(จัด 12\/08\/2026\)/);
    assert.doesNotMatch(message, /⏳ รอจัดอยู่ตอนนี้[\s\S]*สินค้าจัดหลังแจ้งเตือน/);
    assert.strictEqual(
        properties.DAILY_DISPATCH_SUMMARY_LAST_SUCCESS_AT,
        '2026-08-13T11:00:00.000Z',
        'successful LINE push advances the durable minute cutoff'
    );
}

{
    const message = runSummary([
        inventoryRow({
            id: 'FIRST-RUN-LATE', requestAt: '10-08-2026 / 09:00 น.',
            name: 'สินค้ารอบแรกหลังแจ้ง', requestQty: 4, status: 'รอตรวจรับ',
            receiveQty: 4, dispatchAt: '12-08-2026 / 20:00 น.'
        })
    ], {
        now: new Date('2026-08-13T11:00:00.000Z'),
        properties: {}
    });
    assert.match(message, /✅ จัดส่งสำเร็จ 1 รายการ/);
    assert.match(message, /สินค้ารอบแรกหลังแจ้ง — 4 \(จัด 12\/08\/2026\)/);
}

{
    const properties = {
        DAILY_DISPATCH_SUMMARY_LAST_SUCCESS_AT: '2026-08-12T11:00:00.000Z'
    };
    assert.throws(() => runSummary([
        inventoryRow({
            id: 'FAILED-LINE', requestAt: '12-08-2026 / 09:00 น.',
            name: 'สินค้ารอส่งซ้ำ', requestQty: 2, status: 'รอตรวจรับ',
            receiveQty: 2, dispatchAt: '12-08-2026 / 20:00 น.'
        })
    ], {
        now: new Date('2026-08-13T11:00:00.000Z'),
        properties,
        lineError: 'test LINE failure'
    }), /test LINE failure/);
    assert.strictEqual(
        properties.DAILY_DISPATCH_SUMMARY_LAST_SUCCESS_AT,
        '2026-08-12T11:00:00.000Z',
        'failed LINE push must preserve the prior cutoff for retry'
    );
}

{
    const properties = {};
    const rows = [
        inventoryRow({
            id: 'BEFORE-CUTOFF', requestAt: '12-08-2026 / 09:00 น.',
            name: 'สินค้าก่อนนาทีตัด', requestQty: 1, status: 'รอตรวจรับ',
            receiveQty: 1, dispatchAt: '12-08-2026 / 17:59 น.'
        }),
        inventoryRow({
            id: 'AT-CUTOFF', requestAt: '12-08-2026 / 09:00 น.',
            name: 'สินค้าที่นาทีตัด', requestQty: 1, status: 'รอตรวจรับ',
            receiveQty: 1, dispatchAt: '12-08-2026 / 18:00 น.'
        })
    ];
    const firstMessage = runSummary(rows, {
        now: new Date('2026-08-12T11:00:30.000Z'),
        properties
    });
    assert.match(firstMessage, /✅ จัดส่งสำเร็จ 1 รายการ/);
    assert.match(firstMessage, /สินค้าก่อนนาทีตัด — 1/);
    assert.strictEqual(properties.DAILY_DISPATCH_SUMMARY_LAST_SUCCESS_AT, '2026-08-12T11:00:00.000Z');

    const sameMinuteMessage = runSummary(rows, {
        now: new Date('2026-08-12T11:00:45.000Z'),
        properties
    });
    assert.match(sameMinuteMessage, /✅ จัดส่งสำเร็จ 0 รายการ/);

    const secondMessage = runSummary(rows, {
        now: new Date('2026-08-13T11:00:00.000Z'),
        properties
    });
    assert.match(secondMessage, /✅ จัดส่งสำเร็จ 1 รายการ/);
    assert.match(secondMessage, /สินค้าที่นาทีตัด — 1/);
    assert.strictEqual(
        countOccurrences(secondMessage, 'สินค้าก่อนนาทีตัด'),
        1,
        'the prior item appears only in the current pending snapshot, not twice in arranged results'
    );
}

function countOccurrences(text, value) {
    return text.split(value).length - 1;
}

{
    const message = runSummary([
        inventoryRow({
            id: 'CROSS-DAY-FULL',
            requestAt: '11-08-2026 / 09:00 น.',
            name: 'สินค้าจัดข้ามวัน',
            requestQty: 5,
            status: 'รอตรวจรับ',
            receiveQty: 5,
            dispatchAt: '12-08-2026 / 14:00 น.'
        })
    ]);

    assert.match(message, /✅ จัดส่งสำเร็จ 1 รายการ/);
    assert.match(message, /✅ จัดส่งสำเร็จในช่วงนี้[\s\S]*สินค้าจัดข้ามวัน — 5/);
    assert.doesNotMatch(message, /⏳ รอจัดอยู่ตอนนี้[\s\S]*สินค้าจัดข้ามวัน/);
}

{
    const message = runSummary([
        inventoryRow({
            id: 'CROSS-DAY-PARTIAL',
            requestAt: '11-08-2026 / 10:00 น.',
            name: 'สินค้าจัดได้บางส่วน',
            requestQty: 8,
            status: 'รอตรวจรับ',
            receiveQty: 3,
            dispatchAt: '12-08-2026 / 15:00 น.'
        })
    ]);

    assert.match(message, /⚠️ จัดส่งไม่ครบ 1 รายการ/);
    assert.match(message, /⚠️ จัดส่งไม่ครบในช่วงนี้[\s\S]*สินค้าจัดได้บางส่วน — ส่ง 3\/8/);
    assert.doesNotMatch(message, /⏳ รอจัดอยู่ตอนนี้[\s\S]*สินค้าจัดได้บางส่วน/);
}

{
    const message = runSummary([
        inventoryRow({
            id: 'COMPLETED-TODAY', requestAt: '10-08-2026 / 09:00 น.',
            name: 'สินค้าตรวจรับแล้ว', requestQty: 4, status: 'รับสินค้าแล้ว',
            receiveQty: 4, dispatchAt: '12-08-2026 / 10:00 น.'
        }),
        inventoryRow({
            id: 'PARTIAL-TODAY', requestAt: '09-08-2026 / 09:00 น.',
            name: 'สินค้าไม่ครบยืนยันแล้ว', requestQty: 9, status: 'จัดส่งไม่ครบ',
            receiveQty: 2, dispatchAt: '12-08-2026 / 11:00 น.'
        }),
        inventoryRow({
            id: 'OUTSTOCK-TODAY', requestAt: '11-08-2026 / 09:00 น.',
            name: 'สินค้าซีขาดสต๊อก', requestQty: 7, status: 'สินค้าหมด',
            dispatchAt: '12-08-2026 / 12:00 น.'
        }),
        inventoryRow({
            id: 'NOT-DISPATCHED', requestAt: '12-08-2026 / 09:00 น.',
            name: 'สินค้ายังไม่จัด', requestQty: 6, status: 'สั่งเบิก'
        }),
        inventoryRow({
            id: 'OLD-WAITING', requestAt: '10-08-2026 / 09:00 น.',
            name: 'สินค้าจัดวันก่อน', requestQty: 3, status: 'รอตรวจรับ',
            receiveQty: 3, dispatchAt: '11-08-2026 / 16:00 น.'
        }),
        inventoryRow({
            id: 'CANCELLED-TODAY', requestAt: '12-08-2026 / 08:00 น.',
            name: 'รายการยกเลิก', requestQty: 99, status: 'ยกเลิกรายการ',
            dispatchAt: '12-08-2026 / 09:00 น.'
        })
    ]);

    assert.match(message, /✅ จัดส่งสำเร็จ 1 รายการ/);
    assert.match(message, /⚠️ จัดส่งไม่ครบ 1 รายการ/);
    assert.match(message, /❌ สินค้าหมด 1 รายการ/);
    assert.match(message, /⏳ รอจัดส่ง 2 รายการ/);
    ['สินค้าตรวจรับแล้ว', 'สินค้าไม่ครบยืนยันแล้ว', 'สินค้าซีขาดสต๊อก', 'สินค้ายังไม่จัด', 'สินค้าจัดวันก่อน']
        .forEach(name => assert.strictEqual(countOccurrences(message, name), 1, `${name} appears exactly once`));
    assert.doesNotMatch(message, /รายการยกเลิก/);
}

console.log('TRDAKRA daily dispatch summary tests passed');
