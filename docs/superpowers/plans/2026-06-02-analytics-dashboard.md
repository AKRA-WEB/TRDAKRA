# Analytics Dashboard — Tab-based Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4-tab Analytics dashboard (สรุป / Trend+Calendar / หมด-ยกเลิก / Survey) to TRDAKRA replacing the single-page dashboard.

**Architecture:** Pure client-side — all computation on `state.items` + `state.products` already loaded. Survey tab lazy-fetches `getSurveyLog` once. Calendar uses CSS grid; bar charts use inline `height` style — no external chart library needed. Version bumped to `20260602.02` per version-checker protocol.

**Tech Stack:** Vanilla JS ES6+, Tailwind CSS CDN, Google Material Icons Round, Google Apps Script backend (no changes needed).

**Testing approach:** No test framework. Each task's verification step is manual: open `TRDAKRA/index.html?demo=1` in browser (local) to bypass SSO.

---

## File Map

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Add 6 state fields, add 6 new functions, modify `setDashboardFilter`, replace `renderDashboard` with orchestrator, add 7 new render functions |
| `TRDAKRA/version.json` | Bump `version` to `"20260602.02"` |

---

## Task 1: Add State Fields & Navigation Helpers

**Files:**
- Modify: `TRDAKRA/index.html` ~line 210 (end of `state` object) and ~line 581 (`setDashboardFilter`)

- [ ] **Step 1: Add 6 fields to the `state` object**

Find `checkStockSubmitting: false` (last field in `state`) and add after it:

```javascript
            checkStockSubmitting: false,
            // Analytics Dashboard
            dashboardTab: 'summary',
            calendarMonth: new Date().getMonth(),
            calendarYear: new Date().getFullYear(),
            calendarWeekOffset: 0,
            calendarSelectedDate: null,
            surveyLogs: null,
            surveyLogsLoading: false
```

- [ ] **Step 2: Update `setDashboardFilter` to reset calendar state on toggle**

Find and replace the existing function:
```javascript
function setDashboardFilter(val) { state.dashboardFilter = val; render(); }
```
Replace with:
```javascript
function setDashboardFilter(val) {
    state.dashboardFilter = val;
    state.calendarWeekOffset = 0;
    state.calendarMonth = new Date().getMonth();
    state.calendarYear = new Date().getFullYear();
    state.calendarSelectedDate = null;
    render();
}
```

- [ ] **Step 3: Add 6 new helper functions after `setDashboardFilter`**

