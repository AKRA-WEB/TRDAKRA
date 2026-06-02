# Analytics Dashboard — Tab-based Redesign
**Date:** 2026-06-02  
**App:** TRDAKRA (`TRDAKRA/index.html`)  
**Status:** Approved, ready for implementation

---

## 1. Background & Goal

The existing `renderDashboard()` shows: week/month filter, total qty card, total bills card, top-10 insights, recent 20 bills list.

**Gaps identified:**
- No daily trend / calendar visualization
- No stock-out frequency report
- No fulfillment rate (requestQty vs receiveQty)
- No cancellation visibility
- SurveyLog data collected but never surfaced in dashboard
- No requester breakdown

**Users:** warehouse manager (decisions) + store staff TRD (operational reference)  
**Data size:** <500 items in `state.items` → all computation client-side

---

## 2. Architecture

### 2.1 New State Fields
```javascript
dashboardTab: 'summary',        // 'summary' | 'trend' | 'problems' | 'survey'
calendarMonth: new Date().getMonth(),   // 0-11
calendarYear: new Date().getFullYear(),
calendarSelectedDate: null,     // 'YYYY-MM-DD' string, null = none selected
surveyLogs: null,               // null = not fetched | [] = empty | [...] = data
surveyLogsLoading: false
```

### 2.2 New / Refactored Functions

| Function | Purpose |
|----------|---------|
| `setDashboardTab(tab)` | set `state.dashboardTab`, render |
| `setCalendarNav(dir)` | `dir = 1 or -1`, advance/retreat month or week |
| `selectCalendarDate(dateStr)` | toggle `state.calendarSelectedDate` |
| `fetchSurveyLogs()` | lazy fetch `?action=getSurveyLog`, set state |
| `renderDashboard()` | orchestrator — renders header + tab bar + active tab content |
| `renderDashboardSummary(filtered, allItems)` | Tab 1 content |
| `renderDashboardTrend()` | Tab 2 content (calendar + day detail) |
| `renderDashboardProblems(allItems, startDate)` | Tab 3 content |
| `renderDashboardSurvey()` | Tab 4 content |

### 2.3 Layout Shell (renderDashboard)
```
┌─────────────────────────┐
│ Header (back + title + refresh) — sticky top-0  │
│ Week/Month toggle — sticky top-[60px]           │
│ Tab bar (สรุป | Trend | หมด/ยกเลิก | Survey) — sticky top-[108px] │
├─────────────────────────┤
│ Active tab content (scrollable)                 │
└─────────────────────────┘
```

---

## 3. Tab 1 — สรุป (Summary)

### 3.1 KPI Cards (2×2 grid)
| Card | Computation | Color |
|------|-------------|-------|
| ยอดจัดส่งรวม | `Σ receiveQty` where status = จัดส่งแล้ว or รับสินค้าแล้ว | brand-blue |
| จำนวนบิลเบิก | count of dispatched items | brand-orange |
| Fulfillment Rate | `(Σ receiveQty / Σ requestQty) × 100` (dispatched only) | emerald |
| สินค้าหมด/ยกเลิก | count status = สินค้าหมด + ยกเลิก in date range | rose |

All 4 use the week/month `startDate` filter.

### 3.2 ผู้ขอเบิกสูงสุด (Top Requesters)
- Group `state.items` (filtered) by `requestedBy`
- Show top 3: avatar circle (initials), name, bill count
- Skip items with empty `requestedBy`

### 3.3 Top 10 Insights (existing)
`getInsightDetails()` logic unchanged. Moved below requesters section.

### 3.4 Recent Bills List (existing)
Unchanged, 20 items max.

---

## 4. Tab 2 — Trend (Calendar)

### 4.1 Toggle: Month / Week
`state.dashboardFilter` ('month' | 'week') controls **both** the calendar view mode (month grid vs week strip) **and** the date range used for stat calculations in Tab 1.  
`calendarMonth` / `calendarYear` allow navigating to other months/weeks without changing today's date — they default to current month/year on first load.

### 4.2 Navigation Header
```
< มิถุนายน 2569 >    (month view)
< 26 พ.ค. – 1 มิ.ย. >  (week view)
```
`setCalendarNav(-1)` / `setCalendarNav(1)` — navigate without losing selected date.

