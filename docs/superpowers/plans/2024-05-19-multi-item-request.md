# Multi-Item Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow W1 users to submit multiple items in one request by adding dynamic rows to the form.

**Architecture:** 
- Refactor `renderW1` to loop over `state.w1Rows`.
- Add functions to manage `state.w1Rows` (add, remove, update).
- Update `handleW1Submit` to process all rows and sync once.

**Tech Stack:** Vanilla JS, Tailwind CSS, Google Apps Script.

---

### Task 1: Update State and View Navigation

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Initialize `w1Rows` in `state` and `setView`**

Add `w1Rows` to the global `state` and ensure it resets when switching to `w1` view.

```javascript
// Around line 220
let state = {
    view: 'home', 
    w1Tab: 'request', 
    w2Tab: 'tasks', 
    dashboardFilter: 'week', 
    selectedReceiveId: null, 
    items: [], 
    products: [],
    w1Rows: [{ itemName: '', qty: '', storageCapacity: '', oldExpiry: '' }] // Add this
};

// Update setView function
function setView(viewName) { 
    state.view = viewName; 
    state.selectedReceiveId = null; 
    if (viewName === 'w1') {
        state.w1Rows = [{ itemName: '', qty: '', storageCapacity: '', oldExpiry: '' }];
    }
    render(); 
}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: initialize w1Rows state"
```

---

### Task 2: Implement Row Management Functions

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `addW1Row`, `removeW1Row`, and `updateW1RowValue`**

```javascript
function addW1Row() {
    state.w1Rows.push({ itemName: '', qty: '', storageCapacity: '', oldExpiry: '' });
    render();
}

function removeW1Row(index) {
    if (state.w1Rows.length > 1) {
        state.w1Rows.splice(index, 1);
        render();
    }
}

function updateW1RowValue(index, field, value) {
    state.w1Rows[index][field] = value;
    // Don't call render() here to avoid losing focus during typing
}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add row management functions for W1"
```

---

### Task 3: Refactor `renderW1` for Dynamic Rows

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update `renderW1` to loop through `state.w1Rows`**

