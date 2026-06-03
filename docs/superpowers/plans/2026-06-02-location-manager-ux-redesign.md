# Location Manager UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-tap zone-first Location Manager flow with a product-first bottom sheet that lets users assign or reassign any product's floor/zone in 3 taps.

**Architecture:** Each product row gets a "กำหนด/แก้ไข" button that opens a fixed bottom sheet overlay. The sheet contains a floor grid, zone chips + text input, and par level field. Save is immediate per product via the existing `pushProductDetails()`. Batch editing state (`locationEdits`, `locationAddMode`, etc.) is removed entirely.

**Tech Stack:** Vanilla JS ES6+, Tailwind CSS CDN, Google Material Icons Round.

**Testing:** Manual — open `TRDAKRA/index.html?demo=1` (localhost bypasses SSO automatically).

---

## File Map

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Remove 6 state fields, add 4; fix 2 functions; remove 5 functions; add 5 functions; rewrite 2 render functions; modify `renderLocationManager` |
| `TRDAKRA/version.json` | Bump to `"20260602.03"` |

---

## Task 1: Clean Up State Object

**Files:**
- Modify: `TRDAKRA/index.html` ~lines 197–205 (Location Manager State block)

- [ ] **Step 1: Replace the Location Manager State block**

Find this exact block (lines ~197–205):
```javascript
            // Location Manager State
            locationSearch: '',
            locationShowAll: false,
            locationEdits: {},
            locationFloorFilter: '',
            locationZoneFilter: '',
            locationAddMode: false,
            locationAddSearch: '',
            locationNewZoneMode: false,
            locationNewZoneInput: '',
```

Replace with:
```javascript
            // Location Manager State
            locationSearch: '',
            locationFloorFilter: '',
            locationZoneFilter: '',
            locationSheet: null,
            locationSheetFloor: '',
            locationSheetZoneInput: '',
            locationSheetParLevel: '',
```

- [ ] **Step 2: Fix `setLocationFloor` (remove deleted state refs)**

Find:
```javascript
        function setLocationFloor(floor) {
            state.locationFloorFilter = state.locationFloorFilter === floor ? '' : floor;
            state.locationZoneFilter = '';
            state.locationAddMode = false;
            state.locationNewZoneMode = false;
            state.locationNewZoneInput = '';
            state.locationSearch = '';
            render();
        }
```
Replace with:
```javascript
        function setLocationFloor(floor) {
            state.locationFloorFilter = state.locationFloorFilter === floor ? '' : floor;
            state.locationZoneFilter = '';
            state.locationSearch = '';
            render();
        }
```

- [ ] **Step 3: Fix `setLocationZone` (remove deleted state ref)**

Find:
```javascript
        function setLocationZone(zone) {
            state.locationZoneFilter = state.locationZoneFilter === zone ? '' : zone;
            state.locationAddMode = false;
            render();
        }
```
Replace with:
```javascript
        function setLocationZone(zone) {
            state.locationZoneFilter = state.locationZoneFilter === zone ? '' : zone;
            render();
        }
```

- [ ] **Step 4: Verify no crash**

Open `TRDAKRA/index.html?demo=1` in browser. DevTools console should be error-free. Home screen loads.

---

## Task 2: Remove Obsolete Functions

**Files:**
- Modify: `TRDAKRA/index.html` ~lines 381–417 and ~lines 2021–2080

- [ ] **Step 1: Remove `confirmNewZone`, `toggleLocationAddMode`, `addProductToCurrentZone`**

Find and delete this entire block (~lines 381–417):
```javascript
        function confirmNewZone() {
            const z = (state.locationNewZoneInput || '').trim().toUpperCase();
            if (!z) return;
            state.locationZoneFilter = z;
            state.locationNewZoneMode = false;
            state.locationNewZoneInput = '';
            render();
        }
```
and:
```javascript
        function toggleLocationAddMode() {
            state.locationAddMode = !state.locationAddMode;
            state.locationAddSearch = '';
            render();
        }

        function addProductToCurrentZone(productName) {
            const floor = state.locationFloorFilter;
            const zone  = state.locationZoneFilter;
            if (!floor || !zone) return;
            if (!state.locationEdits[productName]) {
                const existing = state.products.find(p => p.name === productName) || {};
                state.locationEdits[productName] = { floor, location: zone, parLevel: existing.parLevel || '' };
            } else {
                state.locationEdits[productName].floor    = floor;
                state.locationEdits[productName].location = zone;
            }
            const idx = state.products.findIndex(p => p.name === productName);
            if (idx !== -1) { state.products[idx].floor = floor; state.products[idx].location = zone; }
            state.locationAddSearch = '';
            render();
        }
```