```javascript
function setDashboardTab(tab) {
    state.dashboardTab = tab;
    if (tab === 'survey' && state.surveyLogs === null && !state.surveyLogsLoading) {
        fetchSurveyLogs();
    } else {
        render();
    }
}

function setCalendarNav(dir) {
    if (state.dashboardFilter === 'month') {
        state.calendarMonth += dir;
        if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; }
        if (state.calendarMonth < 0)  { state.calendarMonth = 11; state.calendarYear--; }
    } else {
        state.calendarWeekOffset = (state.calendarWeekOffset || 0) + dir;
    }
    state.calendarSelectedDate = null;
    render();
}

function selectCalendarDate(dateStr) {
    state.calendarSelectedDate = state.calendarSelectedDate === dateStr ? null : dateStr;
    render();
}

function getDisplayedWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + (state.calendarWeekOffset || 0) * 7);
    return monday;
}

function buildActivityMap() {
    const map = {};
    state.items.forEach(item => {
        const d = item.rawDate ? new Date(item.rawDate) : null;
        if (!d || isNaN(d.getTime())) return;
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (!map[key]) map[key] = { billCount: 0, hasStockout: false, qty: 0 };
        if (item.status === 'จัดส่งแล้ว' || item.status === 'รับสินค้าแล้ว') {
            map[key].billCount++;
            map[key].qty += parseInt(item.receiveQty) || 0;
        }
        if (item.status === 'สินค้าหมด') map[key].hasStockout = true;
    });
    return map;
}

async function fetchSurveyLogs() {
    state.surveyLogsLoading = true;
    render();
    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getSurveyLog`);
        state.surveyLogs = await res.json();
    } catch(e) {
        state.surveyLogs = [];
    }
    state.surveyLogsLoading = false;
    render();
}
```

- [ ] **Step 4: Verify state loads without crash**

Open `TRDAKRA/index.html?demo=1` in browser. Open DevTools console. Should see no errors. Navigate to Analytics — current dashboard still shows (we haven't changed render yet).

- [ ] **Step 5: Commit**

```
git add TRDAKRA/index.html
git commit -m "feat(analytics): add state fields and calendar/survey helper functions"
```

---

## Task 2: Refactor `renderDashboard` into Orchestrator + Tab Bar

**Files:**
- Modify: `TRDAKRA/index.html` — replace entire `renderDashboard()` function (~lines 1044–1189)

- [ ] **Step 1: Replace the entire `renderDashboard()` function**

Delete from `function renderDashboard() {` to its closing `}` and replace with:

```javascript
function renderDashboard() {
    const filter = state.dashboardFilter;

    let startDate;
    if (filter === 'week') {
        startDate = getDisplayedWeekStart();
    } else {
        startDate = new Date(state.calendarYear, state.calendarMonth, 1);
    }

    const dispatchedItems = state.items.filter(i => {
        const d = i.rawDate ? new Date(i.rawDate) : new Date(0);
        return (i.status === 'จัดส่งแล้ว' || i.status === 'รับสินค้าแล้ว') && d >= startDate;
    });

    const TABS = [
        { id: 'summary',  label: 'สรุป',       icon: 'bar_chart' },
        { id: 'trend',    label: 'Trend',       icon: 'calendar_month' },
        { id: 'problems', label: 'หมด/ยกเลิก', icon: 'warning_amber' },
        { id: 'survey',   label: 'Survey',      icon: 'fact_check' }
    ];

    return `
        <div class="w-full max-w-md bg-[#f8fafc] min-h-screen flex flex-col relative animate-fade-in">
            <header class="bg-brand-blue text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
                <div class="flex items-center gap-2">
                    <button onclick="setView('home')" class="p-1.5 rounded-full hover:bg-black/10 transition-colors text-white">
                        <span class="material-icons-round">arrow_back</span>
                    </button>
                    <h1 class="text-[17px] font-bold tracking-wide flex items-center gap-1.5">
                        <span class="material-icons-round text-[20px] text-white">insights</span> ข้อมูลเชิงลึก (Analytics)
                    </h1>
                </div>
                <button onclick="fetchInitialData(true)" class="p-1.5 rounded-full hover:bg-black/10 transition-colors text-white" title="รีเฟรชข้อมูล">
                    <span class="material-icons-round text-[20px]">refresh</span>
                </button>
            </header>

            <div class="bg-white px-4 py-3 shadow-sm sticky top-[60px] z-10 border-b border-slate-100 flex justify-center">
                <div class="bg-slate-100 p-1 rounded-xl flex w-full max-w-[250px]">
                    <button onclick="setDashboardFilter('week')" class="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${filter === 'week' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-400 hover:text-slate-600'}">สัปดาห์นี้</button>
                    <button onclick="setDashboardFilter('month')" class="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${filter === 'month' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-400 hover:text-slate-600'}">เดือนนี้</button>
                </div>
            </div>

            <div class="bg-white sticky top-[108px] z-10 border-b border-slate-100 flex">
                ${TABS.map(t => `
                    <button onclick="setDashboardTab('${t.id}')"
                            class="flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${state.dashboardTab === t.id ? 'text-brand-blue border-b-2 border-brand-blue bg-blue-50/50' : 'text-slate-400 hover:text-slate-500'}">
                        <span class="material-icons-round text-[18px]">${t.icon}</span>
                        <span class="text-[9px] font-semibold">${t.label}</span>
                    </button>
                `).join('')}
            </div>

            <main class="flex-1 overflow-y-auto p-5 pb-24 space-y-6">
                ${state.dashboardTab === 'summary'  ? renderDashboardSummary(dispatchedItems, state.items, startDate) :
                  state.dashboardTab === 'trend'    ? renderDashboardTrend() :
                  state.dashboardTab === 'problems' ? renderDashboardProblems(state.items, startDate) :
                  renderDashboardSurvey()}
            </main>
        </div>
    `;
}
```

- [ ] **Step 2: Verify tab bar renders**

Open `TRDAKRA/index.html?demo=1` → Analytics. Should see 4 tabs: สรุป / Trend / หมด-ยกเลิก / Survey. Clicking them will crash (sub-functions not yet defined) — that's expected.

- [ ] **Step 3: Commit**

```
git add TRDAKRA/index.html
git commit -m "feat(analytics): refactor renderDashboard to tab-based orchestrator"
```

---

## Task 3: Tab 1 — `renderDashboardSummary`

**Files:**
- Modify: `TRDAKRA/index.html` — add new function after `renderDashboard()`

- [ ] **Step 1: Add `renderDashboardSummary` function**

Insert directly after the closing `}` of `renderDashboard()`:

```javascript
function renderDashboardSummary(dispatchedItems, allItems, startDate) {
    let totalQty = 0, totalRequestQty = 0;
    const itemStats = {};
    const requesterStats = {};

    dispatchedItems.forEach(item => {
        const qty = parseInt(item.receiveQty) || 0;
        const reqQty = parseInt(item.requestQty) || 0;
        const capacity = parseInt(item.storageCapacity) || 0;
        totalQty += qty;
        totalRequestQty += reqQty;
        if (!itemStats[item.itemName]) itemStats[item.itemName] = { count: 0, qty: 0, capacity: 0 };
        itemStats[item.itemName].count++;
        itemStats[item.itemName].qty += qty;
        if (capacity > itemStats[item.itemName].capacity) itemStats[item.itemName].capacity = capacity;
        if (item.requestedBy) requesterStats[item.requestedBy] = (requesterStats[item.requestedBy] || 0) + 1;
    });

    const problemCount = allItems.filter(i => {
        const d = i.rawDate ? new Date(i.rawDate) : new Date(0);
        return (i.status === 'สินค้าหมด' || i.status === 'ยกเลิก') && d >= startDate;
    }).length;

    const fulfillmentRate = totalRequestQty > 0 ? Math.round((totalQty / totalRequestQty) * 100) : 100;
    const fulfillBg = fulfillmentRate >= 90 ? 'bg-emerald-500 shadow-emerald-500/20' : fulfillmentRate >= 70 ? 'bg-amber-500 shadow-amber-500/20' : 'bg-rose-500 shadow-rose-500/20';

    const topItems = Object.keys(itemStats).map(k => ({
        name: k, count: itemStats[k].count, qty: itemStats[k].qty, capacity: itemStats[k].capacity
    })).sort((a, b) => b.qty - a.qty).slice(0, 10);

    const topRequesters = Object.entries(requesterStats)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([name, count]) => ({ name, count }));

    return `
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-brand-blue p-4 rounded-[1.5rem] shadow-lg shadow-brand-blue/20 text-white relative overflow-hidden">
                <span class="material-icons-round absolute -right-2 -bottom-2 text-[60px] opacity-10">inventory</span>
                <p class="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">ยอดจัดส่งรวม</p>
                <p class="text-2xl font-bold">${totalQty.toLocaleString()} <span class="text-xs font-medium text-white/80">ชิ้น</span></p>
            </div>
            <div class="bg-brand-orange p-4 rounded-[1.5rem] shadow-lg shadow-brand-orange/20 text-white relative overflow-hidden">
                <span class="material-icons-round absolute -right-2 -bottom-2 text-[60px] opacity-10">receipt_long</span>
                <p class="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">จำนวนบิลเบิก</p>
                <p class="text-2xl font-bold">${dispatchedItems.length.toLocaleString()} <span class="text-xs font-medium text-white/80">รายการ</span></p>
            </div>
            <div class="${fulfillBg} p-4 rounded-[1.5rem] shadow-lg text-white relative overflow-hidden">
                <span class="material-icons-round absolute -right-2 -bottom-2 text-[60px] opacity-10">task_alt</span>
                <p class="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">Fulfillment Rate</p>
                <p class="text-2xl font-bold">${fulfillmentRate}<span class="text-xs font-medium text-white/80">%</span></p>
            </div>
            <div class="bg-rose-500 p-4 rounded-[1.5rem] shadow-lg shadow-rose-500/20 text-white relative overflow-hidden">
                <span class="material-icons-round absolute -right-2 -bottom-2 text-[60px] opacity-10">error_outline</span>
                <p class="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">หมด/ยกเลิก</p>
                <p class="text-2xl font-bold">${problemCount} <span class="text-xs font-medium text-white/80">รายการ</span></p>
            </div>
        </div>

        ${topRequesters.length > 0 ? `
        <div>
            <h3 class="text-sm font-bold text-brand-blue mb-3 flex items-center gap-2 px-1">
                <span class="material-icons-round text-brand-orange text-[18px]">emoji_people</span> ผู้ขอเบิกสูงสุด
            </h3>
            <div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 divide-y divide-slate-50">
                ${topRequesters.map(r => `
                    <div class="flex items-center gap-3 p-3">
                        <div class="w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center font-bold text-xs flex-shrink-0">
                            ${r.name.charAt(0).toUpperCase()}
                        </div>
                        <span class="text-sm font-semibold text-slate-700 flex-1 truncate">${r.name}</span>
                        <span class="text-xs font-bold text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-lg">${r.count} บิล</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div>
            <h3 class="text-sm font-bold text-brand-blue mb-3 flex items-center gap-2 px-1">
                <span class="material-icons-round text-brand-orange text-[18px]">lightbulb</span> วิเคราะห์พฤติกรรมการเบิก (Insights)
            </h3>
            ${topItems.length === 0 ? renderEmptyState('ไม่มีข้อมูลในช่วงเวลานี้', 'analytics') : `
                <div class="space-y-4">
                    ${topItems.map((item, idx) => {
                        const insight = getInsightDetails(item.name, item.qty, item.count, item.capacity);
                        return `
                            <div class="bg-white p-4 rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex-1 pr-3">
                                        <span class="text-[10px] font-bold text-slate-400">อันดับ ${idx + 1}</span>
                                        <h4 class="font-bold text-brand-blue text-[15px] leading-tight mt-0.5">${item.name}</h4>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-bold text-brand-orange text-lg leading-none">${item.qty.toLocaleString()} <span class="text-[10px] font-medium text-brand-orange/80">ชิ้น</span></p>
                                        <p class="text-[10px] text-slate-400 font-medium mt-1">${item.count} บิลสั่งเบิก</p>
                                    </div>
                                </div>
                                <div class="${insight.bg} ${insight.border} border p-3 rounded-xl flex gap-3 items-start mt-2">
                                    <span class="material-icons-round ${insight.color} text-[18px] mt-0.5">${insight.icon}</span>
                                    <div>
                                        <p class="text-xs font-bold ${insight.color} mb-0.5">${insight.title}</p>
                                        <p class="text-[10px] text-slate-600 leading-snug">${insight.desc}</p>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>

        <div>
            <h3 class="text-sm font-bold text-brand-blue mb-3 flex items-center gap-2 px-1">
                <span class="material-icons-round text-brand-orange text-[18px]">history</span> รายการบิลเบิกย้ายล่าสุด
            </h3>
            ${dispatchedItems.length === 0 ? renderEmptyState('ไม่มีบิลจัดส่ง', 'receipt') : `
                <div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden">
                    ${dispatchedItems.slice(0, 20).map(bill => `
                        <div class="p-4 border-b border-slate-50 last:border-0">
                            <div class="flex justify-between items-center mb-1.5 flex-wrap gap-1">
                                <span class="text-[10px] font-mono font-semibold text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded">${bill.id}</span>
                                <div class="text-[9px] text-slate-400 flex items-center gap-2">
                                    <span class="inline-flex items-center gap-0.5"><span class="material-icons-round text-[11px]">event_note</span>เบิก: ${bill.timestamp.split(' / ')[0]}</span>
                                    ${bill.dispatchTimestamp ? `<span class="inline-flex items-center gap-0.5"><span class="material-icons-round text-[11px] text-emerald-500">local_shipping</span>จัด: ${bill.dispatchTimestamp.split(' / ')[0]}</span>` : ''}
                                </div>
                            </div>
                            <p class="text-sm font-bold text-slate-800 mb-1 truncate">${bill.itemName}</p>
                            <div class="flex justify-between items-end">
                                <div class="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                                    <span class="material-icons-round text-[12px] text-slate-400">inventory_2</span>
                                    ความจุ: <span class="font-medium text-slate-700">${bill.storageCapacity || 0} ชิ้น</span>
                                </div>
                                <span class="text-xs font-bold text-brand-orange bg-brand-orange/10 px-2 py-1 rounded-lg">ส่ง ${bill.receiveQty} ชิ้น</span>
                            </div>
                        </div>
                    `).join('')}
                    ${dispatchedItems.length > 20 ? `<div class="p-3 text-center text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">แสดงข้อมูล 20 รายการล่าสุด</div>` : ''}
                </div>
            `}
        </div>
    `;
}
```

- [ ] **Step 2: Verify Tab 1 renders**

Open `?demo=1` → Analytics → tab สรุป. Check:
- 4 KPI cards show (ยอดจัดส่ง, บิล, Fulfillment Rate, หมด/ยกเลิก)
- Fulfillment Rate card is green if ≥90%, amber if 70-89%, red if <70%
- If any `requestedBy` data exists, requester section appears
- Top insights list shows (or empty state if no data)
- Recent bills list shows at bottom

- [ ] **Step 3: Commit**

```
git add TRDAKRA/index.html
git commit -m "feat(analytics): add renderDashboardSummary with fulfillment rate and requester stats"
```

---

## Task 4: Tab 2 — Calendar Trend (`renderDashboardTrend`, `renderCalendarMonth`, `renderCalendarWeek`, `renderDayDetail`)

**Files:**
- Modify: `TRDAKRA/index.html` — add 4 functions after `renderDashboardSummary`

- [ ] **Step 1: Add `renderDashboardTrend` (navigation header + dispatch to month/week/detail)**

```javascript
function renderDashboardTrend() {
    const filter = state.dashboardFilter;
    const actMap = buildActivityMap();
    const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

    let navLabel;
    if (filter === 'month') {
        navLabel = `${TH_MONTHS[state.calendarMonth]} ${state.calendarYear + 543}`;
    } else {
        const ws = getDisplayedWeekStart();
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);
        const fmt = d => `${d.getDate()} ${TH_MONTHS[d.getMonth()]}`;
        navLabel = `${fmt(ws)} – ${fmt(we)}`;
    }

    return `
        <div class="flex items-center justify-between bg-white p-3 rounded-2xl shadow-[0_2px_8px_rgb(0,0,0,0.04)] border border-slate-100">
            <button onclick="setCalendarNav(-1)" class="p-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors">
                <span class="material-icons-round text-brand-blue text-[20px]">chevron_left</span>
            </button>
            <span class="text-sm font-bold text-brand-blue">${navLabel}</span>
            <button onclick="setCalendarNav(1)" class="p-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors">
                <span class="material-icons-round text-brand-blue text-[20px]">chevron_right</span>
            </button>
        </div>

        ${filter === 'month' ? renderCalendarMonth(actMap) : renderCalendarWeek(actMap)}

        ${state.calendarSelectedDate ? renderDayDetail(state.calendarSelectedDate) : ''}
    `;
}
```

- [ ] **Step 2: Add `renderCalendarMonth`**

```javascript
function renderCalendarMonth(actMap) {
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const startOffset = startDow === 0 ? 6 : startDow - 1; // Mon-first offset

    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const DAY_HEADERS = ['จ','อ','พ','พฤ','ศ','ส','อา'];

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    return `
        <div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 p-3">
            <div class="grid grid-cols-7 mb-1">
                ${DAY_HEADERS.map(h => `<div class="text-center text-[10px] font-bold text-slate-400 py-1">${h}</div>`).join('')}
            </div>
            <div class="grid grid-cols-7 gap-1">
                ${cells.map(d => {
                    if (!d) return `<div></div>`;
                    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                    const act = actMap[key] || { billCount: 0, hasStockout: false };
                    const isToday = key === todayKey;
                    const isSelected = key === state.calendarSelectedDate;

                    let bg = 'bg-slate-50 text-slate-400';
                    if (act.billCount >= 6) bg = 'bg-brand-blue text-white';
                    else if (act.billCount >= 3) bg = 'bg-blue-300 text-blue-900';
                    else if (act.billCount >= 1) bg = 'bg-blue-100 text-blue-700';

                    return `
                        <div onclick="selectCalendarDate('${key}')"
                             class="relative rounded-xl p-1.5 text-center cursor-pointer transition-all active:scale-95
                                    ${bg}
                                    ${isToday ? 'ring-2 ring-brand-orange ring-offset-1' : ''}
                                    ${isSelected ? 'ring-2 ring-brand-orange shadow-md' : ''}">
                            <span class="text-[12px] font-bold leading-none">${d.getDate()}</span>
                            ${act.billCount > 0 ? `<div class="text-[8px] font-semibold opacity-80 mt-0.5">${act.billCount}บ</div>` : ''}
                            ${act.hasStockout ? `<div class="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full"></div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}
```

- [ ] **Step 3: Add `renderCalendarWeek`**

```javascript
function renderCalendarWeek(actMap) {
    const ws = getDisplayedWeekStart();
    const DAYS = ['จ','อ','พ','พฤ','ศ','ส','อา'];
    const days = Array.from({length: 7}, (_, i) => {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        return d;
    });

    const maxBills = Math.max(1, ...days.map(d => {
        const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        return (actMap[key] || {}).billCount || 0;
    }));

    const today = new Date();

    return `
        <div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 p-4">
            <div class="grid grid-cols-7 gap-1 items-end" style="height:120px">
                ${days.map((d, i) => {
                    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                    const act = actMap[key] || { billCount: 0, hasStockout: false };
                    const barH = Math.max(4, Math.round((act.billCount / maxBills) * 80));
                    const isToday = d.toDateString() === today.toDateString();
                    const isSelected = key === state.calendarSelectedDate;
                    const barColor = isSelected ? 'bg-brand-orange' : isToday ? 'bg-brand-blue' : 'bg-blue-300';

                    return `
                        <div onclick="selectCalendarDate('${key}')"
                             class="flex flex-col items-center justify-end h-full cursor-pointer gap-0.5">
                            <span class="text-[9px] font-bold text-slate-500">${act.billCount > 0 ? act.billCount : ''}</span>
                            <div class="w-full rounded-t-lg ${barColor} ${isSelected ? 'ring-1 ring-brand-orange ring-offset-1' : ''} transition-all"
                                 style="height:${barH}px"></div>
                            <span class="text-[9px] font-semibold ${isToday ? 'text-brand-blue' : 'text-slate-400'}">${DAYS[i]}</span>
                            <span class="text-[10px] font-bold ${isToday ? 'text-brand-blue' : 'text-slate-600'}">${d.getDate()}</span>
                            ${act.hasStockout ? `<div class="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>` : `<div class="w-1.5 h-1.5"></div>`}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}
```

- [ ] **Step 4: Add `renderDayDetail`**

```javascript
function renderDayDetail(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const TH_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
    const displayDate = `วัน${TH_DAYS[dateObj.getDay()]}ที่ ${day} ${TH_MONTHS[month-1]} ${year + 543}`;

    const dayItems = state.items.filter(item => {
        const d = item.rawDate ? new Date(item.rawDate) : null;
        if (!d || isNaN(d.getTime())) return false;
        const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        return k === dateStr;
    });

    const dispatched = dayItems.filter(i => i.status === 'จัดส่งแล้ว' || i.status === 'รับสินค้าแล้ว');
    const totalQty = dispatched.reduce((s, i) => s + (parseInt(i.receiveQty) || 0), 0);

    return `
        <div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden animate-fade-in">
            <div class="bg-brand-blue/5 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <div>
                    <p class="text-[10px] font-semibold text-slate-400">รายละเอียดวัน</p>
                    <p class="text-sm font-bold text-brand-blue">${displayDate}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold text-brand-orange">${dispatched.length} บิล</p>
                    <p class="text-[10px] text-slate-400">${totalQty} ชิ้นรวม</p>
                </div>
            </div>
            ${dayItems.length === 0
                ? `<div class="p-6 text-center text-sm text-slate-400">ไม่มีการเบิกในวันนี้</div>`
                : `<div class="divide-y divide-slate-50">
                    ${dayItems.map(item => {
                        const isDispatched = item.status === 'จัดส่งแล้ว' || item.status === 'รับสินค้าแล้ว';
                        const isStockout = item.status === 'สินค้าหมด';
                        const chipCls = isDispatched ? 'bg-emerald-100 text-emerald-700'
                                      : isStockout   ? 'bg-rose-100 text-rose-700'
                                      :                'bg-slate-100 text-slate-600';
                        return `
                            <div class="p-3 flex items-center gap-3">
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-semibold text-slate-800 truncate">${item.itemName}</p>
                                    ${item.requestedBy ? `<p class="text-[10px] text-slate-400">โดย: ${item.requestedBy}</p>` : ''}
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    ${item.receiveQty ? `<span class="text-xs font-bold text-brand-orange">${item.receiveQty} ชิ้น</span>` : ''}
                                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${chipCls}">${item.status}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>`
            }
        </div>
    `;
}
```

- [ ] **Step 5: Verify Tab 2 (Trend + Calendar)**

Open `?demo=1` → Analytics → Trend tab. Check:
- Month view: calendar grid 7-column Mon–Sun, today has orange ring
- Days with bills show blue intensity + bill count badge
- Days with stock-out show small red dot (top-right corner)
- `<` `>` arrows navigate months, label updates
- Tapping a day shows Day Detail panel below calendar with bill list
- Tapping same day again collapses panel
- Switch to สัปดาห์นี้: shows 7-bar strip with CSS bars, day names, dates
- `<` `>` navigates weeks

- [ ] **Step 6: Commit**

```
git add TRDAKRA/index.html
git commit -m "feat(analytics): add Trend tab with month/week calendar and day detail panel"
```

---

## Task 5: Tab 3 — `renderDashboardProblems`

**Files:**
- Modify: `TRDAKRA/index.html` — add function after `renderDayDetail`

- [ ] **Step 1: Add `renderDashboardProblems`**

```javascript
function renderDashboardProblems(allItems, startDate) {
    const stockoutMap = {};
    allItems.forEach(item => {
        if (item.status !== 'สินค้าหมด') return;
        if (!stockoutMap[item.itemName]) stockoutMap[item.itemName] = { count: 0, lastDate: null };
        stockoutMap[item.itemName].count++;
        const d = item.rawDate ? new Date(item.rawDate) : null;
        if (d && (!stockoutMap[item.itemName].lastDate || d > stockoutMap[item.itemName].lastDate)) {
            stockoutMap[item.itemName].lastDate = d;
        }
    });

    const stockoutRanked = Object.entries(stockoutMap)
        .map(([name, s]) => ({ name, count: s.count, lastDate: s.lastDate }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const cancelledItems = allItems.filter(i => {
        const d = i.rawDate ? new Date(i.rawDate) : new Date(0);
        return i.status === 'ยกเลิก' && d >= startDate;
    }).slice(0, 10);

    const getDaysAgo = d => {
        if (!d) return '-';
        const days = Math.floor((Date.now() - d.getTime()) / 86400000);
        return days === 0 ? 'วันนี้' : `${days} วันที่แล้ว`;
    };

    return `
        <div>
            <h3 class="text-sm font-bold text-brand-blue mb-3 flex items-center gap-2 px-1">
                <span class="material-icons-round text-rose-500 text-[18px]">trending_down</span> สินค้าหมดบ่อย (ทั้งหมด)
            </h3>
            ${stockoutRanked.length === 0
                ? renderEmptyState('ยังไม่มีบันทึกสินค้าหมด', 'check_circle')
                : `<div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 divide-y divide-slate-50">
                    ${stockoutRanked.map((item, idx) => `
                        <div class="p-3 flex items-center gap-3">
                            <div class="w-7 h-7 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs flex-shrink-0">${idx + 1}</div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold text-slate-800 truncate">${item.name}</p>
                                <p class="text-[10px] text-slate-400">ล่าสุด: ${getDaysAgo(item.lastDate)}</p>
                            </div>
                            <span class="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">${item.count} ครั้ง</span>
                        </div>
                    `).join('')}
                </div>`
            }
        </div>

        <div>
            <h3 class="text-sm font-bold text-brand-blue mb-3 flex items-center gap-2 px-1">
                <span class="material-icons-round text-slate-400 text-[18px]">cancel</span> รายการยกเลิก (ช่วงนี้)
            </h3>
            ${cancelledItems.length === 0
                ? renderEmptyState('ไม่มีรายการยกเลิก', 'check_circle')
                : `<div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 divide-y divide-slate-50">
                    ${cancelledItems.map(item => `
                        <div class="p-3">
                            <div class="flex justify-between items-start mb-1">
                                <p class="text-sm font-semibold text-slate-800 flex-1 pr-2 truncate">${item.itemName}</p>
                                <span class="text-[9px] text-slate-400 flex-shrink-0">${item.timestamp ? item.timestamp.split(' / ')[0] : ''}</span>
                            </div>
                            ${item.requestedBy ? `<p class="text-[10px] text-slate-400">โดย: ${item.requestedBy}</p>` : ''}
                            ${item.w2Note ? `<p class="text-[10px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1 mt-1">${item.w2Note}</p>` : ''}
                        </div>
                    `).join('')}
                </div>`
            }
        </div>
    `;
}
```

- [ ] **Step 2: Verify Tab 3**

Open `?demo=1` → Analytics → หมด/ยกเลิก tab. Check:
- Stock-out ranked list shows items by frequency (all-time, not date-filtered)
- Each row shows rank badge (rose circle), item name, "ล่าสุด: X วันที่แล้ว", count badge
- Cancelled section shows items filtered by week/month range
- w2Note (reason) appears as grey pill if present
- Both sections show empty states when no data

- [ ] **Step 3: Commit**

```
git add TRDAKRA/index.html
git commit -m "feat(analytics): add Problems tab with stock-out ranking and cancelled orders"
```

---

## Task 6: Tab 4 — `renderDashboardSurvey`

**Files:**
- Modify: `TRDAKRA/index.html` — add function after `renderDashboardProblems`

- [ ] **Step 1: Add `renderDashboardSurvey`**

```javascript
function renderDashboardSurvey() {
    if (state.surveyLogsLoading) {
        return `
            <div class="flex flex-col items-center justify-center py-16 gap-3">
                <div class="animate-spin rounded-full h-10 w-10 border-[3px] border-brand-blue/20 border-t-brand-orange"></div>
                <p class="text-sm text-slate-400 font-medium">กำลังโหลดประวัติสำรวจ...</p>
            </div>
        `;
    }

    if (!state.surveyLogs || state.surveyLogs.length === 0) {
        return renderEmptyState(
            state.surveyLogs === null ? 'ไม่สามารถโหลดข้อมูลได้' : 'ยังไม่มีประวัติการสำรวจ',
            state.surveyLogs === null ? 'error_outline' : 'fact_check'
        ) + `<div class="text-center -mt-2"><button onclick="fetchSurveyLogs()" class="text-sm font-semibold text-brand-blue underline">ลองโหลดใหม่</button></div>`;
    }

    const logs = state.surveyLogs;
    const now = new Date();
    const yearBE = String(now.getFullYear() + 543);
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');

    const thisMonthLogs = logs.filter(l => {
        const s = String(l.surveyDate || '');
        return s.includes('-' + monthStr + '-' + yearBE) || s.includes('/' + monthStr + '/');
    });

    const sessionKeys = new Set(thisMonthLogs.map(l => String(l.surveyDate).split(' / ')[0] + '_' + l.floor + '_' + (l.surveyedBy || '')));
    const thisMonthCount = sessionKeys.size;
    const needOrderCount = thisMonthLogs.filter(l => (parseInt(l.needToOrder) || 0) > 0).length;

    const sessions = {};
    logs.slice(0, 200).forEach(l => {
        const dateKey = String(l.surveyDate).split(' / ')[0];
        const sk = `${dateKey}__${l.floor}__${l.surveyedBy || ''}`;
        if (!sessions[sk]) sessions[sk] = { date: dateKey, floor: l.floor, surveyedBy: l.surveyedBy || '', items: [] };
        sessions[sk].items.push(l);
    });

    const sessionList = Object.values(sessions).slice(0, 30);

    return `
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-emerald-500 p-4 rounded-[1.5rem] text-white relative overflow-hidden shadow-lg shadow-emerald-500/20">
                <span class="material-icons-round absolute -right-2 -bottom-2 text-[60px] opacity-10">fact_check</span>
                <p class="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">สำรวจเดือนนี้</p>
                <p class="text-2xl font-bold">${thisMonthCount} <span class="text-xs font-medium text-white/80">ครั้ง</span></p>
            </div>
            <div class="bg-amber-500 p-4 rounded-[1.5rem] text-white relative overflow-hidden shadow-lg shadow-amber-500/20">
                <span class="material-icons-round absolute -right-2 -bottom-2 text-[60px] opacity-10">add_shopping_cart</span>
                <p class="text-[11px] font-semibold text-white/80 uppercase tracking-wider mb-1">รายการต้องเติม</p>
                <p class="text-2xl font-bold">${needOrderCount} <span class="text-xs font-medium text-white/80">รายการ</span></p>
            </div>
        </div>

        <div>
            <h3 class="text-sm font-bold text-brand-blue mb-3 flex items-center gap-2 px-1">
                <span class="material-icons-round text-brand-orange text-[18px]">history</span> ประวัติการสำรวจ
            </h3>
            <div class="space-y-3">
                ${sessionList.map(session => `
                    <div class="bg-white rounded-[1.5rem] shadow-[0_4px_16px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden">
                        <div class="bg-brand-blue/5 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                            <span class="material-icons-round text-brand-blue text-[16px]">assignment</span>
                            <div class="flex-1">
                                <span class="text-xs font-bold text-brand-blue">${/^\d+$/.test(session.floor) ? 'ชั้น ' + session.floor : session.floor || '-'}</span>
                                <span class="text-[10px] text-slate-400 ml-2">${session.date}</span>
                            </div>
                            <span class="text-[10px] text-slate-400">โดย: ${session.surveyedBy || '-'}</span>
                        </div>
                        <div class="divide-y divide-slate-50">
                            ${session.items.map(item => {
                                const cur = parseInt(item.currentStock) || 0;
                                const par = parseInt(item.parLevel) || 0;
                                const need = parseInt(item.needToOrder) || 0;
                                const s = getStockStatus(cur, par);
                                return `
                                    <div class="px-4 py-2 flex items-center gap-2">
                                        <p class="text-sm text-slate-700 flex-1 truncate">${item.productName}</p>
                                        <span class="text-[10px] text-slate-400 flex-shrink-0">${cur}/${par}</span>
                                        ${need > 0 ? `<span class="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded flex-shrink-0">+${need}</span>` : ''}
                                        <span class="text-[10px] font-semibold ${s.color} ${s.bg} px-1.5 py-0.5 rounded-lg border ${s.border} flex-shrink-0">${s.label}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="text-center pb-2">
            <button onclick="fetchSurveyLogs()" class="text-xs text-slate-400 underline">รีเฟรชข้อมูล</button>
        </div>
    `;
}
```

- [ ] **Step 2: Verify Tab 4 (Survey)**

Open `?demo=1` → Analytics → Survey tab. Check:
- Spinner shows briefly while fetching (will fail in local demo — `state.surveyLogs` becomes `[]`)
- If `[]`: shows "ยังไม่มีประวัติ" empty state + ลองโหลดใหม่ button
- In production (real GAS endpoint): 2 summary cards (สำรวจเดือนนี้, ต้องเติม), then grouped session cards
- Each session card shows floor header, date, surveyedBy, then product rows with cur/par, +need badge, status chip

- [ ] **Step 3: Commit**

```
git add TRDAKRA/index.html
git commit -m "feat(analytics): add Survey tab with lazy-fetch, session grouping, and stock status chips"
```

---

## Task 7: Version Bump + Final Verify

**Files:**
- Modify: `TRDAKRA/index.html` line ~77 (`CURRENT_VERSION`)
- Modify: `TRDAKRA/version.json`

- [ ] **Step 1: Bump `CURRENT_VERSION` in `index.html`**

Find:
```javascript
const CURRENT_VERSION = "20260602.01";
```
Change to:
```javascript
const CURRENT_VERSION = "20260602.02";
```

- [ ] **Step 2: Update `version.json`**

Current content:
```json
{"version": "20260602.01"}
```
New content:
```json
{"version": "20260602.02"}
```

- [ ] **Step 3: Full smoke test in browser**

Open `TRDAKRA/index.html?demo=1`. Check all 4 tabs:
- **สรุป**: 4 KPI cards + insights + recent bills render without crash
- **Trend (Month)**: Calendar grid shows, `<>` nav works, tap day shows detail panel
- **Trend (Week)**: Switch to สัปดาห์นี้ — 7 bar columns show, `<>` nav works
- **หมด/ยกเลิก**: Stock-out ranking (empty if no data) + cancelled section render
- **Survey**: Spinner then empty state (demo mode — no real GAS call)
- Toggle week↔month resets calendar to current period ✓
- Back button returns to Home ✓
- No JS errors in console ✓

- [ ] **Step 4: Commit**

```
git add TRDAKRA/index.html TRDAKRA/version.json
git commit -m "chore(version): bump TRDAKRA to 20260602.02 for analytics tab redesign"
```

---

## Self-Review Checklist

- [x] Tab bar renders with 4 tabs — Task 2 ✓
- [x] Tab switching sets `state.dashboardTab` and triggers render — Task 1 (`setDashboardTab`) ✓
- [x] สรุป: 4 KPI cards including Fulfillment Rate and Problem Count — Task 3 ✓
- [x] สรุป: Top requester section (hidden when no requestedBy data) — Task 3 ✓
- [x] สรุป: Existing insights + recent bills preserved — Task 3 ✓
- [x] Trend: Month calendar with intensity colors + red stockout dot — Task 4 ✓
- [x] Trend: Week bar chart with CSS height bars — Task 4 ✓
- [x] Trend: `<>` navigation for month (calendarMonth/Year) and week (calendarWeekOffset) — Task 1+4 ✓
- [x] Trend: Day detail panel on tap, deselect on re-tap — Task 1 (`selectCalendarDate`) + Task 4 ✓
- [x] Trend: Days outside month are non-tappable — implemented via month grid only rendering that month's days (nulls render as empty divs with no onclick) ✓
- [x] Problems: Stock-out uses ALL items (no date filter) — Task 5 ✓
- [x] Problems: Cancelled uses startDate filter (week/month) — Task 5 ✓
- [x] Survey: Lazy fetch triggered once on first tab visit — Task 1 (`setDashboardTab`) + Task 6 ✓
- [x] Survey: Spinner while loading, retry button on error/empty — Task 6 ✓
- [x] Survey: Sessions grouped by date+floor+surveyor — Task 6 ✓
- [x] Survey: Status chips reuse `getStockStatus()` — Task 6 ✓
- [x] week/month toggle resets calendarWeekOffset + calendarMonth/Year — Task 1 (`setDashboardFilter`) ✓
- [x] Version bumped in both files — Task 7 ✓
- [x] `calendarSelectedDate` uses CE YYYY-MM-DD key matching `item.rawDate` derived dates — Task 4 (`renderDayDetail`, `buildActivityMap`) ✓