```javascript
function renderW1() {
    let content = '';
    if (state.w1Tab === 'request') {
        content = `
            <div class="bg-white p-6 rounded-[2rem] shadow-[0_4px_24px_rgb(0,0,0,0.03)] border border-slate-50 space-y-5 animate-fade-in">
                <h2 class="text-lg font-bold text-brand-blue flex justify-between items-center mb-6">
                    <div class="flex items-center gap-2">
                        <div class="bg-brand-blue/10 text-brand-blue p-1.5 rounded-full flex items-center justify-center"><span class="material-icons-round text-[20px]">add</span></div>
                        สร้างรายการเบิก (TRD)
                    </div>
                    <span class="text-xs font-medium text-slate-400">${state.w1Rows.length} รายการ</span>
                </h2>
                
                <div id="w1-rows-container" class="space-y-6">
                    ${state.w1Rows.map((row, index) => `
                        <div class="p-4 rounded-2xl bg-slate-50/50 border border-slate-100 relative">
                            ${index > 0 ? `
                                <button onclick="removeW1Row(${index})" class="absolute -top-2 -right-2 bg-rose-500 text-white p-1 rounded-full shadow-md hover:bg-rose-600 transition-colors">
                                    <span class="material-icons-round text-sm">close</span>
                                </button>
                            ` : ''}
                            
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-[10px] font-bold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">ชื่อสินค้า #${index + 1}</label>
                                    <div class="relative">
                                        <input type="text" value="${row.itemName}" 
                                            oninput="updateW1RowValue(${index}, 'itemName', this.value); filterProducts(this.value, ${index})" 
                                            onfocus="filterProducts(this.value, ${index})"
                                            class="w-full p-3 bg-white border border-slate-200 rounded-xl focus:border-brand-blue transition-all text-sm" placeholder="ค้นหาชื่อสินค้า...">
                                        <div id="autocomplete-list-${index}" class="hidden absolute z-50 w-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl max-h-40 overflow-y-auto"></div>
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-[10px] font-bold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">จำนวน</label>
                                        <input type="number" value="${row.qty}" oninput="updateW1RowValue(${index}, 'qty', this.value)" 
                                            class="w-full p-3 bg-white border border-slate-200 rounded-xl focus:border-brand-blue text-sm font-bold" placeholder="0">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] font-bold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">ความจุ</label>
                                        <input type="number" value="${row.storageCapacity}" oninput="updateW1RowValue(${index}, 'storageCapacity', this.value)" 
                                            class="w-full p-3 bg-white border border-slate-200 rounded-xl focus:border-brand-blue text-sm" placeholder="ถ้าทราบ">
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="block text-[10px] font-bold text-brand-blue uppercase tracking-wider mb-1.5 ml-1">หมดอายุเก่า</label>
                                    <input type="text" value="${row.oldExpiry}" oninput="updateW1RowValue(${index}, 'oldExpiry', this.value)" 
                                        class="w-full p-3 bg-white border border-slate-200 rounded-xl focus:border-brand-blue text-sm" placeholder="วว-ดด-ปป">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <button onclick="addW1Row()" class="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-brand-blue hover:border-brand-blue transition-all flex items-center justify-center gap-2 text-sm font-medium">
                    <span class="material-icons-round text-sm">add</span> เพิ่มรายการสินค้า
                </button>

                <button onclick="handleW1SubmitBulk()" class="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl mt-4 shadow-lg shadow-brand-blue/20 active:scale-[0.98] transition-all">
                    ยืนยันการสั่งเบิก ${state.w1Rows.length} รายการ
                </button>
            </div>`;
    } 
    // ... rest of the function remains the same
```

- [ ] **Step 2: Update Autocomplete Functions**

Update `filterProducts` and `selectProduct` to handle row indices.

```javascript
function filterProducts(query, index) {
    const listDiv = document.getElementById(`autocomplete-list-${index}`);
    // ... existing logic but use index for listDiv and selectProduct call
}

function selectProduct(name, index) {
    updateW1RowValue(index, 'itemName', name);
    render(); // Re-render to show selection
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: refactor renderW1 for dynamic multi-item rows"
```

---

### Task 4: Implement Bulk Submission Logic

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Create `handleW1SubmitBulk`**

```javascript
async function handleW1SubmitBulk() {
    const validRows = state.w1Rows.filter(row => row.itemName && row.qty);
    if (validRows.length === 0) {
        alert('กรุณากรอกชื่อสินค้าและจำนวนอย่างน้อย 1 รายการ');
        return;
    }

    showLoading('กำลังส่งรายการเบิก...');
    const now = new Date();
    const timestamp = formatDateTime(now.toISOString());

    const newItems = validRows.map(row => ({
        id: `REQ-${Math.floor(Math.random() * 9000) + 1000}`,
        rawDate: now,
        timestamp: timestamp,
        itemName: row.itemName,
        requestQty: parseInt(row.qty),
        storageCapacity: row.storageCapacity ? parseInt(row.storageCapacity) : 0,
        status: 'สั่งเบิก',
        oldExpiry: row.oldExpiry ? convertToCE(row.oldExpiry) : 'ไม่ได้ระบุ',
        newExpiry: '', receiveQty: null, receiveNote: '', w2Note: '' 
    }));

    // Prepend all new items to the global items list
    state.items = [...newItems, ...state.items];
    
    // Reset rows and switch tab
    state.w1Rows = [{ itemName: '', qty: '', storageCapacity: '', oldExpiry: '' }];
    state.w1Tab = 'pending';
    render();

    await syncDataToSheet();
    hideLoading();
    alert(`ส่งคำขอเบิกสินค้า ${newItems.length} รายการเรียบร้อยแล้ว!`);
    sendAppLog("สั่งเบิกสินค้า Bulk (TRD)", `เบิกรวม ${newItems.length} รายการ`);
}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: implement bulk submission logic for W1"
```
