# Location Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "จัดโลเคชั่นสินค้า" view where staff can assign floor/location to products without placing an order, with a badge showing how many products still lack a location.

**Architecture:** All changes are in `index.html` (single-file vanilla JS app). New state fields track edits locally; save calls the existing `pushProductDetails()` in a loop. No new API actions needed.

**Tech Stack:** Vanilla JS, Tailwind CSS (CDN), Google Apps Script backend (existing), `localStorage` cache.

---

## File Map

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Add state fields, `renderLocationManager()`, `handleLocationSave()`, `updateLocationEdit()`, update `setView()`, `render()`, `renderHome()` |

---

### Task 1: Add state fields + routing

**Files:**
- Modify: `TRDAKRA/index.html` — `state` object, `setView()`, `render()`

- [ ] **Step 1: Add fields to `state`**

Find the `let state = {` block (around line 186). Add three fields at the end of the object, before the closing `}`:

```javascript
        // Location Manager State
        locationTab: 'missing',   // 'missing' | 'all'
        locationSearch: '',
        locationEdits: {}         // { productName: { floor, location } }
```

- [ ] **Step 2: Reset location state in `setView()`**

Find `function setView(viewName)`. Add a reset block after the `if (viewName === 'survey')` block:

```javascript
            if (viewName === 'location') {
                state.locationTab = 'missing';
                state.locationSearch = '';
                state.locationEdits = {};
            }
```

- [ ] **Step 3: Add routing in `render()`**

Find the `function render()` block. Add one line before the closing `}`:

```javascript
            else if (state.view === 'location') { root.innerHTML = renderLocationManager(); }
```

- [ ] **Step 4: Verify routing wires correctly**

