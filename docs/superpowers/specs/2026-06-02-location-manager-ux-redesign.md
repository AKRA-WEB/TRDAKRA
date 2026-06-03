# Location Manager UX Redesign — Product-first Bottom Sheet
**Date:** 2026-06-02  
**App:** TRDAKRA (`TRDAKRA/index.html`)  
**Status:** Approved, ready for implementation

---

## 1. Problem

Current Location Manager requires 5–6 taps to assign a product to a zone:

1. Select floor (tiny chip)
2. Select zone (tiny chip) — or create new zone (hidden "+ โซนใหม่" flow)
3. Click "เพิ่มสินค้า" button (small, in chip row)
4. Search in add panel
5. Tap product

Additional problems:
- Cannot reassign a product that already has a location
- "+ โซนใหม่" and "เพิ่มสินค้า" are visually buried in scrollable chip row
- Add panel expands above the product list — easy to miss
- Two separate search bars confuse users

---

## 2. Solution: Product-first Bottom Sheet

Flip the flow. Instead of "select zone → add products", each product row has a direct action button → opens a bottom sheet → user selects floor + zone there.

**Reduces flow to 3 taps:** tap product button → tap floor → tap zone → บันทึก (auto-close)

Works for **both new assignments and reassignments** of existing products.

---

## 3. Product Row Redesign

### Before
Row showed inline inputs (floor input, location input, par level input) + batch save bar.

### After
```
┌────────────────────────────────────────────┐
│ น้ำส้มคั้น 100%                             │
│ 📍 ชั้น 2 › โซน 2B    Par: 20   [✏️ แก้ไข] │
├────────────────────────────────────────────┤
│ นมกล่อง UHT                                │
│ 🔴 ยังไม่มีโลเคชั่น           [📍 กำหนด]   │
└────────────────────────────────────────────┘
```

- Assigned products: show location chip (📍 ชั้น X › โซน Y) + Par badge + **✏️ แก้ไข** button
- Unassigned products: show 🔴 badge + **📍 กำหนด** button
- Both buttons call `openLocationSheet(productName)`

---

## 4. Bottom Sheet

Fixed-position overlay slides up from bottom. Backdrop tap = close.

```
┌──────────────────────────────────────────┐
│ ✕   กำหนดโลเคชั่น                        │ ← sticky header
│     [ชื่อสินค้า] (truncated)              │
├──────────────────────────────────────────┤
│ เลือกชั้น                                │
│  [ชั้น 1]  [ชั้น 2]  [ชั้น 3]            │ ← 3-col grid, large tap targets
│  [ชั้น 4]  [ชั้น 5]  [❌ NOSTK]           │
├──────────────────────────────────────────┤
│ เลือกโซน   (shows after floor selected)  │
│  [1A (3)]  [1B (5)]  [1C (2)]            │ ← existing zones for that floor
│  [+ โซนใหม่]                             │ ← single clear CTA
│  ─────── หรือพิมพ์ชื่อโซน ──────         │
│  [________________] (auto-uppercase)     │
├──────────────────────────────────────────┤
│ Par Level (ไม่บังคับ)                    │
│  [________]  หน่วย                       │
├──────────────────────────────────────────┤
│  [✓ บันทึก]   ← disabled until floor+zone │
└──────────────────────────────────────────┘
```

### Zone Input Behavior
- Tapping an existing zone chip → fills `locationSheetZoneInput` with that zone prefix (e.g. `"1B"`)
- User can then type a full location like `"1B-03"` or just leave as `"1B"`
- `+ โซนใหม่` button: clears zone input + focuses it
- Input is auto-uppercased

### Save Behavior
- `confirmLocationSheet()` calls `pushProductDetails(name, floor, zoneInput, parLevel)`
- On success: updates `state.products[idx]` in-place + closes sheet
- No batch save bar needed — each save is immediate

### NOSTK behavior
- Selecting NOSTK floor → zone section hidden entirely → บันทึก enabled immediately

---

## 5. State Changes

### Remove
```javascript
locationEdits        // no longer needed — single-product immediate save
locationShowAll      // replaced by scroll (no "show all" button)
locationNewZoneMode  // moved into sheet
locationNewZoneInput // moved into sheet
locationAddMode      // replaced by sheet
locationAddSearch    // replaced by sheet
```

### Add
```javascript
locationSheet: null,         // null = closed | { name, floor, location, parLevel }
locationSheetFloor: '',      // floor selected inside sheet
locationSheetZoneInput: '',  // zone text in sheet (from chip tap or keyboard)
locationSheetParLevel: ''    // par level in sheet
```

### Keep (unchanged)
```javascript
locationFloorFilter   // browse filter — still used
locationZoneFilter    // browse filter — still used
locationSearch        // main search — still used
```

---

## 6. Functions

### New
| Function | Signature | Purpose |
|----------|-----------|---------|
| `openLocationSheet` | `(productName)` | Prefill sheet state from `state.products`, set `state.locationSheet` |
| `closeLocationSheet` | `()` | Reset all `locationSheet*` state to defaults |
| `setSheetFloor` | `(floor)` | Set `locationSheetFloor`, clear `locationSheetZoneInput` |
| `confirmLocationSheet` | `()` | Validate (floor + zone required unless NOSTK), call `pushProductDetails`, close sheet |
| `renderLocationSheet` | `()` | Return HTML string for bottom sheet overlay |

### Remove
- `toggleLocationAddMode()`
- `addProductToCurrentZone(productName)`
- `confirmNewZone()`

### Modify
- `renderLocationRow(prod)` — remove inline inputs, add action button
- `renderLocationManager()` — remove add panel HTML, add `renderLocationSheet()` at end, remove batch save bar

---

## 7. Browse Filter (Unchanged)

Floor chip row and zone chip row at top are kept as-is for **browsing** (not adding).  
The "+ โซนใหม่" and "เพิ่มสินค้า" buttons are **removed** from the zone chip row — those actions now live exclusively in the bottom sheet.

---

## 8. Error Handling

| Scenario | Behavior |
|----------|---------|
| `pushProductDetails` API fails | Alert "บันทึกไม่สำเร็จ กรุณาลองใหม่", sheet stays open |
| Tap บันทึก with no zone (non-NOSTK) | บันทึก button remains disabled, zone row highlighted |
| Backdrop tap while saving | Ignored (sheet locked during save) |

---

## 9. Files Changed

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Remove 5 state fields, add 4 state fields, add 5 functions, remove 3 functions, modify 2 functions |
| `TRDAKRA/version.json` | Bump to `20260602.03` |
| `TRDAKRA/index.html` (CURRENT_VERSION) | Bump to `"20260602.03"` |
