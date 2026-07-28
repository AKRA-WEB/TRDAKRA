const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockRange {
    constructor(sheet, row, column, rowCount, columnCount) {
        this.sheet = sheet;
        this.row = row;
        this.column = column;
        this.rowCount = rowCount;
        this.columnCount = columnCount;
    }

    getValues() {
        const values = [];
        for (let r = 0; r < this.rowCount; r++) {
            const source = this.sheet.rows[this.row - 1 + r] || [];
            const row = [];
            for (let c = 0; c < this.columnCount; c++) {
                row.push(source[this.column - 1 + c] === undefined ? '' : source[this.column - 1 + c]);
            }
            values.push(row);
        }
        return values;
    }

    setValues(values) {
        values.forEach((valuesRow, r) => {
            const targetIndex = this.row - 1 + r;
            if (!this.sheet.rows[targetIndex]) this.sheet.rows[targetIndex] = [];
            valuesRow.forEach((value, c) => {
                this.sheet.rows[targetIndex][this.column - 1 + c] = value;
            });
        });
        return this;
    }

    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
}

class MockSheet {
    constructor(name, rows = []) {
        this.name = name;
        this.rows = rows.map(row => row.slice());
    }

    getName() { return this.name; }
    getLastRow() { return this.rows.length; }
    getRange(row, column, rowCount, columnCount) {
        return new MockRange(this, row, column, rowCount, columnCount);
    }
    getDataRange() {
        const width = Math.max(1, ...this.rows.map(row => row.length));
        return new MockRange(this, 1, 1, this.rows.length, width);
    }
    deleteRows(startRow, count) {
        this.rows.splice(startRow - 1, count);
    }
}

class MockSpreadsheet {
    constructor(sheets) {
        this.sheets = {};
        sheets.forEach(sheet => { this.sheets[sheet.getName()] = sheet; });
    }

    getSheetByName(name) { return this.sheets[name] || null; }
    insertSheet(name) {
        const sheet = new MockSheet(name);
        this.sheets[name] = sheet;
        return sheet;
    }
    getSheets() { return Object.values(this.sheets); }
}

