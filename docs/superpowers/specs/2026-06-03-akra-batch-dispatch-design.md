# AKRA Batch Dispatch Redesign
**Date:** 2026-06-03
**App:** TRDAKRA (`TRDAKRA/index.html` + `TRDAKRA/Code.gs.txt`)
**Status:** Approved, ready for implementation
**Version:** `20260602.04`

---

## 1. Problem

Current W2 (AKRA) dispatch flow requires handling each bill individually:
- Separate "จัดส่งสินค้า", "แจ้งของหมด", "ยกเลิกรายการ" buttons per item
- "สินค้าหมด" is a terminal status — item disappears to history permanently
- LINE notifications fire on every action (noisy)
- No way to re-dispatch an out-of-stock item when stock arrives

---

## 2. Solution Overview

Replace single-item flow with:
1. **Batch checklist UI** — tap row to toggle state, confirm all at once
2. **Non-terminal "สินค้าหมด"** — item stays in active list until dispatched
3. **Daily 18:00 LINE summary** — one message per day instead of per-action
4. **Cancel removed from AKRA** — TRD (W1) handles their own cancellations

---

## 3. UI Design — W2 Batch Dispatch View

### Layout
```
┌─────────────────────────────────┐
│ 📦 จัดสินค้าวันนี้   03 มิ.ย.  │  ← header
├──────────┬──────────┬───────────┤
│ ✅ 28    │ ❌ 2     │ ⏳ 0      │  ← KPI bar
│ เลือกจัด │ สินค้าหมด│ รอจัด    │
├─────────────────────────────────┤
│ ✅ น้ำส้มคั้น 100%    12 ลัง   │  ← state: dispatch (green)
│ ⬜ ขนมปังแซนวิช        4 แพ็ค  │  ← state: pending (grey)
│ ❌ ไข่ไก่ เบอร์ 2   ~~20 แพ็ค~~│  ← state: outstock (red, stays)
│ ❌ น้ำดื่มตราช้าง   ~~8 แพ็ค~~ │
├─────────────────────────────────┤
│ ✓ จัดส่ง 28 · ✕ หมด 2 · รอ 0  │
│  [ 🚚 ยืนยันจัดส่ง 28 รายการ ]  │  ← batch confirm
└─────────────────────────────────┘
```

### Row 3-State Toggle (tap to cycle)
| State | Visual | Meaning |
|-------|--------|---------|
| ⬜ pending | grey border box | ยังไม่ได้ตัดสินใจ |
| ✅ dispatch | green filled ✓ | จะจัดส่งในรอบนี้ |
| ❌ outstock | red filled ✕ + strikethrough | สินค้าหมด รอสต๊อกเข้า |

Cycling: ⬜ → ✅ → ❌ → ⬜ (infinite loop)

### Out-of-stock items behavior
- Remain in active list with red strikethrough + timestamp "มาร์กหมด HH:MM"
- When stock arrives: tap again → toggle back to ✅ → include in next batch submit
- Only `จัดส่งแล้ว` is terminal → moves to history

### Buttons removed from W2
- ~~ยกเลิกรายการ~~ — TRD side only
- ~~จัดส่งสินค้า (per item)~~ — replaced by batch confirm
- ~~แจ้งของหมด (per item)~~ — replaced by row toggle

---

## 4. State Changes

### New state fields
```javascript
w2BatchEdits: {}   // { [itemId]: 'dispatch' | 'outstock' | null }
// null = unset (pending), 'dispatch' = ✅, 'outstock' = ❌
```

### Removed state (no longer needed)
- `w2DispatchModal` (if any) — replaced by inline toggle

### Item status values
| Status | Terminal? | Shows in |
|--------|-----------|---------|
| `รอจัด` | No | W2 active list |
| `กำลังจัดสินค้า` | No | W2 active list |
| `สินค้าหมด` | **No (changed)** | W2 active list (stays!) |
| `จัดส่งแล้ว` | Yes | History |
| `ยกเลิกรายการ` | Yes | History |

---

## 5. New Functions

### Frontend (`index.html`)

| Function | Description |
|----------|-------------|
| `toggleW2BatchItem(id)` | Cycle item state: pending → dispatch → outstock → pending |
| `confirmBatchDispatch()` | Validate selections, call `batchUpdateStatus` API, refresh |
| `renderW2BatchView()` | Replace current `renderW2Tasks` pending section |
| `renderW2BatchRow(item)` | Single row with 3-state toggle |

### Remove / replace
- `updateItemStatus(id, newStatus)` — replaced by `confirmBatchDispatch()`
- Per-item dispatch form/modal calls

### Backend (`Code.gs.txt`)

| Function | Description |
|----------|-------------|
| `batchUpdateStatus(items)` | Loop array of `{id, newStatus, dispatchTimestamp}`, update each row |
| `sendDailyStockSummary()` | Rewrite: summary + dispatched list + outstock list, trigger at 18:00 |

---

## 6. API Changes

### New action: `batchUpdateStatus`
**Request:**
```json
{
  "action": "batchUpdateStatus",
  "items": [
    { "id": "TRD-001", "newStatus": "จัดส่งแล้ว", "dispatchTimestamp": "03-06-2026 / 14:23" },
    { "id": "TRD-002", "newStatus": "สินค้าหมด",  "dispatchTimestamp": "03-06-2026 / 14:23" }
  ]
}
```
**Response:** `{ "result": "ok", "updated": 28 }`

Backend loops through `items` array, finds each row by `id` in the sheet, updates `status` and `dispatchTimestamp` columns.

---

## 7. LINE Daily Summary — 18:00

### Message format
```
📦 สรุปการจัดสินค้าประจำวัน
วันที่ DD MMM YYYY · สรุป ณ 18:00 น.

✅ จัดส่งสำเร็จ X รายการ
❌ สินค้าหมด Y รายการ
⏳ รอจัดส่ง Z รายการ

─────────────────
✅ เบิกสำเร็จวันนี้
• [ชื่อสินค้า] — X ลัง
• [ชื่อสินค้า] — X ลัง
...

─────────────────
❌ สินค้าหมด (รอสต๊อกเข้า)
• [ชื่อสินค้า] — X หน่วย
...

🤖 ส่งอัตโนมัติทุกวัน 18:00 น.
```

### Trigger
- Google Apps Script time-based trigger: daily 18:00 Bangkok time
- Existing `sendDailyStockSummary()` function rewritten to match new format
- Remove all per-action LINE notify calls from `updateItemStatus` / dispatch functions

---

## 8. Files Changed

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Add `w2BatchEdits` state; add 4 functions; rewrite W2 pending section; remove per-item buttons |
| `TRDAKRA/Code.gs.txt` | Add `batchUpdateStatus` action; rewrite `sendDailyStockSummary`; remove per-action LINE calls |
| `TRDAKRA/version.json` | Bump to `20260602.04` |
| `TRDAKRA/index.html` | Bump `CURRENT_VERSION` to `20260602.04` |

---

## 9. Out of Scope

- Cancel button on W1 (TRD) side — separate feature, not in this spec
- W2 note/remark per item — keep as-is if currently exists, not changed
- Dispatch quantity edit per item — not in scope, use requested qty as-is
