# Location Manager — Design Spec
**Date:** 2026-06-02  
**Project:** TRDAKRA (ระบบเบิกจ่ายสินค้า)

---

## Problem

Staff can only assign floor/location to a product when placing a withdrawal request (W1). Products that were never ordered, or that had floor/location skipped during ordering, remain unassigned. There is no way to:
1. Assign location without placing an order
2. See which products still lack a location

---

## Goals

1. Staff can set/edit `floor` and `location` for any product — without placing an order
2. System clearly shows products that have no location assigned
3. Changes are saved to the Products Sheet via existing `updateProductDetails` API

---

## Out of Scope

- Editing `parLevel` (handled separately via Import Par Levels or W1 flow)
- Adding new products (managed in Google Sheet directly)
- Bulk CSV import

---

## Entry Point

New button on **Home Screen**, below the Survey button:

```
📍 จัดโลเคชั่นสินค้า   [badge: 47]
```

Badge shows count of products with no floor assigned. Updates each time products data is loaded.

---

## View: Location Manager (`state.view === 'location'`)

### Header
- Back arrow → `setView('home')`
- Title: "📍 จัดโลเคชั่นสินค้า"
- Refresh button → `fetchInitialData(true)`

### Tabs

| Tab | Content |
|-----|---------|
| ยังไม่มีโลเคชั่น (default) | `state.products.filter(p => !p.floor)` |
| ทั้งหมด | All `state.products` |

Active tab stored in `state.locationTab` (`'missing'` \| `'all'`).

### Progress Bar (shown in both tabs)
```
ระบุโลเคชั่นแล้ว {assigned} / {total} รายการ  {pct}%
[████████████░░] 
```
`assigned` = products where `floor` is non-empty.

### Search Bar
Text input filters product list by `name` (case-insensitive, live). Stored in `state.locationSearch`.

### Product Rows

Each product renders one card:

```
┌─────────────────────────────────────┐
│ ชื่อสินค้า               [badge: ไม่มีโลเคชั่น] │  ← badge only if !floor && !location
│  [ชั้น ▼]   [โลเคชั่น____________]           │
└─────────────────────────────────────┘
```

- **ชั้น**: `<select>` with options `-- เลือก --`, `ชั้น 1`…`ชั้น 5`. Value stored as `"1"`–`"5"`.
- **โลเคชั่น**: free-text `<input>` placeholder `เช่น A-01-1`
- Card border: `border-rose-200` if no floor; `border-brand-blue` if actively edited (has pending change); `border-slate-100` otherwise.

Changes are tracked in `state.locationEdits`: `{ [productName]: { floor, location } }`

### Sticky Footer — Save Button

Visible only when `Object.keys(state.locationEdits).length > 0`:

```
✏️ แก้ไขแล้ว N รายการ รอ Save
[💾 บันทึกทั้งหมด (N รายการ)]
```

On tap: calls `handleLocationSave()`.

---

## Data Flow

### Reading
Products loaded via existing `fetchInitialData` → `state.products` (already has `floor`, `location`, `parLevel` after the mapping fix).

### Writing — `handleLocationSave()`

```
for each entry in state.locationEdits:
  existing = getProductDetails(name)
  await pushProductDetails(name, newFloor || existing.floor, newLocation || existing.location, existing.parLevel)

state.locationEdits = {}
localStorage.removeItem('TRDAKRA_DATA')   // invalidate cache
fetchInitialData(true)
sendAppLog('จัดโลเคชั่น', `บันทึก N รายการ`)
```

Uses existing `pushProductDetails(itemName, floor, location, parLevel)` — no new API needed.

---

## State Changes

Add to `state`:
```javascript
locationTab: 'missing',   // 'missing' | 'all'
locationSearch: '',
locationEdits: {}         // { productName: { floor, location } }
```

Reset `locationEdits` and `locationSearch` when entering the view (`setView('location')`).

---

## Home Screen Badge

In `renderHome()`, compute:
```javascript
const missingCount = state.products.filter(p => !p.floor).length;
```
Show on button:
```html
📍 จัดโลเคชั่นสินค้า
<span class="badge">{missingCount}</span>   ← only if missingCount > 0
```

---

## Error Handling

- If `pushProductDetails` fails for one item: log to console, continue with others, show alert at end: `"บันทึกสำเร็จ X รายการ ล้มเหลว Y รายการ"`
- No network: existing `pushProductDetails` already has try/catch; save will silently skip, user can retry.

---

## Files Changed

Single file: `TRDAKRA/index.html`

1. Add `locationTab`, `locationSearch`, `locationEdits` to `state`
2. Reset in `setView('location')`
3. Add `renderLocationManager()` function
4. Add `handleLocationSave()` function
5. Update `render()` to call `renderLocationManager()` when `state.view === 'location'`
6. Update `renderHome()` — add button + badge