- [ ] **Step 2: Remove `updateLocationEdit` and `handleLocationSave`**

Find and delete this entire block (~lines 2021–2080):
```javascript
        function updateLocationEdit(productName, field, value) {
            if (!state.locationEdits[productName]) {
                const existing = state.products.find(p => p.name === productName) || {};
                state.locationEdits[productName] = {
                    floor:    existing.floor    || '',
                    location: existing.location || '',
                    parLevel: existing.parLevel || ''
                };
            }
            state.locationEdits[productName][field] = value;
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
                render();
            }
        }

        async function handleLocationSave() {
            const entries = Object.entries(state.locationEdits);
            if (entries.length === 0) return;

            showLoading(`กำลังบันทึกโลเคชั่น 0/${entries.length}...`);
            let successCount = 0;
            let failCount = 0;

            for (const [productName, edits] of entries) {
                const existing = getProductDetails(productName);
                const floor    = edits.floor    !== undefined ? edits.floor    : (existing.floor    || '');
                const location = edits.location !== undefined ? edits.location : (existing.location || '');
                const parLevel = edits.parLevel !== undefined && edits.parLevel !== '' ? parseInt(edits.parLevel) : (existing.parLevel || 0);
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

- [ ] **Step 3: Verify no crash**

Open `?demo=1` → Home → "จัดโลเคชั่นสินค้า". Page will show errors because renderLocationRow still references old state. That's expected here — fixed in Task 4.

---

## Task 3: Add New Sheet Functions

**Files:**
- Modify: `TRDAKRA/index.html` — insert after `setLocationZone` function

- [ ] **Step 1: Add 4 new functions after `setLocationZone`**

Find:
```javascript
        function setLocationZone(zone) {
            state.locationZoneFilter = state.locationZoneFilter === zone ? '' : zone;
            render();
        }
```

Insert immediately after its closing `}`:
```javascript
        function openLocationSheet(productName) {
            const prod = state.products.find(p => p.name === productName) || {};
            state.locationSheet = { name: productName };
            state.locationSheetFloor = prod.floor || '';
            state.locationSheetZoneInput = prod.location || '';
            state.locationSheetParLevel = prod.parLevel ? String(prod.parLevel) : '';
            render();
        }

        function closeLocationSheet() {
            state.locationSheet = null;
            state.locationSheetFloor = '';
            state.locationSheetZoneInput = '';
            state.locationSheetParLevel = '';
            render();
        }

        function setSheetFloor(floor) {
            state.locationSheetFloor = floor;
            state.locationSheetZoneInput = '';
            render();
        }

        async function confirmLocationSheet() {
            const name     = state.locationSheet ? state.locationSheet.name : null;
            const floor    = state.locationSheetFloor;
            const zone     = (state.locationSheetZoneInput || '').trim().toUpperCase();
            const parLevel = parseInt(state.locationSheetParLevel) || 0;

            if (!name || !floor) return;
            if (floor !== 'NOSTK' && !zone) return;

            showLoading('กำลังบันทึกโลเคชั่น...');
            try {
                await pushProductDetails(name, floor, floor === 'NOSTK' ? '' : zone, parLevel);
                localStorage.removeItem('TRDAKRA_DATA');
                sendAppLog('จัดโลเคชั่นสินค้า', `${name} → ชั้น ${floor} โซน ${zone}`);
            } catch(e) {
                hideLoading();
                alert('บันทึกไม่สำเร็จ กรุณาลองใหม่');
                return;
            }
            hideLoading();
            closeLocationSheet();
        }
