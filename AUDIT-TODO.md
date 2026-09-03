# TRDAKRA — Audit & TODO (UPDATED)

**ตรวจเมื่อ:** 2026-09-03
**เวอร์ชันปัจจุบัน:** 20260902.01
**สถานะ:** [RESOLVED] ระบบทำงานบนสถาปัตยกรรม Supabase และผ่านชุดทดสอบทั้งหมด 100%

---

## 🟢 Point 1 — Security: Credential & Token Protection [RESOLVED]

**สถานะ:** แก้ไขแล้วและผ่านการตรวจสอบอย่างต่อเนื่อง
- ไม่มีการ Hardcode ของ Secrets, Service Keys, หรือ JWTs ในโค้ดฝั่ง Client (index.html)
- ระบบยืนยันตัวตนผ่าน Main SSO (v2) ด้วย Signed JWT และตรวจสิทธิ์ Server-side ใน Supabase Edge Function 	rd-api
- ฟังก์ชันบน Google Apps Script (Code.gs.txt) จัดการความลับผ่าน PropertiesService.getScriptProperties() ทั้งหมด

---

## 🟢 Point 2 — Architecture: Supabase Migration & Data Integrity [RESOLVED]

**สถานะ:** เสร็จสมบูรณ์ (แผน 20260830-003, 20260831-007, 20260902-001, 20260902-002)
- ย้ายฐานข้อมูลหลักเป็น Supabase PostgreSQL (	rd_product_locations, 	rd_inventory_requests, 	rd_survey_logs)
- โหลดและจัดการสินค้าทั้งหมด 1,838 รายการ โดยไม่มีการละเมิด Location Invariant (0 รายการใน Floor 5 / Zone 6)
- รองรับ Transactional Delta Mutation ทั้งรูปแบบ Object { inserts, updates, deletes } และ Array of Operations
- การแจ้งเตือนสรุปรายวันทาง LINE (Daily Dispatch & Stock Summary) ย้ายมาประมวลผลบน Edge Function 	rd-api แสดงผลด้วย Flex Message Cards และป้ายตำแหน่งภาษาไทย [📍 ชั้น X โซน Y]

---

## 🟢 Point 3 — Quality Assurance: Test Suites & Zero False Tests [RESOLVED]

**สถานะ:** ปรับปรุงแล้ว (แผน 20260903-003)
- ปรับปรุง 	ests/product-movement-report.test.js ให้รันการประมวลผลจริงของ computeProductMovementReportClient ใน 
ode:vm แทนที่การตรวจ Regex String ของ Google Apps Script ที่ล้าสมัย
- ขจัด Dead Code และ Prototype ชั่วคราวที่ถูก Deactivate ออกจาก Repository (js/supabase-trdakra-client.js และ 	ests/supabase-trdakra-test.js)
- ชุดทดสอบทั้ง 6 ไฟล์ผ่านการทดสอบ 100% ครอบคลุมทั้ง Static Hygiene, Syntax Parsing, Invariants, Delta Mutations, และ Business Workflows ทั้ง 7 โมดูล

---

## 🟡 Point 4 — Maintainability: Single-file index.html [DEFERRED / ARCHITECTURE BY DESIGN]

**สถานะ:** ชะลอการทำ (Deferred)
- ขนาดของไฟล์ index.html มีขนาด ~410 KB (~6,109 บรรทัด) ซึ่งเป็นโครงสร้างแบบ Single-file Web Application ตามมาตรฐานของระบบ
- มี Version Guard (AppVersionGuard) คอยควบคุมและป้องกันการใช้งานแคชเก่า จึงยังไม่มีความจำเป็นเร่งด่วนในการแยกไฟล์

---

## ⚠️ ข้อกำหนดในการพัฒนา

1. ห้าม Commit โค้ดที่มี Secrets หรือ Keys เข้า Git
2. ทุกครั้งที่มีการแก้โค้ด index.html ให้ Bump เวอร์ชันใน CURRENT_VERSION และ ersion.json ให้ตรงกันเสมอ
3. ไฟล์ Code.gs / Code.gs.txt จะต้องซิงค์ผ่าน Google Apps Script Console เท่านั้น
4. รันชุดทดสอบทั้งหมดในโฟลเดอร์ 	ests/ ให้ผ่าน 100% ก่อนทำการ Commit เสมอ
