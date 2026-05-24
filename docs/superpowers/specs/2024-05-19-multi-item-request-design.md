# Design Doc: Multi-Item Request for W1 (TRD-AKRA)

**Date:** 2024-05-19
**Status:** Approved
**Topic:** Allow users in W1 (Storefront) to add multiple items in a single request transaction.

## 1. Problem Statement
Currently, users can only submit one item at a time. This is inefficient when a clerk has a list of items to restock from W2. They have to wait for each submission to complete before adding the next one.

## 2. Proposed Solution
Modify the W1 request form to support multiple rows. Users can add as many items as they need and submit them all at once.

## 3. UI/UX Changes (W1 View)
- **Component:** `renderW1()`
- **New State:** `state.w1Rows` (Array of objects: `{ itemName, qty, storageCapacity, oldExpiry }`).
- **Input Form:**
    - Each item row will be wrapped in a styled container (card-like).
    - Add a "Remove" button (icon) for each row except the first one.
    - Add a "+ Add Item" button at the bottom of the list.
- **Submission:**
    - The "Confirm Request" button will remain at the bottom, showing the total count of items.
    - Validation will ensure required fields are filled for all active rows.

## 4. Technical Implementation

### Frontend (`index.html`)
- **State Initialization:** Initialize `state.w1Rows = [{ itemName: '', qty: '', storageCapacity: '', oldExpiry: '' }]` when entering W1 view.
- **Dynamic Rendering:** Loop through `state.w1Rows` to render input fields.
- **Event Handlers:**
    - `addW1Row()`: Pushes a new empty object to `state.w1Rows`.
    - `removeW1Row(index)`: Splices the row at `index`.
    - `updateW1RowValue(index, field, value)`: Updates the specific field in the state array.
- **Submission:**
    - `handleW1Submit()`: Map through `state.w1Rows`, generate unique IDs, and prepend to `state.items`.
    - Call `syncDataToSheet()` once with the updated items array.

### Backend (`Code.gs`)
- No major changes required as the existing `updateInventoryData` already handles an array of items and clears/rewrites the sheet.

## 5. Success Criteria
- User can add multiple rows of items.
- User can remove rows.
- All items are successfully saved to Google Sheets in one batch.
- W2 sees individual items as separate tasks (existing behavior preserved).