```

- [ ] **Step 2: Verify functions exist**

Open `?demo=1`, open DevTools console, type `typeof openLocationSheet`. Should return `"function"`.

---

## Task 4: Add `renderLocationSheet`

**Files:**
- Modify: `TRDAKRA/index.html` — insert after `confirmLocationSheet`, before `renderLocationRow`

- [ ] **Step 1: Add `renderLocationSheet` function**

Insert after `confirmLocationSheet()` closing `}`:
```javascript
        function renderLocationSheet() {
            if (!state.locationSheet) return '';
            const { name } = state.locationSheet;
            const floor = state.locationSheetFloor;
            const zone  = state.locationSheetZoneInput || '';
            const par   = state.locationSheetParLevel  || '';
            const FLOORS = ['1','2','3','4','5'];

            let existingZones = [];
            if (floor && floor !== 'NOSTK') {
                const zSet = new Set();
                state.products.filter(p => p.floor === floor && p.location)
                    .forEach(p => { const z = extractZone(p.location); if (z) zSet.add(z); });
                existingZones = [...zSet].sort();
            }

            const canSave = !!(floor && (floor === 'NOSTK' || zone.trim()));
            const saveLbl = floor
                ? (floor === 'NOSTK' ? ' (NOSTK)' : (zone ? ` ชั้น ${floor} › ${zone}` : ''))
                : '';

            return `
                <div onclick="closeLocationSheet()" class="fixed inset-0 bg-black/40 z-40"></div>
                <div class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[2rem] z-50 shadow-2xl" style="max-height:90vh;overflow-y:auto">
                    <div class="flex items-center justify-between p-4 border-b border-slate-100">
                        <div>
                            <p class="text-[11px] font-semibold text-slate-400">กำหนดโลเคชั่น</p>
                            <p class="text-sm font-bold text-brand-blue truncate" style="max-width:260px">${name}</p>
                        </div>
                        <button onclick="closeLocationSheet()" class="p-2 rounded-full hover:bg-slate-100 transition-colors">
                            <span class="material-icons-round text-slate-400">close</span>
                        </button>
                    </div>

                    <div class="p-4 space-y-5 pb-8">
                        <div>
                            <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">เลือกชั้น</p>
                            <div class="grid grid-cols-3 gap-2">
                                ${FLOORS.map(f => `
                                    <button onclick="setSheetFloor('${f}')"
                                            class="py-3 rounded-2xl text-sm font-bold transition-all active:scale-95
                                                   ${floor === f ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                                        ชั้น ${f}
                                    </button>
                                `).join('')}
                                <button onclick="setSheetFloor('NOSTK')"
                                        class="py-3 rounded-2xl text-sm font-bold transition-all active:scale-95
                                               ${floor === 'NOSTK' ? 'bg-slate-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                                    ❌ NOSTK
                                </button>
                            </div>
                        </div>

                        ${floor && floor !== 'NOSTK' ? `
                        <div>
                            <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">เลือกโซน</p>
                            ${existingZones.length > 0 ? `
                            <div class="flex flex-wrap gap-2 mb-3">
                                ${existingZones.map(z => `
                                    <button onclick="state.locationSheetZoneInput='${z}'; render()"
                                            class="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95
                                                   ${zone === z ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'}">
                                        ${z}
                                    </button>
                                `).join('')}
                            </div>` : ''}
                            <input type="text" value="${zone}"
                                placeholder="พิมพ์ชื่อโซน เช่น 1B, 2A-03..."
                                oninput="state.locationSheetZoneInput=this.value.toUpperCase(); render()"
                                class="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold uppercase focus:border-indigo-500 focus:bg-white transition-all"
                                autocomplete="off">
                        </div>` : ''}

                        <div>
                            <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Par Level <span class="font-normal normal-case text-slate-400">(ไม่บังคับ)</span></p>
                            <input type="number" min="0" value="${par}"
                                placeholder="ยอดสต๊อกเต็ม"
                                oninput="state.locationSheetParLevel=this.value"
                                class="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-center focus:border-brand-orange focus:bg-white transition-all">
                        </div>

                        <button onclick="${canSave ? 'confirmLocationSheet()' : ''}"
                                class="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]
                                       ${canSave ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}">
                            ✓ บันทึก${saveLbl}
                        </button>
                    </div>
                </div>
            `;
        }
```

---

## Task 5: Rewrite `renderLocationRow`

**Files:**
- Modify: `TRDAKRA/index.html` — replace entire `renderLocationRow` function (~lines 1958–2000)

- [ ] **Step 1: Replace `renderLocationRow` entirely**

Find the entire function from `function renderLocationRow(prod) {` to its closing `}` and replace with:
```javascript
        function renderLocationRow(prod) {
            const isMissing = !prod.floor;
            const enc = encodeURIComponent(prod.name);
            const borderClass = isMissing ? 'border-rose-200' : 'border-slate-100';

            let locationChip = '';
            if (prod.floor === 'NOSTK') {
                locationChip = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">❌ NOSTK</span>`;
            } else if (prod.floor && prod.location) {
                locationChip = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">📍 ชั้น ${prod.floor} › ${prod.location}</span>`;
            } else if (prod.floor) {
                locationChip = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">📍 ชั้น ${prod.floor}</span>`;
            } else {
                locationChip = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-200">🔴 ยังไม่มีโลเคชั่น</span>`;
            }

            const parBadge = prod.parLevel
                ? `<span class="text-[10px] font-medium text-slate-400 ml-1">Par: <span class="font-bold text-slate-600">${prod.parLevel}</span></span>`
                : '';

            const btnLabel = isMissing ? '📍 กำหนด' : '✏️ แก้ไข';
            const btnClass = isMissing
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200';

            return `
                <div class="bg-white p-3.5 rounded-2xl ${borderClass} border shadow-sm mb-2.5 flex items-center justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-brand-blue text-sm leading-snug truncate mb-1">${prod.name}</p>
                        <div class="flex items-center flex-wrap gap-1">
                            ${locationChip}
                            ${parBadge}
                        </div>
                    </div>
                    <button onclick="openLocationSheet(decodeURIComponent('${enc}'))"
                            class="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${btnClass}">
                        ${btnLabel}
                    </button>
                </div>`;
        }
```

- [ ] **Step 2: Update `updateLocationSearch` to remove showAll logic**

Find the line inside `updateLocationSearch`:
```javascript
                : state.products.filter(p => !p.floor).slice(0, 20);
```
Replace with:
```javascript
                : state.products.filter(p => !p.floor);
```

- [ ] **Step 3: Verify rows render**

Open `?demo=1` → จัดโลเคชั่นสินค้า. Should see product rows with chips and กำหนด/แก้ไข buttons. Tapping a button will crash (renderLocationManager doesn't call renderLocationSheet yet). That's OK.

---

## Task 6: Modify `renderLocationManager`

**Files:**
- Modify: `TRDAKRA/index.html` — replace entire `renderLocationManager` function (~lines 2082–2239)

- [ ] **Step 1: Replace entire `renderLocationManager` function**

Find from `function renderLocationManager() {` to its closing `}` and replace with:
```javascript
        function renderLocationManager() {
            const floorF  = state.locationFloorFilter;
            const zoneF   = state.locationZoneFilter;
            const search  = (state.locationSearch || '').toLowerCase().trim();
            const FLOORS  = ['1','2','3','4','5'];

            const missingCount = state.products.filter(p => !p.floor).length;

            let zones = [];
            if (floorF && floorF !== 'NOSTK') {
                const zSet = new Set();
                state.products.filter(p => p.floor === floorF && p.location)
                    .forEach(p => { const z = extractZone(p.location); if (z) zSet.add(z); });
                zones = [...zSet].sort();
            }

            let displayList = [];
            if (search) {
                displayList = state.products.filter(p => p.floor !== 'NOSTK' && p.name.toLowerCase().includes(search));
            } else if (floorF === 'NOSTK') {
                displayList = state.products.filter(p => p.floor === 'NOSTK');
            } else if (floorF && zoneF) {
                displayList = state.products.filter(p => p.floor === floorF && extractZone(p.location) === zoneF);
            } else if (floorF) {
                displayList = state.products.filter(p => p.floor === floorF);
            } else {
                displayList = state.products.filter(p => !p.floor);
            }

            const emptyMsg = search ? 'ไม่พบสินค้าที่ค้นหา'
                : floorF === 'NOSTK' ? 'ยังไม่มีสินค้ากลุ่มนี้'
                : floorF && zoneF ? `ยังไม่มีสินค้าในโซน ${zoneF}`
                : floorF ? `ยังไม่มีสินค้าในชั้น ${floorF}`
                : 'สินค้าทุกรายการมีโลเคชั่นแล้ว 🎉';

            return `
                <div class="w-full max-w-md bg-[#f8fafc] min-h-screen flex flex-col relative animate-fade-in">
                    <header class="bg-brand-blue text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
                        <div class="flex items-center gap-2">
                            <button onclick="setView('home')" class="p-1.5 rounded-full hover:bg-black/10 transition-colors text-white">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                            <div>
                                <h1 class="text-[17px] font-bold tracking-wide flex items-center gap-1.5">
                                    <span class="material-icons-round text-[20px]">place</span> จัดโลเคชั่นสินค้า
                                </h1>
                                ${floorF || zoneF ? `<p class="text-[11px] text-white/70 mt-0.5">${floorF ? (floorF === 'NOSTK' ? 'ไม่มีพื้นที่จัด' : 'ชั้น ' + floorF) : ''}${zoneF ? ' › โซน ' + zoneF : ''}</p>` : ''}
                            </div>
                        </div>
                        <button onclick="fetchInitialData(true)" class="p-1.5 rounded-full hover:bg-black/10 transition-colors text-white">
                            <span class="material-icons-round text-[20px]">refresh</span>
                        </button>
                    </header>

                    <div class="bg-white border-b border-slate-100 px-3 py-2.5 overflow-x-auto flex gap-2 shadow-sm">
                        <button onclick="setLocationFloor('')" class="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${!floorF ? 'bg-rose-500 text-white' : 'bg-white border border-slate-200 text-slate-500'}">
                            ยังไม่มีโลเคชั่น ${missingCount > 0 ? `<span class="ml-1 ${!floorF ? 'bg-white/30 text-white' : 'bg-rose-100 text-rose-600'} text-[10px] px-1 rounded-full">${missingCount}</span>` : ''}
                        </button>
                        ${FLOORS.map(f => {
                            const cnt = state.products.filter(p => p.floor === f).length;
                            return `<button onclick="setLocationFloor('${f}')" class="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${floorF === f ? 'bg-brand-blue text-white' : 'bg-white border border-slate-200 text-slate-500'}">ชั้น ${f}${cnt > 0 ? ` <span class="text-[10px] opacity-70">(${cnt})</span>` : ''}</button>`;
                        }).join('')}
                        <button onclick="setLocationFloor('NOSTK')" class="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${floorF === 'NOSTK' ? 'bg-slate-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}">❌ NOSTK</button>
                    </div>

                    ${floorF && floorF !== 'NOSTK' ? `
                    <div class="bg-white border-b border-slate-100 px-3 py-2 overflow-x-auto flex gap-2">
                        <button onclick="setLocationZone('')" class="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${!zoneF ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}">ทุกโซน</button>
                        ${zones.map(z => {
                            const cnt = state.products.filter(p => p.floor === floorF && extractZone(p.location) === z).length;
                            return `<button onclick="setLocationZone('${z}')" class="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${zoneF === z ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}">โซน ${z} (${cnt})</button>`;
                        }).join('')}
                    </div>` : ''}

                    ${floorF === 'NOSTK' ? `
                    <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                        <p class="text-[11px] text-slate-500">สินค้ากลุ่มนี้ไม่เก็บสต๊อกหน้าร้าน ไม่ถูกนับในระบบสำรวจ</p>
                    </div>` : ''}

                    <div class="p-3 bg-white border-b border-slate-100">
                        <input type="text" value="${state.locationSearch}" placeholder="🔍 ค้นหาชื่อสินค้า..."
                            oninput="updateLocationSearch(this.value)"
                            class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-brand-blue focus:bg-white transition-all">
                    </div>

                    <main id="location-list" class="flex-1 overflow-y-auto p-4 pb-8">
                        ${search ? `<p class="text-[11px] text-slate-400 font-medium mb-3 px-1">ผลการค้นหา <span class="font-bold text-brand-blue">${displayList.length} รายการ</span></p>` : ''}
                        ${displayList.length === 0
                            ? `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
                                <span class="material-icons-round text-[40px] mb-2">check_circle_outline</span>
                                <p class="text-sm font-medium text-center px-4">${emptyMsg}</p>
                               </div>`
                            : displayList.map(renderLocationRow).join('')}
                    </main>

                    ${renderLocationSheet()}
                </div>`;
        }
```

- [ ] **Step 2: Full smoke test**

Open `?demo=1` → จัดโลเคชั่นสินค้า. Check:
- Product rows show location chip + กำหนด/แก้ไข button ✓
- Tap "กำหนด" → bottom sheet slides up with floor grid ✓
- Tap a floor (e.g. ชั้น 2) → zone section appears ✓
- Tap existing zone chip → zone input fills ✓
- บันทึก button enables only after floor + zone selected ✓
- Tap backdrop → sheet closes ✓
- NOSTK floor → zone section hidden, บันทึก enabled immediately ✓
- Floor filter chips still browse correctly ✓
- Zone filter chips still work ✓
- Search still works ✓
- No batch save bar anywhere ✓
- No "+ โซนใหม่" / "เพิ่มสินค้า" in zone row ✓

---

## Task 7: Version Bump

**Files:**
- Modify: `TRDAKRA/index.html` line ~77
- Modify: `TRDAKRA/version.json`

- [ ] **Step 1: Bump `CURRENT_VERSION` in `index.html`**

Find:
```javascript
        const CURRENT_VERSION = "20260602.02";
```
Replace with:
```javascript
        const CURRENT_VERSION = "20260602.03";
```

- [ ] **Step 2: Update `version.json`**

Replace content with:
```json
{
  "version": "20260602.03"
}
```

- [ ] **Step 3: Commit and push**

```bash
cd TRDAKRA
git add index.html version.json docs/superpowers/plans/2026-06-02-location-manager-ux-redesign.md docs/superpowers/specs/2026-06-02-location-manager-ux-redesign.md
git commit -m "feat: redesign Location Manager with product-first bottom sheet UX

- Replace 5-tap zone-first flow with 3-tap product-first bottom sheet
- Each product row shows location chip + กำหนด/แก้ไข button
- Bottom sheet: floor grid (6 large buttons) + zone chips + text input + par level
- Immediate per-product save via pushProductDetails (no more batch save bar)
- Works for both new assignment and reassignment
- Remove: locationEdits, locationAddMode, locationShowAll, locationNewZoneMode, confirmNewZone, toggleLocationAddMode, addProductToCurrentZone, updateLocationEdit, handleLocationSave
- Bump version to 20260602.03

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

- [x] State: 6 fields removed, 4 added — Task 1 ✓
- [x] `setLocationFloor` / `setLocationZone` cleaned of deleted refs — Task 1 ✓
- [x] `confirmNewZone`, `toggleLocationAddMode`, `addProductToCurrentZone` removed — Task 2 ✓
- [x] `updateLocationEdit`, `handleLocationSave` removed — Task 2 ✓
- [x] `openLocationSheet` prefills from `state.products` — Task 3 ✓
- [x] `confirmLocationSheet` calls existing `pushProductDetails` (line ~328) — Task 3 ✓
- [x] `confirmLocationSheet` skips zone for NOSTK (`floor === 'NOSTK' ? '' : zone`) — Task 3 ✓
- [x] `renderLocationSheet` returns `''` when `state.locationSheet === null` — Task 4 ✓
- [x] Zone chips in sheet highlight when `zone === z` — Task 4 ✓
- [x] Sheet zone input `oninput` uses `.toUpperCase()` — Task 4 ✓
- [x] `renderLocationRow` uses `openLocationSheet` not `updateLocationEdit` — Task 5 ✓
- [x] `updateLocationSearch` slice(0,20) removed — Task 5 ✓
- [x] `renderLocationManager` removes add panel, batch save bar, "+ โซนใหม่", "เพิ่มสินค้า" — Task 6 ✓
- [x] `renderLocationSheet()` called at bottom of `renderLocationManager` template — Task 6 ✓
- [x] Version bumped in both files — Task 7 ✓
- [x] No references to `locationEdits`, `locationAddMode`, `locationNewZoneMode` remain after changes ✓
