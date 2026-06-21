# TRDAKRA — Audit & TODO (UPDATED)

**ตรวจเมื่อ:** 2026-06-04
**อัปเดตสถานะเมื่อ:** 2026-06-21
**สถานะ:** [RESOLVED] ปัญหาหลักทั้งหมดได้รับการแก้ไขและยืนยันผลการทำงานบนระบบจริงแล้ว

---

## 🔴 Point 1 — Security: LINE token hardcode [RESOLVED]

**สถานะ:** แก้ไขแล้ว (ตาม Conductor Plan `20260612-001`)
- ย้าย LINE Token และ Group ID ทั้งหมดออกจาก Source Code ไปเก็บไว้ใน Script Properties เรียบร้อยแล้ว
- ดึงค่าผ่าน `PropertiesService.getScriptProperties()` และป้องกันความเสี่ยงในการทำกุญแจหลุดไปยัง Git remote

---

## 🟠 Point 2 — Correctness: frontend ไม่เช็ค response จาก backend [RESOLVED]

**สถานะ:** แก้ไขแล้ว (ตาม Conductor Plan `20260612-002` และ `20260612-006`)
- ปรับปรุงฟังก์ชัน `pushProductDetails`, `pushProductDetailsBatch`, `syncDataToSheet` และจุดอื่นๆ ใน frontend ให้ตรวจสถานะของ API response เสมอ
- หากเกิด error ฝั่งเซิร์ฟเวอร์ หน้าเว็บจะแสดง Alert พร้อมระงับการเปลี่ยนสถานะหรือเคลียร์ข้อมูล เพื่อป้องกัน Data desync

---

## 🟡 Point 3 — Maintainability: index.html ใหญ่ [DEFERRED]

**สถานะ:** ชะลอการทำ (Deferred)
- ขนาดของไฟล์ `index.html` มีขนาดค่อนข้างใหญ่ แต่การจัดรูปแบบเป็นไปตามโครงสร้างแบบ Single-file ของระบบปัจจุบัน จึงยังไม่มีความจำเป็นเร่งด่วนในการทำ refactor หากไม่มีฟีเจอร์ใหม่ขนาดใหญ่เข้ามาเพิ่ม

---

## ⚠️ คำเตือนความปลอดภัย

1. ห้าม Commit โค้ดหรือ Secrets เข้า Git
2. ทุกครั้งที่มีการแก้โค้ด `index.html` ให้ทำตามขั้นตอนการ Bump เวอร์ชันคู่กับ `version.json` เสมอ
3. ไฟล์ `Code.gs` / `Code.gs.txt` จะต้องอยู่ในสถานะ Git-ignored และนำไปอัปเดตผ่าน Google Apps Script Console เท่านั้น