function formatBangkok(date, timeZone, pattern) {
    assert.strictEqual(timeZone, 'Asia/Bangkok');
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    if (pattern === 'yyyy_MM') return `${parts.year}_${parts.month}`;
    if (pattern === 'yyyy-MM-dd_HH:mm') return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}:${parts.minute}`;
    if (pattern === 'yyyy') return parts.year;
    if (pattern === 'dd-MM') return `${parts.day}-${parts.month}`;
    if (pattern === 'dd-MM-yyyy / HH:mm น.') {
        return `${parts.day}-${parts.month}-${parts.year} / ${parts.hour}:${parts.minute} น.`;
    }
    throw new Error(`Unsupported test date format: ${pattern}`);
}

function createRuntime(sheets, initialProperties = {}) {
    const spreadsheet = new MockSpreadsheet(sheets);
    const properties = { ...initialProperties };
    const lineMessages = [];
    const lockEvents = [];
    const lock = {
        waitLock() { lockEvents.push('wait'); },
        releaseLock() { lockEvents.push('release'); }
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
        isFinite,
        isNaN,
        PropertiesService: {
            getScriptProperties() {
                return {
                    getProperty(key) { return properties[key] || null; },
                    setProperty(key, value) { properties[key] = String(value); }
                };
            }
        },
        SpreadsheetApp: { openById() { return spreadsheet; } },
        LockService: { getScriptLock() { return lock; } },
        Utilities: { formatDate: formatBangkok },
        Logger: { log() {} },
        Session: { getScriptTimeZone() { return 'Asia/Bangkok'; } },
        ScriptApp: {},
        UrlFetchApp: {},
        ContentService: { MimeType: { JSON: 'json' } }
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs.txt'), 'utf8');
    vm.runInContext(source, context, { filename: 'Code.gs.txt' });
    context.__lineMessages = lineMessages;
    vm.runInContext(`
        pushLineText_ = function(text) { __lineMessages.push(text); };
        getInventoryData = function() { return []; };
        getProductUnit = function() { return 'ชิ้น'; };
    `, context);
    const api = vm.runInContext(`({
        parseSurveyDate_,
        getSurveyMonthKey_,
        getSurveyLogMonthly,
        getSurveyLog,
        getSurveyLogCurrentSheet_,
        migrateSurveyLogToMonthlySheets,
        auditSurveyLogMonthlyMigration,
        saveSurveyLog,
        sendDailyStockSummary,
        testSendDailyStockSummary
    })`, context);
    return { api, spreadsheet, properties, lineMessages, lockEvents };
}

const header = ['SurveyDate', 'Floor', 'ProductName', 'CurrentStock', 'ParLevel', 'NeedToOrder', 'Status', 'SurveyedBy'];
const surveyRow = (date, floor, product, need = 0, user = 'Tester') =>
    [date, floor, product, 1, 2, need, need > 0 ? 'low' : 'ok', user];

{
    const { api } = createRuntime([new MockSheet('SurveyLog', [header])]);
    assert.strictEqual(api.getSurveyMonthKey_('01-06-2026 / 08:15 น.'), '2026_06');
    assert.strictEqual(api.getSurveyMonthKey_('01-06-2569 / 08:15 น.'), '2026_06');
    assert.strictEqual(api.getSurveyMonthKey_('31-02-2026 / 08:15 น.'), null);
    assert.strictEqual(api.getSurveyMonthKey_('2026-07-01T00:00:00.000Z'), '2026_07');
}

{
    const legacyRows = [
        header,
        surveyRow('01-06-2026 / 08:00 น.', '1', 'A'),
        surveyRow('30-06-2569 / 09:00 น.', '2', 'B', 1),
        surveyRow('01-07-2026 / 10:00 น.', '1', 'C'),
        surveyRow('02-07-2569 / 11:00 น.', '2', 'D', 2)
    ];
    const runtime = createRuntime([new MockSheet('SurveyLog', legacyRows)]);
    const first = runtime.api.migrateSurveyLogToMonthlySheets();
    assert.strictEqual(first.enabled, true);
    assert.strictEqual(first.months['2026_06'].monthlyRows, 2);
    assert.strictEqual(first.months['2026_07'].monthlyRows, 2);
    assert.strictEqual(runtime.properties.SURVEY_LOG_MONTHLY_ENABLED, '1');

    assert.strictEqual(runtime.api.saveSurveyLog('Tester', '3', [{ name: 'E', currentStock: 1, parLevel: 2 }]), true);
    const july = runtime.spreadsheet.getSheetByName('SurveyLog_2026_07');
    const rowsAfterSave = july.getLastRow();
    const second = runtime.api.migrateSurveyLogToMonthlySheets();
    assert.strictEqual(second.prefixMatches, true);
    assert.strictEqual(july.getLastRow(), rowsAfterSave, 'migration rerun must not duplicate legacy rows');
    assert.strictEqual(runtime.api.getSurveyLogCurrentSheet_(runtime.spreadsheet).getName(), 'SurveyLog_2026_07');
    const staleResponse = runtime.api.getSurveyLog();
    assert.strictEqual(staleResponse.length, 5, 'stale response must include post-cutover monthly writes');
    assert.strictEqual(staleResponse[0].productName, 'E');
}

{
    const invalid = createRuntime([
        new MockSheet('SurveyLog', [header, surveyRow('not-a-date', '1', 'A')])
    ]);
    assert.throws(() => invalid.api.migrateSurveyLogToMonthlySheets(), /unparseable dates/);
    assert.strictEqual(invalid.properties.SURVEY_LOG_MONTHLY_ENABLED, undefined);
}

{
    const rows = [header];
    for (let session = 0; session < 40; session++) {
        for (let item = 0; item < 10; item++) {
            rows.push(surveyRow(
                `${String((session % 28) + 1).padStart(2, '0')}-07-2026 / ${String(session % 24).padStart(2, '0')}:00 น.`,
                `F${session}`,
                `Product ${session}-${item}`,
                item === 0 ? 1 : 0,
                `User ${session}`
            ));
        }
    }
    const runtime = createRuntime(
        [new MockSheet('SurveyLog', [header]), new MockSheet('SurveyLog_2026_07', rows)],
        { SURVEY_LOG_MONTHLY_ENABLED: '1' }
    );
    const response = runtime.api.getSurveyLogMonthly('2026_07');
    assert.strictEqual(response.status, 'success');
    assert.strictEqual(response.summary.recordCount, 400);
    assert.strictEqual(response.summary.sessionCount, 40);
    assert.strictEqual(response.summary.needToOrderCount, 40);
    assert.strictEqual(response.detailRecordCount, 200);
    assert.ok(response.detailSessionCount <= 30);
    assert.deepStrictEqual(Array.from(response.availableMonths), ['2026_07']);
}

{
    const rows = [header];
    for (let session = 0; session < 40; session++) {
        rows.push(surveyRow(`01-07-2026 / 08:00 น.`, `F${session}`, `Product ${session}`, 0, `User ${session}`));
    }
    const runtime = createRuntime(
        [new MockSheet('SurveyLog', [header]), new MockSheet('SurveyLog_2026_07', rows)],
        { SURVEY_LOG_MONTHLY_ENABLED: '1' }
    );
    const response = runtime.api.getSurveyLogMonthly('2026_07');
    assert.strictEqual(response.detailSessionCount, 30);
    assert.strictEqual(response.detailRecordCount, 30);
}

{
    const rows = [
        header,
        surveyRow('01-07-2026 / 08:00 น.', '1', 'A', 0, 'Same User'),
        surveyRow('01-07-2026 / 09:00 น.', '1', 'B', 0, 'Same User')
    ];
    const runtime = createRuntime(
        [new MockSheet('SurveyLog', [header]), new MockSheet('SurveyLog_2026_07', rows)],
        { SURVEY_LOG_MONTHLY_ENABLED: '1' }
    );
    const response = runtime.api.getSurveyLogMonthly('2026_07');
    assert.strictEqual(response.summary.sessionCount, 2, 'different survey times are separate sessions');
    assert.strictEqual(response.detailSessionCount, 2);
    assert.notStrictEqual(response.details[0].sessionKey, response.details[1].sessionKey);
}

{
    const malformedHeader = ['WrongDate', ...header.slice(1)];
    const runtime = createRuntime([
        new MockSheet('SurveyLog', [header, surveyRow('01-06-2026 / 08:00 น.', '1', 'A')]),
        new MockSheet('SurveyLog_2026_06', [malformedHeader])
    ]);
    assert.throws(() => runtime.api.migrateSurveyLogToMonthlySheets(), /preflight failed/);
    assert.strictEqual(runtime.properties.SURVEY_LOG_MONTHLY_ENABLED, undefined);
}

{
    const runtime = createRuntime([
        new MockSheet('SurveyLog', [header, surveyRow('01-06-2026 / 08:00 น.', '1', 'A')]),
        new MockSheet('SurveyLog_2026_05', [header, surveyRow('01-05-2026 / 08:00 น.', '1', 'Orphan')])
    ]);
    assert.throws(() => runtime.api.migrateSurveyLogToMonthlySheets(), /preflight failed/);
    assert.strictEqual(runtime.properties.SURVEY_LOG_MONTHLY_ENABLED, undefined);
}

{
    const missingMonth = createRuntime(
        [new MockSheet('SurveyLog', [header])],
        { SURVEY_LOG_MONTHLY_ENABLED: '1' }
    );
    missingMonth.api.sendDailyStockSummary();
    assert.strictEqual(missingMonth.lineMessages.length, 1);
    assert.match(missingMonth.lineMessages[0], /ไม่พบสินค้าขาดแคลน/);

    const headerOnlyMonth = createRuntime(
        [new MockSheet('SurveyLog', [header]), new MockSheet('SurveyLog_2026_07', [header])],
        { SURVEY_LOG_MONTHLY_ENABLED: '1' }
    );
    headerOnlyMonth.api.sendDailyStockSummary();
    assert.strictEqual(headerOnlyMonth.lineMessages.length, 1);

    headerOnlyMonth.api.testSendDailyStockSummary();
    assert.deepStrictEqual(headerOnlyMonth.lockEvents, ['wait', 'release']);
    assert.strictEqual(headerOnlyMonth.spreadsheet.getSheetByName('SurveyLog_2026_07').getLastRow(), 1);
}

{
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inlineScript, 'index.html inline script must exist');
    new vm.Script(inlineScript[1], { filename: 'index.html' });
    const currentVersion = html.match(/const CURRENT_VERSION = "([^"]+)"/);
    const versionConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
    assert.ok(currentVersion, 'CURRENT_VERSION must exist');
    assert.strictEqual(currentVersion[1], versionConfig.version, 'frontend and version.json must match');
    assert.match(inlineScript[1], /requestId !== state\.surveyLogsRequestId/, 'month requests must ignore stale responses');
}

console.log('surveylog-monthly tests: PASS');
