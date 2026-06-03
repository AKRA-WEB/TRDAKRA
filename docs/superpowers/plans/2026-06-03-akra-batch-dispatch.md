# AKRA Batch Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-item W2 (AKRA) dispatch UI with a batch checklist — tap row to toggle ✅/❌/⬜, confirm all at once; make `สินค้าหมด` non-terminal so items stay in active list; send LINE summary once at 18:00 instead of per-action.

**Architecture:** All changes are in `TRDAKRA/index.html` (frontend) and `TRDAKRA/Code.gs.txt` (GAS backend). The batch confirm flow reuses existing `syncDataToSheet()` — updates `state.items` in-place then posts the full array. No new API action needed. Backend adds `sendDailyDispatchSummary()` triggered at 18:00 Bangkok time via GAS time-based trigger.

**Tech Stack:** Vanilla JS ES6+, Tailwind CSS CDN, Google Apps Script, LINE Messaging API.

**Testing:** Open `http://localhost:8787/?demo=1` (run `python -m http.server 8787` in `TRDAKRA/`). DevTools console must be error-free after each task.

---

## File Map

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Add `w2BatchEdits` state; remove `selectedReceiveId`; add 4 functions; rewrite W2 tasks section; remove 3 old functions |
| `TRDAKRA/Code.gs.txt` | Add `sendDailyDispatchSummary()`; remove `notifyLine` POST handler |
| `TRDAKRA/version.json` | Bump to `"20260602.04"` |

---

## Task 1: State — Add `w2BatchEdits`, remove `selectedReceiveId`

**Files:**
- Modify: `TRDAKRA/index.html` ~lines 187–220 (state object) and ~lines 572–594 (setView/setW2Tab)

- [ ] **Step 1: Replace state block**

Find this in the state object (lines ~190–193):
```javascript
            w2Tab: 'tasks',
            dashboardFilter: 'week',
            selectedReceiveId: null,
            items: [],
```
Replace with:
```javascript
            w2Tab: 'tasks',
            w2BatchEdits: {},
            dashboardFilter: 'week',
            items: [],
```

- [ ] **Step 2: Update `setView` reset block**

Find:
```javascript
            state.view = viewName;
            state.selectedReceiveId = null;
            if (viewName === 'w1') {
```
Replace with:
```javascript
            state.view = viewName;
            state.w2BatchEdits = {};
            if (viewName === 'w1') {
```

- [ ] **Step 3: Update `setW1Tab` and `setW2Tab`**

Find:
```javascript
        function setW1Tab(tabName) { state.w1Tab = tabName; state.selectedReceiveId = null; render(); }
        function setW2Tab(tabName) { state.w2Tab = tabName; state.selectedReceiveId = null; render(); }
```
Replace with:
```javascript
        function setW1Tab(tabName) { state.w1Tab = tabName; render(); }
        function setW2Tab(tabName) { state.w2Tab = tabName; state.w2BatchEdits = {}; render(); }
```

- [ ] **Step 4: Verify**

Open `?demo=1` — DevTools console: no errors. Home loads fine.

---

## Task 2: Filter — `สินค้าหมด` stays in active list

**Files:**
- Modify: `TRDAKRA/index.html` — `renderW2()` function ~lines 1883–1888 and `renderHistoryList` ~line 1014

- [ ] **Step 1: Fix `hasTasks` and active filter in `renderW2()`**

Find:
```javascript
            const hasTasks = state.items.some(i => ['สั่งเบิก', 'กำลังจัดสินค้า'].includes(i.status));
            let content = '';
            if (state.w2Tab === 'tasks') {
                const activeTasks = state.items.filter(i => ['สั่งเบิก', 'กำลังจัดสินค้า'].includes(i.status));
```
Replace with:
```javascript
            const ACTIVE_STATUSES = ['สั่งเบิก', 'กำลังจัดสินค้า', 'สินค้าหมด'];
            const hasTasks = state.items.some(i => ACTIVE_STATUSES.includes(i.status));
            let content = '';
            if (state.w2Tab === 'tasks') {
                const activeTasks = state.items.filter(i => ACTIVE_STATUSES.includes(i.status));
```

- [ ] **Step 2: Fix `renderHistoryList` — remove `สินค้าหมด` from history**