### 4.3 Month Calendar Grid
- 7-column grid, Mon–Sun headers
- Each day cell (min 40×40px):
  - **Background intensity** by bill count that day:
    - 0 bills: `bg-slate-50 text-slate-300`
    - 1–2: `bg-blue-100 text-blue-700`
    - 3–5: `bg-blue-300 text-blue-900`
    - 6+: `bg-brand-blue text-white`
  - **Red dot** (4px, top-right corner) if any item has `status === 'สินค้าหมด'` that day
  - **Selected ring**: `ring-2 ring-brand-orange`
  - Days outside current month: `opacity-30`, non-tappable (pointer-events-none)

### 4.4 Week View
7 columns, each shows:
- Day name abbreviation (จ/อ/พ/พฤ/ศ/ส/อา)
- Date number
- CSS bar chart (height proportional to qty, max height 60px)
- Qty number label above bar

### 4.5 Day Detail Panel
`calendarSelectedDate` stores CE date as `'YYYY-MM-DD'` string. Derived by running `parseCustomDate(item.timestamp)` (which already converts Thai BE → CE Date) then formatting to ISO date string. Bill lookup uses `toISOString().slice(0,10)` comparison.

Appears below calendar when `calendarSelectedDate` is set:
```
📅 วันจันทร์ที่ 2 มิ.ย. 2569  —  5 บิล / 47 ชิ้น
──────────────────────────────
itemName        receiveQty   status chip
สินค้าหมดแสดง ❌  
```
- Sorted by timestamp
- Tap another day replaces panel; tap same day deselects

---

## 5. Tab 3 — หมด/ยกเลิก (Problems)

### 5.1 Stock-out Ranking
- Source: **all** `state.items` (no date filter — historical frequency is the point)
- Filter `status === 'สินค้าหมด'`
- Group by `itemName`, count occurrences + find latest `rawDate`
- Display top 10 ranked cards:
  - Rank badge, item name, count (X ครั้ง), last occurrence (relative days)
- If count = 0: show empty state "ยังไม่มีบันทึกสินค้าหมด"

### 5.2 Cancelled Orders
- Source: `state.items` filtered by `startDate` (week/month)
- Filter `status === 'ยกเลิก'`  
- Show up to 10 most recent: date, itemName, requestedBy, w2Note (reason)
- If empty: show empty state

---

## 6. Tab 4 — Survey

### 6.1 Lazy Fetch
On first render of Survey tab:
1. If `state.surveyLogs === null`: call `fetchSurveyLogs()`
2. Show spinner while `state.surveyLogsLoading === true`
3. On success: set `state.surveyLogs = data`

```javascript
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

### 6.2 Summary Cards
- สำรวจเดือนนี้: count entries where surveyDate is in current calendar month
- สินค้าต้องเติม: count entries where `needToOrder > 0` this month

### 6.3 Survey History List
Group by `surveyDate` (date string prefix before ` / `):
```
📋 02-06-2569  ชั้น 2  สำรวจโดย: สมชาย
   น้ำส้ม     3 / 20   🔴 ต้องเติม 17
   นมกล่อง  15 / 20   🟡 ต้องเติม 5
   ขนมปัง   22 / 20   ✅ พอแล้ว
```
Status chips reuse `getStockStatus()` for color logic.  
Show last 30 grouped entries.

---

## 7. Error Handling

| Scenario | Behavior |
|----------|---------|
| `getSurveyLog` fetch fails | `state.surveyLogs = []`, show "ไม่สามารถโหลดข้อมูลได้ กรุณารีเฟรช" + retry button |
| `requestedBy` all empty | Hide requester section entirely |
| No dispatched items in date range | Show empty state per tab, never crash |
| calendarSelectedDate has no bills | Show "ไม่มีการเบิกในวันนี้" in day detail panel |

---

## 8. Files Changed

| File | Change |
|------|--------|
| `TRDAKRA/index.html` | Add state fields, add tab functions, refactor `renderDashboard()` |
| `TRDAKRA/version.json` | Bump version to `20260602.02` |
| `TRDAKRA/index.html` (CURRENT_VERSION) | Bump to `"20260602.02"` |

No GAS (`Code.gs.txt`) changes needed — `getSurveyLog` endpoint already exists.