Open `index.html` in browser (or live server). Open DevTools console and run:
```javascript
setView('location');
```
Expected: page goes blank or shows undefined (no renderer yet — that's fine, no JS error should appear).

- [ ] **Step 5: Commit**

```bash
git add TRDAKRA/index.html
git commit -m "feat: add location manager state fields and routing"
```

---

### Task 2: Home screen button with badge

**Files:**
- Modify: `TRDAKRA/index.html` — `renderHome()`

- [ ] **Step 1: Add button to `renderHome()`**

Find the `<hr class="border-slate-100 my-2">` line inside `renderHome()`. Add the new button immediately **before** the `<hr>`:

```javascript
                            <button onclick="setView('location')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-[0_6px_20px_rgba(99,102,241,0.25)]">
                                <span class="material-icons-round text-white">place</span> จัดโลเคชั่นสินค้า
                                ${missingCount > 0 ? `<span class="ml-auto bg-white/25 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">${missingCount}</span>` : ''}
                            </button>
```

- [ ] **Step 2: Compute `missingCount` before the return**

Inside `renderHome()`, add this line at the very top of the function body (before the `return` statement):

```javascript
            const missingCount = state.products.filter(p => !p.floor).length;
```

- [ ] **Step 3: Verify badge renders**

Reload browser. Home screen should show a purple "จัดโลเคชั่นสินค้า" button. If products have loaded, the badge number appears. If products haven't loaded yet (first load), `missingCount` will be 0 and no badge — that's correct.

- [ ] **Step 4: Commit**

```bash
git add TRDAKRA/index.html
git commit -m "feat: add location manager button + missing-count badge on home"
```

---

### Task 3: `renderLocationManager()` — shell, header, tabs, progress bar, search

**Files:**
- Modify: `TRDAKRA/index.html` — add new function

- [ ] **Step 1: Add the function**

Add this function **before** the `// Main Render Function` comment:

```javascript
        // ── Render: Location Manager ──
        function renderLocationManager() {
            const assigned = state.products.filter(p => p.floor).length;
            const total = state.products.length;
            const pct = total > 0 ? Math.round(assigned / total * 100) : 0;

            const tab = state.locationTab;
            const search = (state.locationSearch || '').toLowerCase().trim();

            const baseList = tab === 'missing'
                ? state.products.filter(p => !p.floor)
                : state.products;
            const filtered = search
                ? baseList.filter(p => p.name.toLowerCase().includes(search))
                : baseList;

            const editCount = Object.keys(state.locationEdits).length;

            const rows = filtered.map(prod => {
                const edit = state.locationEdits[prod.name] || {};
                const currentFloor    = edit.floor    !== undefined ? edit.floor    : (prod.floor    || '');
                const currentLocation = edit.location !== undefined ? edit.location : (prod.location || '');
                const hasPending = !!state.locationEdits[prod.name];
                const isMissing  = !prod.floor;
                const enc = encodeURIComponent(prod.name);

                const borderClass = hasPending
                    ? 'border-brand-blue border-2'
                    : isMissing
                        ? 'border-rose-200'
                        : 'border-slate-100';

                return `
                    <div class="bg-white p-4 rounded-2xl ${borderClass} border shadow-sm mb-3">
                        <div class="flex items-start justify-between gap-2 mb-3">
                            <h3 class="font-bold text-brand-blue text-sm leading-snug flex-1">${prod.name}</h3>
                            ${isMissing && !hasPending ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-200 flex-shrink-0">ไม่มีโลเคชั่น</span>' : ''}
                            ${hasPending ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20 flex-shrink-0">✏️ รอบันทึก</span>' : ''}
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">📍 ชั้น</label>
                                <select onchange="updateLocationEdit(decodeURIComponent('${enc}'), 'floor', this.value)"
                                    class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-brand-blue transition-all">
                                    <option value="" ${!currentFloor ? 'selected' : ''}>-- เลือก --</option>
                                    ${['1','2','3','4','5'].map(f => `<option value="${f}" ${currentFloor === f ? 'selected' : ''}>ชั้น ${f}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">📍 โลเคชั่น</label>
                                <input type="text" value="${currentLocation}" placeholder="เช่น A-01-1"
                                    oninput="updateLocationEdit(decodeURIComponent('${enc}'), 'location', this.value)"
                                    class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-brand-blue transition-all">
                            </div>
                        </div>
                    </div>`;
            }).join('');

            return `
                <div class="w-full max-w-md bg-[#f8fafc] min-h-screen flex flex-col relative">
                    <header class="bg-brand-blue text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
                        <div class="flex items-center gap-2">
                            <button onclick="setView('home')" class="p-1.5 rounded-full hover:bg-black/10 transition-colors text-white">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                            <h1 class="text-[17px] font-bold tracking-wide flex items-center gap-1.5">
                                <span class="material-icons-round text-[20px]">place</span> จัดโลเคชั่นสินค้า
                            </h1>
                        </div>
                        <button onclick="fetchInitialData(true)" class="p-1.5 rounded-full hover:bg-black/10 transition-colors text-white">
                            <span class="material-icons-round text-[20px]">refresh</span>
                        </button>
                    </header>

                    <div class="flex bg-white shadow-sm sticky top-[60px] z-10 border-b border-slate-100 px-2">
                        <button onclick="state.locationTab='missing'; render()" class="flex-1 py-3.5 text-[13px] font-semibold border-b-[2px] transition-all ${tab === 'missing' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-400 hover:text-slate-600'}">
                            ยังไม่มีโลเคชั่น ${state.products.filter(p => !p.floor).length > 0 ? `<span class="ml-1 text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">${state.products.filter(p => !p.floor).length}</span>` : ''}
                        </button>
                        <button onclick="state.locationTab='all'; render()" class="flex-1 py-3.5 text-[13px] font-semibold border-b-[2px] transition-all ${tab === 'all' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-400 hover:text-slate-600'}">
                            ทั้งหมด
                        </button>
                    </div>

                    <div class="bg-white px-4 py-3 border-b border-slate-100">
                        <div class="flex justify-between text-[11px] text-slate-500 mb-1.5">
                            <span>ระบุโลเคชั่นแล้ว <span class="font-bold text-emerald-600">${assigned}</span> / ${total} รายการ</span>
                            <span class="font-bold ${pct >= 90 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-rose-500'}">${pct}%</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-2">
                            <div class="h-2 rounded-full transition-all ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}" style="width:${pct}%"></div>
                        </div>
                    </div>

                    <div class="bg-white px-4 py-2.5 border-b border-slate-100">
                        <input type="text" value="${state.locationSearch}" placeholder="🔍 ค้นหาชื่อสินค้า..."
                            oninput="state.locationSearch = this.value; render()"
                            class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-brand-blue transition-all">
                    </div>

                    <main class="flex-1 overflow-y-auto p-4 ${editCount > 0 ? 'pb-36' : 'pb-6'} animate-fade-in">
                        ${filtered.length === 0
                            ? `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
                                <span class="material-icons-round text-[40px] mb-2">check_circle_outline</span>
                                <p class="text-sm font-medium">${tab === 'missing' ? 'สินค้าทุกรายการมีโลเคชั่นแล้ว 🎉' : 'ไม่พบสินค้าที่ค้นหา'}</p>
                               </div>`
                            : rows}
                    </main>

                    ${editCount > 0 ? `
                        <div class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 p-4 shadow-2xl">
                            <p class="text-[11px] text-center text-slate-400 mb-2">✏️ แก้ไขแล้ว ${editCount} รายการ รอ Save</p>
                            <button onclick="handleLocationSave()" class="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-blue/20 active:scale-[0.98] transition-all">
                                💾 บันทึกทั้งหมด (${editCount} รายการ)
                            </button>
                        </div>` : ''}
                </div>`;
        }
```

- [ ] **Step 2: Verify the view renders**

Reload browser → Home → กดปุ่ม "จัดโลเคชั่นสินค้า".  
Expected: เห็นหน้าใหม่พร้อม header, 2 แท็บ, progress bar, search box, รายการสินค้า.  
ถ้า products ยังไม่โหลด → list ว่าง แต่ไม่มี JS error.

- [ ] **Step 3: Commit**

```bash
git add TRDAKRA/index.html
git commit -m "feat: add renderLocationManager() with tabs, progress bar, product rows"
```

---

### Task 4: `updateLocationEdit()` — track edits in state

**Files:**
- Modify: `TRDAKRA/index.html` — add helper function

- [ ] **Step 1: Add `updateLocationEdit()` before `renderLocationManager()`**

```javascript
        function updateLocationEdit(productName, field, value) {
            if (!state.locationEdits[productName]) {
                // Seed with current saved values so partial edits don't lose the other field
                const existing = state.products.find(p => p.name === productName) || {};
                state.locationEdits[productName] = {
                    floor:    existing.floor    || '',
                    location: existing.location || ''
                };
            }
            state.locationEdits[productName][field] = value;
            // Re-render only the save footer to avoid losing input focus
            const saveBar = document.getElementById('location-save-bar');
            if (saveBar) {
                const n = Object.keys(state.locationEdits).length;
                saveBar.innerHTML = `
                    <p class="text-[11px] text-center text-slate-400 mb-2">✏️ แก้ไขแล้ว ${n} รายการ รอ Save</p>
                    <button onclick="handleLocationSave()" class="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-blue/20 active:scale-[0.98] transition-all">
                        💾 บันทึกทั้งหมด (${n} รายการ)
                    </button>`;
                saveBar.classList.remove('hidden');
            } else {
                // Save bar not yet visible — full re-render to show it
                render();
            }
        }
```

- [ ] **Step 2: Add `id="location-save-bar"` to the save footer div in `renderLocationManager()`**

Find the sticky footer div inside `renderLocationManager()`:
```javascript
                        <div class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 p-4 shadow-2xl">
```
Change to:
```javascript
                        <div id="location-save-bar" class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 p-4 shadow-2xl">
```

- [ ] **Step 3: Verify edit tracking**

Reload → open Location Manager → change any floor dropdown.  
Expected: save footer appears at bottom showing "แก้ไขแล้ว 1 รายการ รอ Save". Card border stays normal (full re-render only on save bar missing). No JS errors.

- [ ] **Step 4: Commit**

```bash
git add TRDAKRA/index.html
git commit -m "feat: add updateLocationEdit() — tracks pending edits without losing focus"
```

---

### Task 5: `handleLocationSave()` — persist to Google Sheet

**Files:**
- Modify: `TRDAKRA/index.html` — add save handler

- [ ] **Step 1: Add `handleLocationSave()` before `renderLocationManager()`**

```javascript
        async function handleLocationSave() {
            const entries = Object.entries(state.locationEdits);
            if (entries.length === 0) return;

            showLoading(`กำลังบันทึกโลเคชั่น 0/${entries.length}...`);
            let successCount = 0;
            let failCount = 0;

            for (const [productName, edits] of entries) {
                const existing = getProductDetails(productName);
                const floor    = edits.floor    || existing.floor    || '';
                const location = edits.location || existing.location || '';
                const parLevel = existing.parLevel || 0;
                try {
                    await pushProductDetails(productName, floor, location, parLevel);
                    successCount++;
                } catch (e) {
                    console.error('handleLocationSave failed for', productName, e);
                    failCount++;
                }
                document.getElementById('loading-text').innerText =
                    `กำลังบันทึกโลเคชั่น ${successCount + failCount}/${entries.length}...`;
            }

            state.locationEdits = {};
            localStorage.removeItem('TRDAKRA_DATA');

            hideLoading();

            const msg = failCount > 0
                ? `บันทึกสำเร็จ ${successCount} รายการ ล้มเหลว ${failCount} รายการ`
                : `✅ บันทึกโลเคชั่นสำเร็จ ${successCount} รายการ`;
            alert(msg);

            sendAppLog('จัดโลเคชั่นสินค้า', `บันทึก ${successCount} รายการ`);
            fetchInitialData(true);
        }
```

- [ ] **Step 2: Verify save flow end-to-end**

Reload → open Location Manager → assign a floor to any product → tap "💾 บันทึกทั้งหมด".  
Expected:
- Loading overlay shows "กำลังบันทึกโลเคชั่น 1/1..."
- Alert: "✅ บันทึกโลเคชั่นสำเร็จ 1 รายการ"
- Page refreshes, product moves from "ยังไม่มีโลเคชั่น" tab to disappear (if it had no floor before)
- Badge on Home decreases by 1

- [ ] **Step 3: Commit**

```bash
git add TRDAKRA/index.html
git commit -m "feat: add handleLocationSave() — batch persist floor/location to Products Sheet"
```

---

### Task 6: Final integration check

- [ ] **Step 1: Test "ทั้งหมด" tab**

Open Location Manager → tap "ทั้งหมด" tab.  
Expected: all products show (including those with floor assigned). Progress bar same value.

- [ ] **Step 2: Test search**

Type partial product name in search box.  
Expected: list filters live. Clear search → all items return.

- [ ] **Step 3: Test empty state**

Switch to "ยังไม่มีโลเคชั่น" when all products have floors.  
Expected: shows "สินค้าทุกรายการมีโลเคชั่นแล้ว 🎉" message.

- [ ] **Step 4: Test navigation**

From Location Manager tap back arrow → lands on Home. Home badge shows correct count.

- [ ] **Step 5: Test multi-edit + save**

Edit floor/location on 3 different products → footer shows "3 รายการ" → save → all 3 update in sheet.

- [ ] **Step 6: Commit final**

```bash
git add TRDAKRA/index.html
git commit -m "feat: location manager complete — assign floor/location without placing order"
```
