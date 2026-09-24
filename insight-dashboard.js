// Read-only Dashboard. Existing W1/W2 and Analytics renderers remain available.
const INSIGHT_OPEN = new Set(['สั่งเบิก', 'กำลังจัดสินค้า', 'รอตรวจรับ']);
const INSIGHT_ISSUE = new Set(['จัดส่งไม่ครบ', 'สินค้าหมด', 'ยกเลิกรายการ', 'ยกเลิก']);
const INSIGHT_SENT = new Set(['รอตรวจรับ', 'จัดส่งแล้ว', 'รับสินค้าแล้ว', 'จัดส่งไม่ครบ']);

function insightDay(value) {
    const date = value instanceof Date ? value : new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const part = type => parts.find(p => p.type === type)?.value || '';
    return [part('year'), part('month'), part('day')].join('-');
}

function insightTime(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('th-TH', {
            timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    }
    return String(value);
}

function insightQty(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function insightQtyText(value, unit) {
    const quantity = insightQty(value);
    return quantity === null ? '—' : quantity.toLocaleString() + ' ' + unit;
}

function insightSent(item) {
    return INSIGHT_SENT.has(item.status) ||
        (!!item.dispatchTimestamp && !INSIGHT_ISSUE.has(item.status) && Number(item.receiveQty) > 0);
}

function insightReceived(item) {
    return !!(item.recheckAt || item.recheckBy || item.receiptReceivedAt) ||
        item.status === 'รับสินค้าแล้ว' ||
        (item.status === 'จัดส่งไม่ครบ' && item.recheckQty !== null && item.recheckQty !== undefined);
}

function insightRows() {
    const now = Date.now();
    const first = state.insightRange === 'all' ? '' :
        state.insightRange === 'custom' ? state.insightFrom :
        insightDay(new Date(now - (Number(state.insightRange) - 1) * 86400000));
    const last = state.insightRange === 'custom' ? state.insightTo : insightDay(new Date(now));
    return state.items.filter(item => {
        const day = insightDay(item.rawDate);
        return day && (!first || day >= first) && (!last || day <= last);
    }).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
}

function insightStatusMatch(item) {
    return state.insightStatus === 'all' ||
        (state.insightStatus === 'open' && INSIGHT_OPEN.has(item.status)) ||
        (state.insightStatus === 'done' && insightReceived(item)) ||
        (state.insightStatus === 'issue' && INSIGHT_ISSUE.has(item.status));
}

function insightRecordMatches(item) {
    const query = state.insightSearch.trim().toLocaleLowerCase('th');
    return insightStatusMatch(item) && (!query ||
        [item.id, item.itemName, item.requestedBy, item.w2Note, item.receiptReceivedBy, item.recheckBy]
            .some(value => String(value || '').toLocaleLowerCase('th').includes(query)));
}

function setInsightTab(tab) {
    state.insightTab = tab;
    if (tab !== 'overview' && tab !== 'legacy' && !state.fullHistoryLoaded && !state.fullHistoryLoading && getTrdToken()) {
        ensureFullHistoryLoaded({ renderStart: true });
    } else {
        render();
    }
}

function setInsightRange(range) {
    state.insightRange = range;
    state.insightFrom = '';
    state.insightTo = '';
    render();
}

function setInsightDate(field, value) {
    state.insightRange = 'custom';
    state[field] = value;
    render();
}

function setInsightStatus(value) {
    state.insightStatus = value;
    render();
}

function setInsightSearch(value) {
    state.insightSearch = value;
    const rows = document.getElementById('insight-record-body');
    const count = document.getElementById('insight-record-count');
    if (!rows || !count) return;
    const filtered = insightRows().filter(insightRecordMatches);
    count.textContent = filtered.length + ' รายการ';
    rows.innerHTML = insightRecordCells(filtered);
}

function insightMetric(label, value, note, tone = '') {
    return `<div class="insight-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
}

function insightOverview(rows) {
    const pending = rows.filter(i => i.status === 'สั่งเบิก').length;
    const preparing = rows.filter(i => i.status === 'กำลังจัดสินค้า').length;
    const awaiting = rows.filter(i => i.status === 'รอตรวจรับ' || (i.status === 'จัดส่งแล้ว' && !insightReceived(i))).length;
    const received = rows.filter(insightReceived).length;
    const issues = rows.filter(i => INSIGHT_ISSUE.has(i.status));
    const other = Math.max(0, rows.length - pending - preparing - awaiting - received);
    const work = rows.filter(i => INSIGHT_OPEN.has(i.status)).sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));
    const max = Math.max(1, pending, preparing, awaiting, received, other);
    const stages = [
        ['รอจัดสินค้า', pending, 'pending'], ['กำลังจัดสินค้า', preparing, 'preparing'],
        ['ส่งแล้วรอตรวจรับ', awaiting, 'awaiting'], ['ตรวจรับแล้ว', received, 'received'],
        ['สถานะอื่น/ข้อยกเว้น', other, 'exception']
    ];
    const days = Array.from({ length: 7 }, (_, index) => insightDay(new Date(Date.now() - (6 - index) * 86400000)));
    const dayCounts = days.map(day => rows.filter(item => insightDay(item.rawDate) === day).length);
    const dayMax = Math.max(1, ...dayCounts);
    return `
        <div class="insight-metrics">
            ${insightMetric('รายการในช่วงที่เลือก', rows.length, 'นับตามวันเบิก')}
            ${insightMetric('ยังไม่ส่ง', pending + preparing, 'รอจัด + กำลังจัด', 'amber')}
            ${insightMetric('ส่งแล้วรอตรวจรับ', awaiting, 'แยกจากจำนวนรับ', 'blue')}
            ${insightMetric('ตรวจรับแล้ว', received, 'รวมการรับ 0 ที่ยืนยันแล้ว', 'green')}
            ${insightMetric('ข้อยกเว้น', issues.length, 'ส่งไม่ครบ · หมด · ยกเลิก', 'rose')}
        </div>
        <div class="insight-columns">
            <section class="insight-card"><div class="insight-card-head"><h2>สถานะของรายการ</h2><span>ฐาน ${rows.length} รายการ</span></div>
                <div class="insight-stage-list">${stages.map(([label, count, tone]) =>
                    `<div><span>${label}</span><div class="insight-track"><i class="${tone}" style="width:${count / max * 100}%"></i></div><strong>${count}</strong></div>`
                ).join('')}</div>
                <p class="insight-foot">แต่ละขั้นรวมกันเท่าฐานรายการ; ข้อยกเว้นด้านบนอาจอยู่ในขั้นตรวจรับแล้วด้วย</p>
            </section>
            <section class="insight-card"><div class="insight-card-head"><h2>งานที่ต้องทำต่อ</h2><span>เปิดงานเดิมได้ทันที</span></div>
                <div class="insight-actions">
                    <button onclick="setView('w2');setW2Tab('tasks')"><span>จัดและส่งสินค้า</span><b>${pending + preparing}</b><span aria-hidden="true">→</span></button>
                    <button onclick="setView('w1');setW1Tab('pending')"><span>ตรวจรับหน้าร้าน</span><b>${awaiting}</b><span aria-hidden="true">→</span></button>
                    <button onclick="setView('check_stock')"><span>สำรวจสต็อก</span><span aria-hidden="true">→</span></button>
                    <button onclick="setView('location')"><span>จัดโลเคชั่น</span><span aria-hidden="true">→</span></button>
                </div>
            </section>
        </div>
        <div class="insight-columns">
            <section class="insight-card"><div class="insight-card-head"><h2>รายการค้างนานสุด</h2><button onclick="setInsightTab('records')">ดูทุกรายการ →</button></div>
                ${work.length ? work.slice(0, 5).map(item => `<button class="insight-list-row" onclick="openInsightDetail(${jsArg(item.id)})">
                    <span><strong>${esc(item.itemName)}</strong><small>${esc(item.id)} · ผู้เบิก ${esc(item.requestedBy || '—')}</small></span>
                    <span><strong>${esc(item.status)}</strong><small>${esc(insightTime(item.rawDate))}</small></span>
                </button>`).join('') : '<p class="insight-empty">ไม่มีรายการค้างในช่วงที่เลือก</p>'}
            </section>
            <section class="insight-card"><div class="insight-card-head"><h2>คำขอ 7 วันล่าสุด</h2><span>ตามวันเบิก</span></div>
                <div class="insight-trend">${days.map((day, index) => `<div title="${esc(day)}: ${dayCounts[index]} รายการ">
                    <div class="insight-trend-track"><i style="height:${Math.max(2, dayCounts[index] / dayMax * 100)}%"></i></div>
                    <small>${esc(day.slice(8))}</small><strong>${dayCounts[index]}</strong>
                </div>`).join('')}</div>
                <p class="insight-foot">กราฟนี้นับคำขอตามวันเบิก; ไม่ใช้วันส่งหรือวันรับแทน</p>
            </section>
        </div>`;
}

function insightProducts(rows) {
    const groups = new Map();
    rows.forEach(item => {
        const unit = getProductUnitClient(item.itemName);
        const key = item.itemName + '\u0000' + unit;
        if (!groups.has(key)) groups.set(key, { name: item.itemName, unit, count: 0, requested: 0, sent: 0, received: 0, sentMissing: 0, receivedMissing: 0, issues: 0 });
        const group = groups.get(key);
        group.count++;
        group.requested += insightQty(item.requestQty) || 0;
        if (insightSent(item)) {
            const quantity = insightQty(item.receiveQty);
            if (quantity === null) group.sentMissing++;
            else group.sent += quantity;
        }
        if (insightReceived(item)) {
            const quantity = insightQty(item.recheckQty);
            if (quantity === null) group.receivedMissing++;
            else group.received += quantity;
        }
        if (INSIGHT_ISSUE.has(item.status)) group.issues++;
    });
    const products = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'));
    return `<div class="insight-metrics insight-metrics--three">
        ${insightMetric('สินค้าในช่วงที่เลือก', products.length, 'จับคู่ตามชื่อ + หน่วย')}
        ${insightMetric('ส่งไม่ครบ', rows.filter(i => i.status === 'จัดส่งไม่ครบ').length, 'รายการ', 'amber')}
        ${insightMetric('สินค้าหมด', rows.filter(i => i.status === 'สินค้าหมด').length, 'รายการ', 'rose')}
    </div>
    <section class="insight-card"><div class="insight-card-head"><div><h2>การเคลื่อนไหวรายสินค้า</h2><p>จำนวนขอ ส่ง รับ แยกตามหน่วยของแต่ละสินค้า</p></div></div>
        <div class="trd-table-wrap"><table class="trd-data-table insight-table"><thead><tr><th>สินค้า</th><th>รอบเบิก</th><th>ขอ</th><th>ส่ง</th><th>รับ</th><th>ข้อยกเว้น</th></tr></thead><tbody>
        ${products.length ? products.map(p => `<tr><td class="trd-product-cell">${esc(p.name)}<small>${esc(p.unit)}</small></td>
            <td>${p.count}</td><td>${p.requested.toLocaleString()} ${esc(p.unit)}</td>
            <td>${p.sent.toLocaleString()} ${esc(p.unit)}${p.sentMissing ? `<small>${p.sentMissing} รายการไม่ทราบจำนวน</small>` : ''}</td>
            <td>${p.received.toLocaleString()} ${esc(p.unit)}${p.receivedMissing ? `<small>${p.receivedMissing} รายการไม่ทราบจำนวน</small>` : ''}</td><td>${p.issues || '—'}</td></tr>`).join('') :
            '<tr><td colspan="6" class="trd-table-empty">ไม่มีข้อมูลในช่วงนี้</td></tr>'}
        </tbody></table></div></section>
    <p class="insight-note">ข้อมูลปัจจุบันผูกประวัติด้วยชื่อสินค้า; ชื่อที่เปลี่ยนอาจแยกเป็นหลายแถว ต้องมี SKU ที่ยืนยันแล้วจึงรวมย้อนหลังได้</p>`;
}

function insightPeople(rows) {
    const people = new Map();
    const add = (name, role, id) => {
        if (!name) return;
        if (!people.has(name)) people.set(name, { name, request: 0, send: 0, receive: 0, ids: new Set() });
        const person = people.get(name);
        person[role]++;
        person.ids.add(id);
    };
    rows.forEach(item => {
        add(item.requestedBy, 'request', item.id);
        if (insightSent(item)) add(item.w2Note, 'send', item.id);
        if (insightReceived(item)) add(item.receiptReceivedBy || item.recheckBy, 'receive', item.id);
    });
    const sent = rows.filter(insightSent);
    const received = rows.filter(insightReceived);
    const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return `<div class="insight-metrics insight-metrics--three">
        ${insightMetric('ระบุผู้เบิก', rows.filter(i => i.requestedBy).length + '/' + rows.length, 'รายการในช่วง')}
        ${insightMetric('มีบันทึกผู้ส่ง', sent.filter(i => i.w2Note).length + '/' + sent.length, 'รายการที่ส่งแล้ว', 'blue')}
        ${insightMetric('ระบุผู้ตรวจรับ', received.filter(i => i.receiptReceivedBy || i.recheckBy).length + '/' + received.length, 'รายการที่ตรวจรับแล้ว', 'green')}
    </div>
    <section class="insight-card"><div class="insight-card-head"><div><h2>งานตามชื่อที่บันทึก</h2><p>หนึ่งคนอาจมีหลายบทบาท; จำนวนเป็นรายการสินค้า</p></div></div>
        <div class="trd-table-wrap"><table class="trd-data-table insight-table"><thead><tr><th>ชื่อที่บันทึก</th><th>เบิก</th><th>ส่ง</th><th>ตรวจรับ</th><th>รายการเกี่ยวข้อง</th></tr></thead><tbody>
        ${list.length ? list.map(p => `<tr><td class="trd-product-cell">${esc(p.name)}</td><td>${p.request || '—'}</td><td>${p.send || '—'}</td><td>${p.receive || '—'}</td><td>${p.ids.size}</td></tr>`).join('') :
            '<tr><td colspan="5" class="trd-table-empty">ไม่มีชื่อผู้ปฏิบัติงานในช่วงนี้</td></tr>'}
        </tbody></table></div></section>
    <p class="insight-note">ชื่อเหล่านี้เป็นข้อความในข้อมูลเดิม โดยผู้ส่งอ่านจากช่องบันทึก W2 จึงยังใช้ยืนยันตัวตนหรือวัดผลงานรายคนไม่ได้</p>`;
}

function insightRecordCells(rows) {
    return rows.length ? rows.map(item => {
        const unit = getProductUnitClient(item.itemName);
        const sent = insightSent(item), received = insightReceived(item);
        return `<tr><td><button class="insight-id" onclick="openInsightDetail(${jsArg(item.id)})">${esc(item.id)}</button>
                <small>${esc(item.itemName)}</small></td>
            <td>${esc(item.requestedBy || '—')}<small>${esc(insightTime(item.rawDate))} · ${esc(insightQtyText(item.requestQty, unit))}</small></td>
            <td>${sent ? esc(item.w2Note || '—') : '—'}<small>${sent ? esc(item.dispatchTimestamp || 'เวลาไม่ถูกบันทึก') + ' · ' + esc(insightQtyText(item.receiveQty, unit)) : 'ยังไม่จัดส่ง'}</small></td>
            <td>${received ? esc(item.receiptReceivedBy || item.recheckBy || '—') : '—'}<small>${received ? esc(item.recheckAt || insightTime(item.receiptReceivedAt)) + ' · ' + esc(insightQtyText(item.recheckQty, unit)) : 'ยังไม่ตรวจรับ'}</small></td>
            <td>${getStatusBadge(item.status)}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="trd-table-empty">ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>';
}

function insightRecords(rows) {
    const filtered = rows.filter(insightRecordMatches);
    return `<section class="insight-card"><div class="insight-card-head insight-filter-head"><div><h2>ทะเบียนทุกรายการ</h2><p id="insight-record-count">${filtered.length} รายการ</p></div>
        <div class="insight-filters"><label>ค้นหา <input type="search" value="${attr(state.insightSearch)}" oninput="setInsightSearch(this.value)" placeholder="เลขรายการ สินค้า หรือชื่อ"></label>
            <label>สถานะ <select onchange="setInsightStatus(this.value)">
                <option value="all" ${state.insightStatus === 'all' ? 'selected' : ''}>ทั้งหมด</option>
                <option value="open" ${state.insightStatus === 'open' ? 'selected' : ''}>งานค้าง</option>
                <option value="done" ${state.insightStatus === 'done' ? 'selected' : ''}>ตรวจรับแล้ว</option>
                <option value="issue" ${state.insightStatus === 'issue' ? 'selected' : ''}>ข้อยกเว้น</option>
            </select></label></div></div>
        <div class="trd-table-wrap"><table class="trd-data-table insight-table insight-record-table"><thead><tr>
            <th>รายการ / สินค้า</th><th>ผู้เบิก · เวลา · ขอ</th><th>ผู้ส่ง · เวลา · ส่ง</th><th>ผู้รับ · เวลา · รับ</th><th>สถานะ</th>
        </tr></thead><tbody id="insight-record-body">${insightRecordCells(filtered)}</tbody></table></div></section>`;
}

function openInsightDetail(id) {
    const item = state.items.find(row => String(row.id) === String(id));
    const dialog = document.getElementById('insight-detail');
    if (!item || !dialog) return;
    const sent = insightSent(item), received = insightReceived(item), unit = getProductUnitClient(item.itemName);
    const event = (name, person, date, quantity) => `<div class="insight-event"><span>${esc(name)}</span><strong>${esc(person || '—')}</strong>
        <small>${esc(date || 'เวลาไม่ถูกบันทึก')}${quantity === null ? '' : ' · ' + esc(quantity) + ' ' + esc(unit)}</small></div>`;
    dialog.innerHTML = `<div class="insight-dialog-head"><div><span>รายละเอียดรายการ ${esc(item.id)}</span><h2>${esc(item.itemName)}</h2>
        <p>${getStatusBadge(item.status)}</p></div><button aria-label="ปิดรายละเอียด" onclick="document.getElementById('insight-detail').close()">✕</button></div>
        <div class="insight-dialog-body">
            <div class="insight-detail-grid">
                ${insightMetric('จำนวนเบิก', insightQtyText(item.requestQty, unit), 'ผู้เบิก ' + (item.requestedBy || '—'))}
                ${insightMetric('จำนวนส่ง', sent ? insightQtyText(item.receiveQty, unit) : '—', 'ผู้ส่ง/บันทึก W2 ' + (sent ? item.w2Note || '—' : '—'), 'blue')}
                ${insightMetric('จำนวนรับ', received ? insightQtyText(item.recheckQty, unit) : '—', 'ผู้ตรวจรับ ' + (received ? item.receiptReceivedBy || item.recheckBy || '—' : '—'), 'green')}
            </div>
            <h3>ลำดับเหตุการณ์ที่มีบันทึก</h3>
            ${event('เบิก', item.requestedBy, insightTime(item.rawDate), insightQty(item.requestQty))}
            ${event('ส่ง', sent ? item.w2Note : 'ยังไม่จัดส่ง', sent ? item.dispatchTimestamp : '', sent ? insightQty(item.receiveQty) : null)}
            ${event('ตรวจรับ', received ? item.receiptReceivedBy || item.recheckBy : 'ยังไม่ตรวจรับ', received ? item.recheckAt || insightTime(item.receiptReceivedAt) : '', received ? insightQty(item.recheckQty) : null)}
            ${item.receiveNote || item.recheckNote ? `<p class="insight-detail-note">หมายเหตุ: ${esc([item.receiveNote, item.recheckNote].filter(Boolean).join(' · '))}</p>` : ''}
            <p class="insight-note">ข้อมูลผู้ส่งมาจากช่องบันทึก W2; เวลาและชื่อที่ไม่มีหลักฐานจะแสดงเป็น —</p>
        </div>`;
    dialog.showModal();
}

function renderHome() {
    const tabs = [['overview', 'ภาพรวม'], ['products', 'สินค้าและสต็อก'], ['people', 'ทีมงาน'],
        ['records', 'ทุกรายการ'], ['legacy', 'หน้าหลักเดิม']];
    const operational = getOperationalItems();
    const toPrepare = operational.filter(item => item.status === 'สั่งเบิก' || item.status === 'กำลังจัดสินค้า').length;
    const toReceive = operational.filter(item => item.status === 'รอตรวจรับ').length;
    const rows = insightRows();
    const body = state.insightTab === 'products' ? insightProducts(rows) :
        state.insightTab === 'people' ? insightPeople(rows) :
        state.insightTab === 'records' ? insightRecords(rows) :
        state.insightTab === 'legacy' ? renderHomeLegacy() : insightOverview(rows);
    const rangeLabel = state.insightRange === 'all' ? 'ทุกวันที่โหลด' :
        state.insightRange === 'custom' ? 'กำหนดเอง' : 'ย้อนหลัง ' + state.insightRange + ' วัน';
    return `<div class="trd-overview insight-dashboard">
        <div class="insight-intro"><div><span class="insight-eyebrow">TRD · AKRA / DASHBOARD</span>
            <h1>ภาพรวมการเบิก ส่ง และรับ</h1>
            <p>ติดตามงานประจำวันและวิเคราะห์รายการตามข้อมูลที่ระบบบันทึก</p></div>
            <button class="insight-legacy-link" onclick="setView('dashboard')">เปิด Analytics เชิงลึก →</button></div>
        <nav class="insight-mobile-actions" aria-label="งานหลักสำหรับพนักงาน">
            <button type="button" class="insight-mobile-action survey" onclick="setView('check_stock')" aria-label="1 สำรวจสต็อก เปิดหน้าสำรวจสต็อก">
                <span class="insight-mobile-action-top"><b>1</b><span class="material-icons-round" aria-hidden="true">fact_check</span></span>
                <strong>สำรวจสต็อก</strong><small>เช็กของหน้าร้าน</small>
            </button>
            <button type="button" class="insight-mobile-action prepare" onclick="setView('w2');setW2Tab('tasks')" aria-label="2 จัดสินค้า งานรอจัด ${toPrepare} รายการ">
                <span class="insight-mobile-action-top"><b>2</b><span class="material-icons-round" aria-hidden="true">inventory_2</span></span>
                <strong>จัดสินค้า</strong><small>รอจัด ${toPrepare} รายการ</small>
            </button>
            <button type="button" class="insight-mobile-action receive" onclick="setView('w1');setW1Tab('pending')" aria-label="3 รับสินค้า งานรอรับ ${toReceive} รายการ">
                <span class="insight-mobile-action-top"><b>3</b><span class="material-icons-round" aria-hidden="true">move_to_inbox</span></span>
                <strong>รับสินค้า</strong><small>รอรับ ${toReceive} รายการ</small>
            </button>
        </nav>
        <div class="insight-toolbar">
            <div class="insight-range" role="group" aria-label="ช่วงวันเบิก">
                ${[['7','7 วัน'],['30','30 วัน'],['all','ทั้งหมด']].map(([value,label]) =>
                    `<button aria-pressed="${state.insightRange === value}" onclick="setInsightRange('${value}')">${label}</button>`).join('')}
            </div>
            <div class="insight-dates"><label>จาก <input type="date" value="${attr(state.insightFrom)}" onchange="setInsightDate('insightFrom',this.value)"></label>
                <label>ถึง <input type="date" value="${attr(state.insightTo)}" onchange="setInsightDate('insightTo',this.value)"></label></div>
            <span class="insight-range-label">${esc(rangeLabel)} · ตามวันเบิก</span>
        </div>
        <nav class="insight-tabs" aria-label="มุมมอง Dashboard">${tabs.map(([id,label]) =>
            `<button aria-current="${state.insightTab === id ? 'page' : 'false'}" onclick="setInsightTab('${id}')">${label}</button>`).join('')}</nav>
        ${renderFullHistoryNotice()}
        ${!state.fullHistoryLoaded ? '<p class="insight-note">กำลังแสดงรายการที่โหลดในระบบ; เปิดแท็บข้อมูลเชิงลึกเพื่อโหลดประวัติทั้งหมด</p>' : ''}
        <div class="insight-content">${body}</div>
        <dialog id="insight-detail" class="insight-dialog" onclick="if(event.target===this)this.close()"></dialog>
    </div>`;
}