Find:
```javascript
            const historyItems = state.items.filter(i => ['จัดส่งแล้ว', 'สินค้าหมด', 'ยกเลิกรายการ'].includes(i.status));
```
Replace with:
```javascript
            const historyItems = state.items.filter(i => ['จัดส่งแล้ว', 'ยกเลิกรายการ'].includes(i.status));
```

- [ ] **Step 3: Verify**

`?demo=1` → console no errors. (W2 tasks section will crash until Task 5 is done — that's expected.)

---

## Task 3: Add helper `getEffectiveState(item)`

**Files:**
- Modify: `TRDAKRA/index.html` — insert after `setW2Tab` function (~line 594)

- [ ] **Step 1: Add function after `setW2Tab`**

Find:
```javascript
        function setW2Tab(tabName) { state.w2Tab = tabName; state.w2BatchEdits = {}; render(); }
```
Insert immediately after:
```javascript

        function getEffectiveState(item) {
            const edit = state.w2BatchEdits[item.id];
            if (edit === 'dispatch') return 'dispatch';
            if (edit === 'outstock') return 'outstock';
            return item.status === 'สินค้าหมด' ? 'outstock' : 'pending';
        }
```

---

## Task 4: Add `toggleW2BatchItem(id)`

**Files:**
- Modify: `TRDAKRA/index.html` — insert after `getEffectiveState`

- [ ] **Step 1: Add function after `getEffectiveState`**

Find the line you just added:
```javascript
        function getEffectiveState(item) {
```
Insert after its closing `}`:
```javascript

        function toggleW2BatchItem(id) {
            const item = state.items.find(i => i.id === id);
            if (!item) return;
            const cur = getEffectiveState(item);
            if (cur === 'pending')       state.w2BatchEdits[id] = 'dispatch';
            else if (cur === 'dispatch') state.w2BatchEdits[id] = 'outstock';
            else                         delete state.w2BatchEdits[id];
            render();
        }
```

- [ ] **Step 2: Verify in DevTools**

Open `?demo=1`. In console type `typeof toggleW2BatchItem` — should return `"function"`.

---

## Task 5: Add `renderW2BatchRow(item)`

**Files:**
- Modify: `TRDAKRA/index.html` — insert before `renderW2()` function (~line 1883)

- [ ] **Step 1: Find insert point**

Find:
```javascript
        function renderW2() {
```

Insert immediately before it:
```javascript
        function renderW2BatchRow(item) {
            const st    = getEffectiveState(item);
            const unit  = getProductUnitClient(item.itemName);
            const enc   = encodeURIComponent(item.id);

            let boxClass, boxContent, rowBg, nameClass, subExtra = '';
            if (st === 'dispatch') {
                boxClass   = 'bg-emerald-500 text-white';
                boxContent = '✓';
                rowBg      = 'bg-emerald-50 border-emerald-100';
                nameClass  = 'font-bold text-emerald-800';
            } else if (st === 'outstock') {
                boxClass   = 'bg-rose-100 text-rose-500';
                boxContent = '✕';
                rowBg      = 'bg-rose-50 border-rose-100';
                nameClass  = 'font-semibold text-rose-400 line-through';
                if (item.dispatchTimestamp && item.dispatchTimestamp !== '-') {
                    subExtra = ` <span class="text-rose-300">· หมด ${item.dispatchTimestamp}</span>`;
                }
            } else {
                boxClass   = 'border-2 border-slate-200 bg-white';
                boxContent = '';
                rowBg      = 'bg-white border-slate-100';
                nameClass  = 'font-semibold text-brand-blue';
            }

            return `
                <div onclick="toggleW2BatchItem(decodeURIComponent('${enc}'))"
                     class="flex items-center gap-3 p-3.5 rounded-2xl border shadow-sm cursor-pointer active:scale-[0.99] transition-all ${rowBg}">
                    <div class="w-8 h-8 flex-shrink-0 flex items-center justify-center text-sm font-bold rounded-lg ${boxClass}">${boxContent}</div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm leading-snug truncate ${nameClass}">${item.itemName}</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">
                            ${item.requestQty} ${unit}${item.requestedBy ? ` · ${item.requestedBy}` : ''}${subExtra}
                        </p>
                    </div>
                </div>`;
        }

```

---

## Task 6: Add `confirmBatchDispatch()`

**Files:**
- Modify: `TRDAKRA/index.html` — insert after `renderW2BatchRow`

- [ ] **Step 1: Add function after `renderW2BatchRow`**

Find the line you just inserted before:
```javascript
        function renderW2() {
```
Insert immediately before it (after `renderW2BatchRow`):
```javascript
        async function confirmBatchDispatch() {
            const toDispatch = Object.entries(state.w2BatchEdits).filter(([, v]) => v === 'dispatch');
            if (toDispatch.length === 0) { alert('เลือกสินค้าที่จะจัดส่งก่อน'); return; }

            const now = formatDateTime(new Date().toISOString());
            let dispatchNames = [];

            state.items = state.items.map(item => {
                const edit = state.w2BatchEdits[item.id];
                if (edit === 'dispatch') {
                    dispatchNames.push(item.itemName);
                    return { ...item, status: 'จัดส่งแล้ว', receiveQty: item.requestQty, receiveNote: 'ครบ', dispatchTimestamp: now };
                }
                if (edit === 'outstock') {
                    return { ...item, status: 'สินค้าหมด', dispatchTimestamp: now };
                }
                return item;
            });

            state.w2BatchEdits = {};
            render();
            await syncDataToSheet();
            sendAppLog('จัดส่งสินค้า Batch (AKRA)', `จัดส่ง ${toDispatch.length} รายการ`);
        }

```

---

## Task 7: Rewrite W2 tasks section in `renderW2()`

**Files:**
- Modify: `TRDAKRA/index.html` — replace the `if (state.w2Tab === 'tasks')` block inside `renderW2()`

- [ ] **Step 1: Replace old tasks block**

Find this entire block (inside `renderW2()`):
```javascript
            if (state.w2Tab === 'tasks') {
                const activeTasks = state.items.filter(i => ACTIVE_STATUSES.includes(i.status));
                if (activeTasks.length === 0) {
                    content = renderEmptyState('ไม่มีงานจัดสินค้า', 'inventory_2');
                } else {
                    content = `<div class="space-y-4 animate-fade-in">` + activeTasks.map(item => `
                        <div class="bg-white p-5 rounded-[1.5rem] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 border-l-[4px] border-l-brand-blue">
                            <div class="flex justify-between items-start mb-4">
                                <div class="pr-2">
                                    <h3 class="font-bold text-brand-blue text-[16px] leading-snug">${item.itemName}</h3>
                                    <div class="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 font-medium flex-wrap">
                                        <span class="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-semibold">ID: ${item.id}</span>
                                        <span class="inline-flex items-center gap-0.5 text-slate-500">
                                            <span class="material-icons-round text-[12px] text-slate-400">schedule</span>
                                            เบิก: ${item.timestamp}
                                        </span>
                                        ${item.requestedBy ? `
                                            <span class="inline-flex items-center gap-0.5 text-brand-blue bg-brand-blue/5 border border-brand-blue/10 px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold">
                                                <span class="material-icons-round text-[11px] text-brand-blue/70">account_circle</span>
                                                ${item.requestedBy}
                                            </span>
                                        ` : ''}
                                    </div>
                                </div>
                                <div class="flex-shrink-0">${getStatusBadge(item.status)}</div>
                            </div>
                            <div class="bg-brand-blue/5 rounded-2xl p-4 mb-4 flex justify-between items-center border border-brand-blue/10">
                                <div><p class="text-[10px] font-semibold text-brand-blue uppercase tracking-wider mb-0.5">ยอดสั่งเบิก / ความจุ</p><p class="font-bold text-brand-blue text-lg">${item.requestQty} <span class="text-xs font-medium text-brand-blue/70">${getProductUnitClient(item.itemName)}</span> / ${item.storageCapacity || 0} <span class="text-xs font-medium text-brand-blue/70">สต๊อคจัดเก็บได้</span></p></div>
                                <div class="text-right"><p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">หมดอายุเก่า</p><p class="text-xs text-slate-700 font-medium">${item.oldExpiry}</p></div>
                            </div>
                            <div class="mb-5">
                                <label class="block text-[11px] font-semibold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">โน้ตแจ้งหน้าร้าน <span class="text-[10px] font-normal normal-case text-slate-400">(ถ้ามี)</span></label>
                                <input type="text" id="w2-note-${item.id}" value="${item.w2Note || ''}" class="w-full p-3.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 transition-all text-sm text-slate-800 placeholder:text-slate-300" placeholder="เช่น ของได้แค่ 5 ชิ้น...">
                            </div>
                            ${state.selectedReceiveId !== item.id ? `
                                <div class="flex flex-col gap-2">
                                    <button onclick="openReceiveForm('${item.id}')" class="w-full py-4 bg-brand-orange text-white font-medium rounded-xl shadow-[0_4px_12px_rgba(227,82,5,0.2)] flex justify-center items-center gap-2 text-sm active:scale-[0.98] transition-all hover:bg-[#c94804]">จัดส่งสินค้า <span class="material-icons-round text-[18px]">local_shipping</span></button>
                                    <div class="flex gap-2 mt-1">
                                        <button onclick="if(confirm('ยืนยันแจ้งสินค้าหมด?')) updateItemStatus('${item.id}', 'สินค้าหมด')" class="flex-1 py-2 text-[11px] font-semibold tracking-wide text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">แจ้งของหมด</button>
                                        <button onclick="if(confirm('ต้องการยกเลิกรายการนี้?')) updateItemStatus('${item.id}', 'ยกเลิกรายการ')" class="flex-1 py-2 text-[11px] font-semibold tracking-wide text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิกรายการ</button>
                                    </div>
                                </div>
                            ` : `
                                <form onsubmit="handleDispatchSubmit(event, '${item.id}', ${item.requestQty})" class="mt-4 pt-4 border-t border-slate-100 animate-fade-in">
                                    <h4 class="font-bold text-brand-orange text-sm mb-4 flex items-center justify-center gap-2"><span class="material-icons-round text-[18px]">inventory</span> ฟอร์มยืนยันการจัดส่ง</h4>
                                    <div class="space-y-4">
                                        <div><label class="block text-[11px] font-semibold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">ยอดจัดส่งจริง (${getProductUnitClient(item.itemName)})</label><input type="number" id="disp-qty-${item.id}" required min="0" value="${item.requestQty}" class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-brand-orange focus:ring-1 focus:ring-brand-orange text-center text-lg font-bold text-brand-orange transition-all"></div>
                                        <div><label class="block text-[11px] font-semibold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">วันหมดอายุใหม่</label><input type="text" id="disp-exp-${item.id}" class="w-full p-3.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 text-sm transition-all" placeholder="วว-ดด-ปป (ถ้ามี)"></div>
                                        <div class="flex gap-3 pt-2">
                                            <button type="button" onclick="openReceiveForm(null)" class="flex-1 bg-white border border-slate-200 text-slate-500 py-3.5 rounded-xl font-medium text-sm transition-colors hover:bg-slate-50">ยกเลิก</button>
                                            <button type="submit" class="flex-[2] bg-brand-orange text-white py-3.5 rounded-xl font-medium text-sm shadow-[0_4px_12px_rgba(227,82,5,0.2)] active:scale-[0.98] transition-all hover:bg-[#c94804]">ยืนยันการส่ง</button>
                                        </div>
                                    </div>
                                </form>
                            `}
                        </div>
                    `).join('') + `</div>`;
                }
```

Replace with:
```javascript
            if (state.w2Tab === 'tasks') {
                const activeTasks = state.items.filter(i => ACTIVE_STATUSES.includes(i.status));
                if (activeTasks.length === 0) {
                    content = renderEmptyState('ไม่มีงานจัดสินค้า', 'inventory_2');
                } else {
                    const dispatchCount = activeTasks.filter(i => getEffectiveState(i) === 'dispatch').length;
                    const outstockCount = activeTasks.filter(i => getEffectiveState(i) === 'outstock').length;
                    const pendingCount  = activeTasks.filter(i => getEffectiveState(i) === 'pending').length;
                    content = `
                        <div class="animate-fade-in">
                            <div class="grid grid-cols-3 border border-slate-100 rounded-2xl overflow-hidden mb-4 bg-white shadow-sm">
                                <div class="p-3 text-center ${dispatchCount > 0 ? 'bg-emerald-50' : ''}">
                                    <p class="text-xl font-black ${dispatchCount > 0 ? 'text-emerald-600' : 'text-slate-300'}">${dispatchCount}</p>
                                    <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">เลือกจัด</p>
                                </div>
                                <div class="p-3 text-center border-x border-slate-100 ${outstockCount > 0 ? 'bg-rose-50' : ''}">
                                    <p class="text-xl font-black ${outstockCount > 0 ? 'text-rose-500' : 'text-slate-300'}">${outstockCount}</p>
                                    <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">สินค้าหมด</p>
                                </div>
                                <div class="p-3 text-center">
                                    <p class="text-xl font-black ${pendingCount > 0 ? 'text-brand-blue' : 'text-slate-300'}">${pendingCount}</p>
                                    <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">รอจัด</p>
                                </div>
                            </div>
                            <div class="space-y-2">${activeTasks.map(renderW2BatchRow).join('')}</div>
                            <div class="h-24"></div>
                        </div>
                        <div class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 p-4 shadow-2xl z-10">
                            <p class="text-[10px] text-center text-slate-400 mb-2">✓ จัดส่ง ${dispatchCount} · ✕ หมด ${outstockCount} · รอ ${pendingCount}</p>
                            <button onclick="confirmBatchDispatch()"
                                    class="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
                                           ${dispatchCount > 0 ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}">
                                🚚 ยืนยันจัดส่ง ${dispatchCount} รายการ
                            </button>
                        </div>`;
                }
```

- [ ] **Step 2: Smoke test**

Open `?demo=1` → W2 tab. Should see KPI bar + row list + confirm button. Tap rows to cycle ⬜→✅→❌→⬜.

---

## Task 8: Remove old functions

**Files:**
- Modify: `TRDAKRA/index.html` — remove 3 functions at ~lines 762–824

- [ ] **Step 1: Remove `openReceiveForm`**

Find and delete this entire line:
```javascript
        function openReceiveForm(id) { state.selectedReceiveId = id; render(); }
```

- [ ] **Step 2: Remove `handleDispatchSubmit`**

Find and delete this entire function:
```javascript
        async function handleDispatchSubmit(event, id, reqQty) {
            event.preventDefault();
            const dispatchQty = parseInt(document.getElementById(`disp-qty-${id}`).value);
            const newExpiryInput = document.getElementById(`disp-exp-${id}`).value;
            const noteInput = document.getElementById(`w2-note-${id}`);
            const w2NoteValue = noteInput ? noteInput.value : '';

            const newExpiry = newExpiryInput ? convertToCE(newExpiryInput) : 'ไม่ได้ระบุ';

            const targetItem = state.items.find(item => item.id === id);
            const dispatchedItemName = targetItem ? targetItem.itemName : "";
            const dispatchedReqQty = targetItem ? targetItem.requestQty : 0;
            const unit = getProductUnitClient(dispatchedItemName);

            let note = 'ครบ';
            if (dispatchQty < reqQty) note = `ขาด ${reqQty - dispatchQty} ${unit}`;
            if (dispatchQty > reqQty) note = `เกิน ${dispatchQty - reqQty} ${unit}`;

            state.items = state.items.map(item => {
                if (item.id === id) {
                    return { 
                        ...item, 
                        status: 'จัดส่งแล้ว', 
                        receiveQty: dispatchQty, 
                        receiveNote: note, 
                        newExpiry: newExpiry, 
                        w2Note: w2NoteValue || item.w2Note,
                        dispatchTimestamp: formatDateTime(new Date().toISOString())
                    };
                }
                return item;
            });

            state.selectedReceiveId = null;
            render();
            await syncDataToSheet();

            sendAppLog("จัดส่งสินค้า (AKRA)", `จัดส่ง: ${dispatchedItemName} ยอด ${dispatchQty} ${unit} (${note})`);
        }
```

- [ ] **Step 3: Remove `updateItemStatus`**

Find and delete this entire function:
```javascript
        async function updateItemStatus(id, newStatus) {
            const noteInput = document.getElementById(`w2-note-${id}`);
            const w2NoteValue = noteInput ? noteInput.value : '';
            let targetItemName = "";

            state.items = state.items.map(item => {
                if (item.id === id) {
                    targetItemName = item.itemName;
                    return { 
                        ...item, 
                        status: newStatus, 
                        w2Note: w2NoteValue || item.w2Note,
                        dispatchTimestamp: ['สินค้าหมด', 'ยกเลิกรายการ'].includes(newStatus) ? formatDateTime(new Date().toISOString()) : (item.dispatchTimestamp || '')
                    };
                }
                return item;
            });
            render();
            await syncDataToSheet();
            sendAppLog("เปลี่ยนสถานะ (AKRA)", `สถานะ: ${newStatus} (${targetItemName}) หมายเหตุ: ${w2NoteValue}`);
        }
```

- [ ] **Step 4: Verify no stale refs**

Run in DevTools console: no errors loading W2 page. Confirm batch submit works (DevTools network tab shows POST to script URL).

- [ ] **Step 5: Commit**

```bash
cd TRDAKRA
git add index.html
git commit -m "feat: add AKRA batch dispatch UI with 3-state row toggle

- Add w2BatchEdits state; add getEffectiveState, toggleW2BatchItem,
  renderW2BatchRow, confirmBatchDispatch
- Rewrite W2 tasks section: KPI bar + compact batch rows + sticky confirm button
- สินค้าหมด is now non-terminal — stays in active list, re-dispatchable
- Remove openReceiveForm, handleDispatchSubmit, updateItemStatus

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Backend — `sendDailyDispatchSummary` in Code.gs.txt

**Files:**
- Modify: `TRDAKRA/Code.gs.txt` — add new function, remove `notifyLine` handler

- [ ] **Step 1: Add `sendDailyDispatchSummary` function**

Find:
```javascript
// ===============================================
// 9. สรุปยอดเติมสินค้าประจำวันและส่งเข้า LINE
// ===============================================
function sendDailyStockSummary() {
```

Insert the new function immediately **before** that section:
```javascript
// ===============================================
// 9a. สรุปการจัดส่งสินค้าประจำวัน (Dispatch) และส่งเข้า LINE
//     ตั้ง Time-based trigger ให้รันทุกวัน 17:00–18:00 Bangkok
// ===============================================
function sendDailyDispatchSummary() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log("sendDailyDispatchSummary: no data rows");
      return;
    }

    var now   = new Date();
    var todayDD = Utilities.formatDate(now, "Asia/Bangkok", "dd");
    var todayMM = Utilities.formatDate(now, "Asia/Bangkok", "MM");

    // Columns: id(0), timestamp(1), itemName(2), requestQty(3), status(4),
    //          oldExpiry(5), newExpiry(6), receiveQty(7), receiveNote(8),
    //          w2Note(9), storageCapacity(10), dispatchTimestamp(11), requestedBy(12)
    var lastRow  = sheet.getLastRow();
    var numRows  = lastRow - 1;
    var numCols  = Math.min(sheet.getLastColumn(), 13);
    var data     = sheet.getRange(2, 1, numRows, numCols).getValues();

    var dispatched = [], outstock = [], pending = [];

    for (var i = 0; i < data.length; i++) {
      var ts       = data[i][1] ? data[i][1].toString() : '';
      var itemName = data[i][2] ? data[i][2].toString().trim() : '';
      var reqQty   = data[i][3] ? data[i][3].toString() : '';
      var status   = data[i][4] ? data[i][4].toString().trim() : '';

      if (!itemName) continue;

      // timestamp format: "DD-MM-YYYY / HH:MM" or "DD-MM-BBBB / HH:MM" (BBBB = Buddhist year)
      if (!ts.startsWith(todayDD + '-' + todayMM)) continue;

      if (status === 'จัดส่งแล้ว') {
        dispatched.push({ name: itemName, qty: reqQty });
      } else if (status === 'สินค้าหมด') {
        outstock.push({ name: itemName, qty: reqQty });
      } else if (['สั่งเบิก', 'กำลังจัดสินค้า'].indexOf(status) !== -1) {
        pending.push({ name: itemName, qty: reqQty });
      }
    }

    var dateStr = Utilities.formatDate(now, "Asia/Bangkok", "dd MMM yyyy");

    var msg  = "📦 สรุปการจัดสินค้าประจำวัน\n";
    msg     += "วันที่ " + dateStr + " · สรุป ณ 18:00 น.\n\n";
    msg     += "✅ จัดส่งสำเร็จ " + dispatched.length + " รายการ\n";
    msg     += "❌ สินค้าหมด "    + outstock.length   + " รายการ\n";
    msg     += "⏳ รอจัดส่ง "     + pending.length    + " รายการ";

    if (dispatched.length > 0) {
      msg += "\n\n─────────────────\n✅ เบิกสำเร็จวันนี้\n";
      var limit = Math.min(dispatched.length, 20);
      for (var d = 0; d < limit; d++) {
        msg += "• " + dispatched[d].name + " — " + dispatched[d].qty + "\n";
      }
      if (dispatched.length > 20) msg += "... และอีก " + (dispatched.length - 20) + " รายการ\n";
    }

    if (outstock.length > 0) {
      msg += "\n─────────────────\n❌ สินค้าหมด (รอสต๊อกเข้า)\n";
      for (var o = 0; o < outstock.length; o++) {
        msg += "• " + outstock[o].name + " — " + outstock[o].qty + "\n";
      }
    }

    msg += "\n🤖 ส่งอัตโนมัติทุกวัน 18:00 น.";

    var url     = "https://api.line.me/v2/bot/message/push";
    var payload = { "to": LINE_GROUP_ID, "messages": [{ "type": "text", "text": msg }] };
    var options = {
      "method": "post",
      "contentType": "application/json",
      "headers": { "Authorization": "Bearer " + LINE_CHANNEL_TOKEN },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    var resp = UrlFetchApp.fetch(url, options);
    Logger.log("sendDailyDispatchSummary LINE response: " + resp.getResponseCode());
  } catch (err) {
    Logger.log("sendDailyDispatchSummary error: " + err.toString());
  }
}

