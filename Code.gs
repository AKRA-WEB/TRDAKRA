// ==========================================
// 1. ตั้งค่าการเชื่อมต่อ Google Sheets
// ==========================================
const SHEET_ID = "1iUjCobjItCivwlpT2qmC-4ADG1jx1Z-TMLc7ETq_KKE";
const SHEET_NAME = "เบิกย้ายW1"; // ชีตสำหรับเก็บประวัติการเบิก
const PRODUCT_SHEET_NAME = "Product"; // ชีตฐานข้อมูลสินค้า

// ==========================================
// 2. รับ Request จากหน้าเว็บ (ดึงข้อมูล)
// ==========================================
function doGet(e) {
  // หากเข้าถึงผ่านเบราว์เซอร์ปกติโดยไม่มีพารามิเตอร์ ให้แสดงข้อความว่า API ทำงานอยู่
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("API is running.");
  }

  var action = e.parameter.action;

  // ถ้าเว็บขอ "รายชื่อสินค้า" เพื่อเอาไปทำช่องค้นหา
  if (action === 'getProducts') {
    var products = getProductList();
    return ContentService.createTextOutput(JSON.stringify(products))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ถ้าเว็บขอ "ประวัติการเบิกย้าย"
  if (action === 'getItems') {
    var data = getInventoryData();
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Fallback กรณีไม่ได้ระบุ action หรือระบุผิด
  var defaultData = getInventoryData();
  return ContentService.createTextOutput(JSON.stringify(defaultData))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. รับ Request จากหน้าเว็บ (บันทึกข้อมูล)
// ==========================================
function doPost(e) {
  try {
    var items = JSON.parse(e.postData.contents);
    var success = updateInventoryData(items);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', success: success }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===============================================
// 4. ฟังก์ชันดึง "รายชื่อสินค้า" จากชีต Product
// ===============================================
function getProductList() {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PRODUCT_SHEET_NAME);
    if (!sheet) return [];
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return [];

    // หาตำแหน่งคอลัมน์ของคำว่า "Product name"
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var nameColIndex = headers.indexOf("Product name");

    // ถ้าไม่เจอ ให้ใช้คอลัมน์ที่ 2 (คอลัมน์ B) เป็นค่าเริ่มต้น
    if (nameColIndex === -1) {
        nameColIndex = 1; 
    }
    
    var data = sheet.getRange(2, nameColIndex + 1, lastRow - 1, 1).getValues();
    var products = [];
    
    for (var i = 0; i < data.length; i++) {
      if (data[i][0]) {
        products.push(data[i][0].toString().trim());
      }
    }
    return products;
  } catch (error) { 
    return []; 
  }
}

// ===============================================
// 5. ฟังก์ชันจัดการข้อมูลการเบิกย้าย (ชีต เบิกย้ายW1)
// ===============================================
function getInventoryData() {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue; // ข้ามแถวที่ไม่มี ID
      result.push({
        id: data[i][0], 
        timestamp: data[i][1], 
        itemName: data[i][2], 
        requestQty: data[i][3],
        status: data[i][4], 
        oldExpiry: data[i][5] || 'ไม่ได้ระบุ', 
        newExpiry: data[i][6] || '',
        receiveQty: data[i][7] === '' ? null : data[i][7], 
        receiveNote: data[i][8] || '',
        w2Note: data[i][9] || '', // ดึงคอลัมน์ที่ 10 (J) หมายเหตุจากคลัง
        storageCapacity: data[i][10] || 0 // ดึงคอลัมน์ที่ 11 (K) ความจุหน้าร้าน
      });
    }
    return result.reverse(); // เรียงให้รายการใหม่สุดอยู่บน
  } catch (error) { 
    return []; 
  }
}

function updateInventoryData(items) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) return false;
    
    // ล้างข้อมูลเก่าออกทั้งหมด (ยกเว้นแถวที่ 1 ซึ่งเป็นหัวข้อ)
    if(sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    
    // เขียนข้อมูลใหม่ลงไป
    if (items && items.length > 0) {
      var itemsToSave = items.slice().reverse(); // พลิกกลับให้เก่าไปใหม่ตามปกติของตารางบน Sheet
      var rows = itemsToSave.map(function(item) {
        return [
          item.id, 
          item.timestamp, 
          item.itemName, 
          item.requestQty, 
          item.status, 
          item.oldExpiry, 
          item.newExpiry, 
          item.receiveQty, 
          item.receiveNote,
          item.w2Note || '', // บันทึกลงคอลัมน์ J
          item.storageCapacity || 0 // บันทึกลงคอลัมน์ K
        ];
      });
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    return true;
  } catch (error) { 
    return false; 
  }
}