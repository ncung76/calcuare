const SCRIPT_PROP = PropertiesService.getScriptProperties();

// Jalankan fungsi ini (setup) SEKALIGUS di editor Apps Script 
// dengan menekan tombol "Run" atau "Jalankan" untuk membuat struktur sheet awal.
function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  SCRIPT_PROP.setProperty("key", doc.getId());
  
  // 1. Setup Sheet 'Users'
  let usersSheet = doc.getSheetByName("Users");
  if (!usersSheet) {
    usersSheet = doc.insertSheet("Users");
  }
  
  // Jika kosong, buat header dan data default
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(["username", "password", "role"]);
    // Tambahkan user default pertama
    usersSheet.appendRow(["ncung", "crot", "admin"]);
  }
  
  // 2. Setup Sheet 'Projects'
  let projectsSheet = doc.getSheetByName("Projects");
  if (!projectsSheet) {
    projectsSheet = doc.insertSheet("Projects");
  }
  
  // Jika kosong, buat header
  if (projectsSheet.getLastRow() === 0) {
    projectsSheet.appendRow(["id", "name", "points", "date", "areaSqMeters", "perimeter", "unit", "shared", "owner_username"]);
  }
}

// Fungsi utama untuk menangani request GET (Login, dll)
function doGet(e) {
  // Tambahkan dukungan CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (!e || !e.parameter || !e.parameter.action) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Aksi tidak dimengerti." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action;
  
  if (action === 'login') {
    return handleLogin(e);
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: false, message: "Unknown action"}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Menangani OPTIONS (preflight CORS jika diakses via POST API di masa depan)
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
}

function handleLogin(e) {
  const username = e.parameter.username;
  const password = e.parameter.password;
  
  let key = SCRIPT_PROP.getProperty("key");
  if (!key) {
    key = SpreadsheetApp.getActiveSpreadsheet().getId();
    SCRIPT_PROP.setProperty("key", key);
  }
  
  const doc = SpreadsheetApp.openById(key);
  const sheet = doc.getSheetByName("Users");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({success: false, message: "Sheet 'Users' tidak ditemukan, jalankan fungsi setup() terlebih dahulu."}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) { // Belum ada data selain header
     return ContentService.createTextOutput(JSON.stringify({success: false, message: "Belum ada user terdaftar"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const headers = data[0];
  const usernameIdx = headers.indexOf("username");
  const passwordIdx = headers.indexOf("password");
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][usernameIdx]) === String(username) && String(data[i][passwordIdx]) === String(password)) {
      return ContentService.createTextOutput(JSON.stringify({success: true, message: "Login successful"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({success: false, message: "Username atau password salah"}))
    .setMimeType(ContentService.MimeType.JSON);
}