```

- [ ] **Step 2: Remove `notifyLine` POST handler from `doPost`**

Find and delete:
```javascript
    if (body.action === 'notifyLine') {
      sendLineDispatchNotification(body.itemName, body.reqDate || body.reqId, body.requestQty, body.dispatchQty, body.dispatchedBy, body.timeStr);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }

```

- [ ] **Step 3: Set up time-based trigger (manual step — do in GAS editor)**

In Google Apps Script editor after deploying:
1. Click **Triggers** (clock icon in left sidebar)
2. Add trigger → Function: `sendDailyDispatchSummary`
3. Event source: **Time-driven** → Day timer → **5pm to 6pm** (Bangkok = UTC+7, GAS uses server time — set to 10am–11am UTC to hit 17:00–18:00 Bangkok)
4. Save

- [ ] **Step 4: Commit**

```bash
git add Code.gs.txt
git commit -m "feat: add sendDailyDispatchSummary for 18:00 LINE summary

- Reads today's dispatch data from sheet, groups by status
- Formats: total KPI + dispatched list + out-of-stock list
- Remove notifyLine per-action handler from doPost

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Version bump

**Files:**
- Modify: `TRDAKRA/index.html` line ~77
- Modify: `TRDAKRA/version.json`

- [ ] **Step 1: Bump `CURRENT_VERSION`**

Find:
```javascript
        const CURRENT_VERSION = "20260602.03";
```
Replace with:
```javascript
        const CURRENT_VERSION = "20260602.04";
```

- [ ] **Step 2: Update `version.json`**

Replace entire file content with:
```json
{
  "version": "20260602.04"
}
```

- [ ] **Step 3: Final smoke test**

`?demo=1` → W2 tab:
- KPI bar shows counts ✓
- Tap row cycles ⬜→✅→❌→⬜ ✓
- สินค้าหมด item starts at ❌, tap → ✅ (re-dispatchable) ✓
- Confirm button enabled only when dispatchCount > 0 ✓
- สินค้าหมด items do NOT appear in History tab ✓
- Console: no errors ✓

- [ ] **Step 4: Commit and push**

```bash
git add index.html version.json
git commit -m "chore: bump version to 20260602.04 (batch dispatch release)"
git push origin main
```

---

## Self-Review

- [x] `w2BatchEdits` added to state, reset in `setView` + `setW2Tab` — Task 1 ✓
- [x] `selectedReceiveId` fully removed from state + all 3 reset points — Task 1 ✓
- [x] `ACTIVE_STATUSES` includes `สินค้าหมด` — Task 2 ✓
- [x] History filter removes `สินค้าหมด` — Task 2 ✓
- [x] `getEffectiveState` uses `item.status === 'สินค้าหมด'` fallback — Task 3 ✓
- [x] `toggleW2BatchItem` cycle: pending→dispatch→outstock→delete — Task 4 ✓
- [x] `renderW2BatchRow` uses `getEffectiveState`, encodes product id for onclick — Task 5 ✓
- [x] `confirmBatchDispatch` only submits `dispatch` edits, leaves `outstock` edits as status update — Task 6 ✓
- [x] New W2 tasks section renders KPI bar + rows + sticky confirm button — Task 7 ✓
- [x] All 3 old functions removed — Task 8 ✓
- [x] `sendDailyDispatchSummary` filters by today DD-MM prefix, groups 3 statuses — Task 9 ✓
- [x] `notifyLine` handler removed from `doPost` — Task 9 ✓
- [x] Version bumped in both files — Task 10 ✓
- [x] No references to `selectedReceiveId`, `openReceiveForm`, `handleDispatchSubmit`, `updateItemStatus` remain ✓
