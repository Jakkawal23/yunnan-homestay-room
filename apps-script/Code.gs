/**
 * ยูนนานโฮมสเตย์ — ปฏิทินห้องพักใน Google Sheet + API บอกห้องว่าง
 *
 * วางไฟล์นี้ใน Google Sheet: Extensions > Apps Script แล้วรัน setup() ครั้งเดียว
 * จากนั้น Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 * ลิงก์ /exec ที่ได้ เอาไปใส่ใน assets/config.js → urls.availabilityApi
 *
 * API ส่งออกเฉพาะ "ห้องไหนไม่ว่างช่วงไหน" ไม่มีชื่อ เบอร์ หรือยอดเงินของลูกค้า
 * อ่านรายละเอียดทั้งหมดใน docs/google-sheet.md และ docs/apps-script.md
 */

const TZ = 'Asia/Bangkok';
const TAB = { calendar: 'ปฏิทิน', bookings: 'การจอง', rooms: 'ห้องพัก', settings: 'ตั้งค่า', help: 'วิธีใช้' };
const CANCELLED = 'ยกเลิก';
const CLOSED = 'ปิดห้อง';
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const CAL_WEEKS = 6;
const CACHE_KEY = 'availability-v1';
const CACHE_SECONDS = 60;
const API_DAYS_AHEAD = 400;
const BOOKING_ROWS = 1000;

/* คอลัมน์แท็บ "การจอง" ตามลำดับ: [คีย์, หัวคอลัมน์, ความกว้าง, auto]
   โค้ดอ่านตามตำแหน่ง ห้ามสลับลำดับ ถ้าจะเพิ่มให้ต่อท้ายเท่านั้น
   auto = ระบบคำนวณหรือเติมให้ ทีมงานไม่ต้องกรอก */
const COLS = [
  ['id', 'เลขที่จอง', 110, true],
  ['room', 'ห้อง', 90],
  ['checkIn', 'เช็คอิน', 100],
  ['checkOut', 'เช็คเอาท์', 100],
  ['nights', 'คืน', 50, true],
  ['name', 'ชื่อผู้จอง', 150],
  ['phone', 'เบอร์โทร', 110],
  ['chatName', 'ชื่อ LINE / Facebook', 140],
  ['channel', 'ช่องทาง', 100],
  ['adults', 'ผู้ใหญ่', 60],
  ['children', 'เด็ก', 50],
  ['extraBeds', 'เตียงเสริม', 75],
  ['mookata', 'หมูกระทะ (ชุด)', 95],
  ['total', 'ยอดรวม (บาท)', 100],
  ['paid', 'ชำระแล้ว (บาท)', 105],
  ['balance', 'ค้างจ่าย (บาท)', 100, true],
  ['payStatus', 'สถานะเงิน', 100, true],
  ['status', 'สถานะการจอง', 110],
  ['payNote', 'การชำระ / หลักฐาน', 180],
  ['recorder', 'ผู้บันทึก', 90],
  ['note', 'หมายเหตุ', 220],
  ['createdAt', 'บันทึกเมื่อ', 130, true],
  ['mookataPrice', 'ค่าหมูกระทะ (บาท)', 110],
  ['mookataNote', 'หมายเหตุหมูกระทะ', 200],
  ['deposit', 'มัดจำ (บาท)', 100]
];
const C = {};
COLS.forEach(function (c, i) { C[c[0]] = i + 1; });

const SEED_ROOMS = [
  ['R1', 'ห้อง 1', 'ใช่', 'เตียงเดี่ยว 2 ท่าน', 1000],
  ['R2', 'ห้อง 2', 'ใช่', 'เตียงเดี่ยว 2 ท่าน', 1000],
  ['R3', 'ห้อง 3', 'ใช่', 'เตียงคู่ 4 ท่าน', 1500],
  ['R4', 'ห้อง 4', 'ใช่', 'เตียงคู่ 4 ท่าน', 1500],
  ['R5', 'ห้อง 5', 'ใช่', 'ห้องชั้น 1 ไม่มีหน้าต่าง', 1000]
];
const ROOM_PRICE_HEAD = 'ราคา/คืน (บาท)';
// ค่าในแท็บตั้งค่า (คอลัมน์ A = หัวข้อ, B = ค่า) ที่หลังบ้านใช้คำนวณยอด
const KEY_BED = 'ราคาเตียงเสริม/คืน';
const KEY_MOOKATA = 'ราคาหมูกระทะ/ชุด';
const KEY_BANK = 'บัญชีรับเงิน';
const SEED_LISTS = {
  channels: ['LINE', 'Facebook', 'โทรศัพท์', 'Walk-in', 'Agoda', 'Booking.com', 'อื่นๆ'],
  recorders: ['วาฬ', 'แบม', 'เหมยๆ', 'อื่นๆ'],
  statuses: ['จองแล้ว', 'เข้าพักแล้ว', CANCELLED, CLOSED]
};

const COLOR = {
  free: '#e3f1e7', freeText: '#2f6b45',
  wait: '#fdf0c8', waitText: '#7a5a00',
  deposit: '#fde0cc', depositText: '#8a3f12',
  paid: '#d7e7fb', paidText: '#1d4f91',
  closed: '#e5e5e5', closedText: '#555555',
  clash: '#f8c9c4', clashText: '#9b1c12',
  pine: '#1f4037', cream: '#f8f4ec', header: '#2f5d50', input: '#fff6d6'
};

// =====================================================================
// ติดตั้งชีต
// =====================================================================

/** รันครั้งเดียวตอนติดตั้ง (รันซ้ำได้ ข้อมูลการจองไม่หาย ปฏิทินจะถูกสร้างใหม่) */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetLocale('en_GB'); // พิมพ์วันที่แบบ วว/ดด/ปปปป แล้วชีตเข้าใจถูก
  ss.setSpreadsheetTimeZone(TZ);
  setupSettings_(ss);
  setupRooms_(ss);
  setupBookings_(ss);
  buildCalendar_(ss);
  setupHelp_(ss);
  [TAB.calendar, TAB.bookings, TAB.rooms, TAB.settings, TAB.help].forEach(function (name, i) {
    ss.setActiveSheet(ss.getSheetByName(name));
    ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(TAB.calendar));
  clearCache_();
  SpreadsheetApp.flush();
  toast_('ติดตั้งเรียบร้อย');
}

function setupSettings_(ss) {
  let sh = ss.getSheetByName(TAB.settings);
  if (sh) { ensureSettings_(sh); return sh; }
  sh = ss.insertSheet(TAB.settings);
  sh.getRange('A1:B1').setValues([['หัวข้อ', 'ค่า']]);
  sh.getRange('A2:B2').setValues([['มัดจำ (%)', 50]]);
  sh.getRange('A4').setValue('รายการในคอลัมน์ D–F ใช้เป็นตัวเลือก (dropdown) ในแท็บการจอง เพิ่ม/ลบได้');
  sh.getRange('D1:F1').setValues([['ช่องทางการจอง', 'ผู้บันทึก', 'สถานะการจอง']]);
  writeList_(sh, 4, SEED_LISTS.channels);
  writeList_(sh, 5, SEED_LISTS.recorders);
  writeList_(sh, 6, SEED_LISTS.statuses);
  sh.getRange('F7').setNote('ห้ามเปลี่ยนชื่อ "ยกเลิก" และ "ปิดห้อง" เพราะระบบใช้คำนี้คำนวณห้องว่าง');
  styleHeader_(sh.getRange('A1:B1'));
  styleHeader_(sh.getRange('D1:F1'));
  sh.getRange('B2').setBackground(COLOR.input);
  sh.getRange('A4').setFontColor('#6b7a73').setFontStyle('italic');
  sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 80); sh.setColumnWidth(3, 24);
  sh.setColumnWidths(4, 3, 140);
  sh.setFrozenRows(1);
  ensureSettings_(sh);
  return sh;
}

function ensureSettings_(sh) {
  ensurePin_(sh);
  ensureSetting_(sh, KEY_BED, 200, 'ราคาเตียงเสริมต่อเตียงต่อคืน ใช้คำนวณยอดในหลังบ้าน');
  ensureSetting_(sh, KEY_MOOKATA, 300, 'ราคาหมูกระทะต่อชุด ใช้คำนวณยอดในหลังบ้าน');
  ensureSetting_(sh, KEY_BANK, '', 'เลขบัญชีสำหรับโอนมัดจำ เช่น ธ.กสิกรไทย 123-4-56789-0 ชื่อบัญชี ... (แสดงบนบิล)', true);
  ensureListItem_(sh, 5, 'อื่นๆ');
}

function setupRooms_(ss) {
  let sh = ss.getSheetByName(TAB.rooms);
  if (sh) { ensureRoomPrices_(sh); return sh; }
  sh = ss.insertSheet(TAB.rooms);
  sh.getRange('A1:E1').setValues([['รหัสห้อง', 'ชื่อห้อง', 'เปิดให้จอง', 'หมายเหตุ', ROOM_PRICE_HEAD]]);
  sh.getRange(2, 1, SEED_ROOMS.length, 5).setValues(SEED_ROOMS);
  styleHeader_(sh.getRange('E1'));
  sh.getRange('E2:E50').setNumberFormat('#,##0');
  sh.getRange('E1').setNote('ราคาต่อคืน ใช้คำนวณยอดรวมอัตโนมัติในหลังบ้าน (แก้ยอดเองได้ในแต่ละการจอง)');
  sh.getRange('C2:C50').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['ใช่', 'ไม่'], true).setAllowInvalid(false).build());
  sh.getRange('A1').setNote('รหัสห้องต้องตรงกับ id ใน assets/config.js ของเว็บ (R1, R2, ...)');
  styleHeader_(sh.getRange('A1:D1'));
  sh.setColumnWidths(1, 3, 100); sh.setColumnWidth(4, 220);
  sh.setFrozenRows(1);
  return sh;
}

function setupBookings_(ss) {
  let sh = ss.getSheetByName(TAB.bookings);
  const isNew = !sh;
  if (isNew) sh = ss.insertSheet(TAB.bookings);
  if (sh.getMaxRows() < BOOKING_ROWS) sh.insertRowsAfter(sh.getMaxRows(), BOOKING_ROWS - sh.getMaxRows());
  if (sh.getMaxColumns() < COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), COLS.length - sh.getMaxColumns());

  const n = BOOKING_ROWS - 1;
  const col = function (k) { return sh.getRange(2, C[k], n, 1); };
  const L = function (k) { return letter_(C[k]); };

  // หัวคอลัมน์ (คอลัมน์คำนวณใช้สูตร ARRAYFORMULA ที่แถวหัว เพื่อไม่ให้ใครพิมพ์ทับ)
  COLS.forEach(function (c) { sh.getRange(1, C[c[0]]).setValue(c[1]); });
  const r = function (k) { return L(k) + '2:' + L(k); };
  const paid = 'IF(' + r('paid') + '="",0,' + r('paid') + ')';
  sh.getRange(1, C.nights).setFormula('={"คืน";ARRAYFORMULA(IF((' + r('checkIn') + '="")+(' + r('checkOut') + '=""),"",' +
    r('checkOut') + '-' + r('checkIn') + '))}');
  sh.getRange(1, C.balance).setFormula('={"ค้างจ่าย (บาท)";ARRAYFORMULA(IF(' + r('total') + '="","",' + r('total') + '-' + paid + '))}');
  sh.getRange(1, C.payStatus).setFormula('={"สถานะเงิน";ARRAYFORMULA(IF(' + r('room') + '="","",' +
    'IF(' + r('status') + '="' + CLOSED + '","' + CLOSED + '",' +
    'IF(' + r('status') + '="' + CANCELLED + '","' + CANCELLED + '",' +
    'IF(' + r('total') + '="","ยังไม่ใส่ยอด",' +
    'IF(' + paid + '>=' + r('total') + ',"ชำระครบ",' +
    'IF(' + paid + '>=IF(' + r('deposit') + '="",' + r('total') + '*\'' + TAB.settings + '\'!$B$2/100,' + r('deposit') + '),"มัดจำแล้ว",' +
    'IF(' + paid + '>0,"จ่ายบางส่วน","รอมัดจำ"))))))))}');

  // รูปแบบข้อมูล
  col('checkIn').setNumberFormat('dd/mm/yyyy');
  col('checkOut').setNumberFormat('dd/mm/yyyy');
  col('nights').setNumberFormat('0');
  col('phone').setNumberFormat('@');
  col('createdAt').setNumberFormat('@');
  ['total', 'paid', 'balance', 'mookataPrice', 'deposit'].forEach(function (k) { col(k).setNumberFormat('#,##0'); });

  // ตัวเลือกและการตรวจข้อมูล
  const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText('ใส่วันที่แบบ วว/ดด/ปปปป เช่น 25/12/2026 หรือดับเบิลคลิกเพื่อเลือกจากปฏิทิน').build();
  col('checkIn').setDataValidation(dateRule);
  col('checkOut').setDataValidation(dateRule);
  const settings = ss.getSheetByName(TAB.settings);
  const rooms = ss.getSheetByName(TAB.rooms);
  col('room').setDataValidation(listFrom_(rooms.getRange('B2:B50')));
  col('channel').setDataValidation(listFrom_(settings.getRange('D2:D50')));
  col('recorder').setDataValidation(listFrom_(settings.getRange('E2:E50')));
  col('status').setDataValidation(listFrom_(settings.getRange('F2:F50')));
  const numRule = SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false)
    .setHelpText('ใส่ตัวเลข 0 ขึ้นไป').build();
  ['adults', 'children', 'extraBeds', 'mookata', 'total', 'paid', 'mookataPrice', 'deposit'].forEach(function (k) { col(k).setDataValidation(numRule); });
  sh.getRange(1, C.total).setNote('ยอดที่ลูกค้าต้องจ่ายทั้งหมด รวมค่าห้อง เตียงเสริม และค่าหมูกระทะแล้ว');

  // หน้าตา
  styleHeader_(sh.getRange(1, 1, 1, COLS.length));
  sh.setRowHeight(1, 36);
  sh.getRange(1, 1, 1, COLS.length).setWrap(true).setVerticalAlignment('middle');
  COLS.forEach(function (c) {
    sh.setColumnWidth(C[c[0]], c[2]);
    if (c[3]) {
      sh.getRange(1, C[c[0]]).setBackground('#4f7468');
      col(c[0]).setBackground('#f3f6f4').setFontColor('#4a5751');
    }
  });
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.getRange(1, C.id).setNote('เติมให้อัตโนมัติเมื่อเลือกห้อง');
  sh.getRange(1, C.status).setNote('เว้นว่าง = จองแล้ว\n"ยกเลิก" = ไม่กันห้อง\n"ปิดห้อง" = ปิดซ่อม/ไม่รับแขก (ใส่แค่ห้องและวันที่)');
  sh.getRange(1, C.paid).setNote('ยอดที่ลูกค้าโอน/จ่ายมาแล้วทั้งหมด (รวมมัดจำ)');
  sh.getRange(1, C.deposit).setNote('ยอดมัดจำที่ต้องจ่าย เว้นว่าง = คิดจาก % ในแท็บตั้งค่า');

  // คอลัมน์คำนวณ: เตือนก่อนแก้
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === 'auto') p.remove();
  });
  COLS.filter(function (c) { return c[3] && c[0] !== 'id' && c[0] !== 'createdAt'; }).forEach(function (c) {
    sh.getRange(1, C[c[0]], BOOKING_ROWS, 1).protect().setDescription('auto').setWarningOnly(true);
  });

  // สีตามสถานะ + เตือนจองซ้อน
  const all = sh.getRange(2, 1, n, COLS.length);
  const ids = 'B2:D' + BOOKING_ROWS;
  const room = '$' + L('room'), ci = '$' + L('checkIn'), co = '$' + L('checkOut'), st = '$' + L('status');
  const clash = '=AND(' + room + '2<>"",' + ci + '2<>"",' + co + '2<>"",' + st + '2<>"' + CANCELLED + '",' +
    'COUNTIFS(' + room + '$2:' + room + ',' + room + '2,' + ci + '$2:' + ci + ',"<"&' + co + '2,' +
    co + '$2:' + co + ',">"&' + ci + '2,' + st + '$2:' + st + ',"<>' + CANCELLED + '")>1)';
  const pay = sh.getRange(2, C.payStatus, n, 1);
  const rules = [
    rule_(sh.getRange(ids), clash, COLOR.clash, COLOR.clashText),
    rule_(sh.getRange(2, C.checkIn, n, 2), '=AND(' + ci + '2<>"",' + co + '2<>"",' + co + '2<=' + ci + '2)', COLOR.clash, COLOR.clashText),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=' + st + '2="' + CANCELLED + '"')
      .setFontColor('#9aa39f').setStrikethrough(true).setRanges([all]).build(),
    textRule_(pay, 'ชำระครบ', COLOR.paid, COLOR.paidText),
    textRule_(pay, 'มัดจำแล้ว', COLOR.deposit, COLOR.depositText),
    textRule_(pay, 'รอมัดจำ', COLOR.wait, COLOR.waitText),
    textRule_(pay, 'จ่ายบางส่วน', COLOR.wait, COLOR.waitText),
    textRule_(pay, 'ยังไม่ใส่ยอด', COLOR.wait, COLOR.waitText),
    textRule_(pay, CLOSED, COLOR.closed, COLOR.closedText)
  ];
  sh.setConditionalFormatRules(rules);
  return sh;
}

// =====================================================================
// ปฏิทิน (ดูอย่างเดียว ทุกช่องเป็นสูตรที่ดึงจากแท็บการจอง)
// =====================================================================

function buildCalendar_(ss) {
  let sh = ss.getSheetByName(TAB.calendar);
  if (!sh) sh = ss.insertSheet(TAB.calendar, 0);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getDataRange().clearDataValidations();
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });

  const roomSheet = ss.getSheetByName(TAB.rooms);
  const roomCount = Math.max(1, roomSheet.getLastRow() - 1);
  const block = roomCount + 1;
  const firstWeekRow = 5;
  const lastRow = firstWeekRow + CAL_WEEKS * block + 2;
  if (sh.getMaxRows() < lastRow) sh.insertRowsAfter(sh.getMaxRows(), lastRow - sh.getMaxRows());
  if (sh.getMaxColumns() < 9) sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns());

  const bk = "'" + TAB.bookings + "'!";
  const B = function (k) { const l = letter_(C[k]); return bk + '$' + l + '$2:$' + l; };
  const now = new Date();

  // ส่วนหัว
  sh.getRange('A1:H1').merge().setValue('ปฏิทินห้องพัก · ยูนนานโฮมสเตย์')
    .setFontSize(14).setFontWeight('bold').setFontColor('#ffffff').setBackground(COLOR.pine);
  sh.getRange('A2').setValue('เดือน');
  sh.getRange('B2:C2').merge().setValue(MONTHS[Number(Utilities.formatDate(now, TZ, 'M')) - 1])
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(MONTHS, true).setAllowInvalid(false).build());
  sh.getRange('D2').setValue('ปี').setHorizontalAlignment('right');
  sh.getRange('E2').setValue(Number(Utilities.formatDate(now, TZ, 'yyyy'))).setNumberFormat('0')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(2020, 2100).setAllowInvalid(false).build());
  sh.getRange('B2:C2').setBackground(COLOR.input).setFontWeight('bold');
  sh.getRange('E2').setBackground(COLOR.input).setFontWeight('bold');
  sh.getRange('F2:H2').merge().setValue('← เปลี่ยนเดือน/ปีที่ช่องสีเหลือง').setFontColor('#6b7a73').setFontStyle('italic');
  sh.getRange('I2').setFormula('=DATE(E2,MATCH(B2,{"' + MONTHS.join('","') + '"},0),1)'); // วันที่ 1 ของเดือน (ซ่อน)
  sh.getRange('A3:H3').merge().setFormula('=B2&" "&E2')
    .setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center').setFontColor(COLOR.pine);
  sh.getRange('B4:H4').setValues([['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']])
    .setFontWeight('bold').setHorizontalAlignment('center').setBackground(COLOR.header).setFontColor('#ffffff');
  sh.getRange('A4').setBackground(COLOR.header);

  const dateRanges = [], roomRanges = [];
  for (let w = 0; w < CAL_WEEKS; w++) {
    const r0 = firstWeekRow + w * block;
    const dates = [], cells = [];
    for (let c = 0; c < 7; c++) dates.push('=$I$2-WEEKDAY($I$2)+1+' + (w * 7 + c));
    sh.getRange(r0, 2, 1, 7).setFormulas([dates]).setNumberFormat('d')
      .setFontWeight('bold').setBackground('#eef3f0').setHorizontalAlignment('left');
    sh.getRange(r0, 1).setBackground('#eef3f0');
    dateRanges.push(sh.getRange(r0, 2, 1, 7));
    for (let k = 0; k < roomCount; k++) {
      const rr = r0 + 1 + k, row = [];
      for (let c = 0; c < 7; c++) {
        const d = letter_(c + 2) + r0;
        row.push('=IF(MONTH(' + d + ')<>MONTH($I$2),"",IFERROR(LET(f,FILTER(ARRAYFORMULA(' +
          'IF(' + B('status') + '="' + CLOSED + '","⛔ ' + CLOSED + '",IF(' + B('checkIn') + '=' + d + ',"▶ ","")&' +
          B('name') + '&" · "&' + B('payStatus') + ')),' +
          B('room') + '=$A' + rr + ',' + B('checkIn') + '<=' + d + ',' + B('checkOut') + '>' + d + ',' +
          B('status') + '<>"' + CANCELLED + '"),' +
          'IF(ROWS(f)>1,"⚠ จองซ้อน: ","")&INDEX(f,1)),"ว่าง"))');
      }
      cells.push(row);
      sh.getRange(rr, 1).setFormula("='" + TAB.rooms + "'!B" + (k + 2));
    }
    const grid = sh.getRange(r0 + 1, 2, roomCount, 7);
    grid.setFormulas(cells).setFontSize(9).setWrap(true).setVerticalAlignment('middle');
    roomRanges.push(grid);
    sh.getRange(r0 + 1, 1, roomCount, 1).setFontSize(9).setFontColor('#4a5751');
    sh.getRange(r0, 1, block, 8).setBorder(true, true, true, true, true, true, '#d6dcd8', SpreadsheetApp.BorderStyle.SOLID);
  }

  // คำอธิบายสี
  const lg = firstWeekRow + CAL_WEEKS * block + 1;
  const legend = [['ว่าง', COLOR.free, COLOR.freeText], ['รอมัดจำ', COLOR.wait, COLOR.waitText],
    ['มัดจำแล้ว', COLOR.deposit, COLOR.depositText], ['ชำระครบ', COLOR.paid, COLOR.paidText],
    ['ปิดห้อง', COLOR.closed, COLOR.closedText], ['จองซ้อน', COLOR.clash, COLOR.clashText]];
  sh.getRange(lg, 1).setValue('สี:').setFontWeight('bold');
  legend.forEach(function (x, i) {
    sh.getRange(lg, i + 2).setValue(x[0]).setBackground(x[1]).setFontColor(x[2]).setHorizontalAlignment('center');
  });
  sh.getRange(lg + 1, 1, 1, 8).merge()
    .setValue('▶ = วันเช็คอิน · ปฏิทินนี้ดึงข้อมูลจากแท็บ "การจอง" อัตโนมัติ ห้ามพิมพ์ในช่องวัน (แก้ที่แท็บการจองเท่านั้น)')
    .setFontColor('#6b7a73').setFontSize(9);

  // สีอัตโนมัติ
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=B' + firstWeekRow + '=TODAY()')
      .setBackground('#c2643a').setFontColor('#ffffff').setRanges(dateRanges).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=MONTH(B' + firstWeekRow + ')<>MONTH($I$2)')
      .setFontColor('#c4c9c6').setRanges(dateRanges).build(),
    textRuleMany_(roomRanges, 'จองซ้อน', COLOR.clash, COLOR.clashText),
    textRuleMany_(roomRanges, CLOSED, COLOR.closed, COLOR.closedText),
    textRuleMany_(roomRanges, 'ชำระครบ', COLOR.paid, COLOR.paidText),
    textRuleMany_(roomRanges, 'มัดจำแล้ว', COLOR.deposit, COLOR.depositText),
    textRuleMany_(roomRanges, '·', COLOR.wait, COLOR.waitText),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ว่าง')
      .setBackground(COLOR.free).setFontColor(COLOR.freeText).setRanges(roomRanges).build()
  ];
  sh.setConditionalFormatRules(rules);

  // ขนาดและการล็อก
  sh.setColumnWidth(1, 64);
  sh.setColumnWidths(2, 7, 118);
  sh.hideColumns(9);
  sh.setFrozenRows(4);
  sh.protect().setDescription('ปฏิทิน (ดูอย่างเดียว)').setWarningOnly(true)
    .setUnprotectedRanges([sh.getRange('B2:C2'), sh.getRange('E2')]);
  return sh;
}

function setupHelp_(ss) {
  let sh = ss.getSheetByName(TAB.help);
  if (!sh) sh = ss.insertSheet(TAB.help);
  sh.clear();
  const lines = [
    ['วิธีใช้ชีตปฏิทินห้องพัก'],
    [''],
    ['1. บันทึกการจอง: ไปแท็บ "การจอง" แล้วกรอก 1 แถว = 1 ห้อง (จองหลายห้อง ให้กรอกหลายแถว ใส่ชื่อเดียวกัน)'],
    ['   ช่องที่ต้องกรอกอย่างน้อย: ห้อง · เช็คอิน · เช็คเอาท์ · ชื่อผู้จอง'],
    ['   วันที่พิมพ์แบบ วว/ดด/ปปปป (ค.ศ.) เช่น 25/12/2026 หรือดับเบิลคลิกช่องเพื่อเลือกจากปฏิทิน'],
    ['   เช็คเอาท์ = วันที่ลูกค้าออก (คืนสุดท้ายคือคืนก่อนหน้า) วันที่คนเก่าออก คนใหม่เข้าได้'],
    ['2. เงิน: ใส่ "ยอดรวม" และ "ชำระแล้ว" (ยอดที่จ่ายมาแล้วทั้งหมด) ระบบคำนวณค้างจ่ายและสถานะเงินให้'],
    ['   สถานะเงิน: รอมัดจำ → มัดจำแล้ว (จ่ายครบตาม % ในแท็บตั้งค่า) → ชำระครบ'],
    ['3. ยกเลิก: เลือกสถานะการจอง = "ยกเลิก" (ห้ามลบแถว เพื่อเก็บประวัติ) ห้องจะกลับเป็นว่าง'],
    ['4. ปิดห้อง (ซ่อม/ไม่รับแขก): กรอกห้อง + วันที่ แล้วเลือกสถานะ = "ปิดห้อง"'],
    ['5. ช่องสีเทา (เลขที่จอง คืน ค้างจ่าย สถานะเงิน บันทึกเมื่อ) ระบบเติมให้ ไม่ต้องกรอก'],
    ['   ยอดรวม = ยอดทั้งหมดที่ลูกค้าต้องจ่าย (รวมค่าหมูกระทะแล้ว) · หมูกระทะใส่จำนวนชุด ค่าหมูกระทะ และหมายเหตุได้ที่คอลัมน์ท้าย'],
    ['6. ถ้าแถวขึ้นสีแดง = ห้องนั้นจองซ้อนกับอีกแถว หรือวันเช็คเอาท์ไม่ถูกต้อง ให้ตรวจสอบทันที'],
    ['7. แท็บ "ปฏิทิน" ดูอย่างเดียว เปลี่ยนเดือน/ปีที่ช่องสีเหลือง'],
    [''],
    ['ลูกค้าเห็นอะไร: หน้าเว็บเช็คห้องว่างเห็นแค่ "ห้องไหนว่าง/ไม่ว่างวันไหน" ไม่เห็นชื่อ เบอร์ หรือยอดเงิน'],
    ['ข้อมูลบนเว็บอัปเดตภายใน 1 นาทีหลังแก้ชีต']
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  sh.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor(COLOR.pine);
  sh.setColumnWidth(1, 760);
  return sh;
}

// =====================================================================
// เมนู + เติมข้อมูลอัตโนมัติ
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏠 โฮมสเตย์')
    .addItem('ไปที่เดือนนี้', 'goToThisMonth')
    .addItem('เปิดหลังบ้าน (เว็บ)', 'showAdminLink')
    .addSeparator()
    .addItem('ติดตั้ง / ซ่อมชีต (setup)', 'setup')
    .addToUi();
  try { goToThisMonth(); } catch (err) { /* ยังไม่ได้ติดตั้ง */ }
}

/** ตั้งปฏิทินให้แสดงเดือนปัจจุบัน */
function goToThisMonth() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.calendar);
  if (!sh) return;
  const now = new Date();
  sh.getRange('B2').setValue(MONTHS[Number(Utilities.formatDate(now, TZ, 'M')) - 1]);
  sh.getRange('E2').setValue(Number(Utilities.formatDate(now, TZ, 'yyyy')));
}

/** เติมเลขที่จองและเวลาบันทึกให้แถวใหม่ + ล้างแคชให้เว็บเห็นข้อมูลล่าสุด */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() === TAB.bookings) stampRows_(sh, e.range.getRow(), e.range.getNumRows());
  } catch (err) { /* ไม่ให้การแก้ชีตล้มเพราะส่วนนี้ */ }
  clearCache_();
}

function stampRows_(sh, row, count) {
  const start = Math.max(2, row);
  const end = row + count - 1;
  if (end < start) return;
  const last = Math.max(2, sh.getLastRow());
  const ids = sh.getRange(2, C.id, last - 1, 1).getValues().map(function (r) { return String(r[0]); });
  const vals = sh.getRange(start, 1, end - start + 1, COLS.length).getValues();
  const prefix = 'YN' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-';
  let seq = nextSeq_(ids, prefix);
  const stamp = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
  vals.forEach(function (v, i) {
    if (!str_(v[C.room - 1])) return;
    if (!str_(v[C.id - 1])) sh.getRange(start + i, C.id).setValue(prefix + ('0' + seq++).slice(-2));
    if (!str_(v[C.createdAt - 1])) sh.getRange(start + i, C.createdAt).setValue(stamp);
  });
}

function nextSeq_(ids, prefix) {
  let max = 0;
  ids.forEach(function (x) { if (x.indexOf(prefix) === 0) max = Math.max(max, Number(x.slice(prefix.length)) || 0); });
  return max + 1;
}

// =====================================================================
// API ห้องว่าง (ลูกค้าเรียกผ่านหน้า check.html)
// =====================================================================

/**
 * GET .../exec            → JSON
 * GET .../exec?callback=f → JSONP (สำรองสำหรับเบราว์เซอร์ที่ fetch ไม่ได้)
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('หลังบ้าน · ยูนนานโฮมสเตย์')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }
  let out;
  try { out = availability_(); } catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  const json = JSON.stringify(out);
  if (p.callback && /^[A-Za-z_$][\w$.]*$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function availability_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const ss = SpreadsheetApp.getActive();
  const out = buildAvailability_(
    values_(ss.getSheetByName(TAB.rooms)),
    values_(ss.getSheetByName(TAB.bookings)),
    today_()
  );
  cache.put(CACHE_KEY, JSON.stringify(out), CACHE_SECONDS);
  return out;
}

/** แปลงข้อมูลชีตเป็นช่วงวันที่ไม่ว่างของแต่ละห้อง (ไม่มีข้อมูลส่วนตัว) */
function buildAvailability_(roomRows, bookingRows, today) {
  const rooms = [], closed = [], idOf = {};
  roomRows.slice(1).forEach(function (r) {
    const id = str_(r[0]), name = str_(r[1]);
    if (!id) return;
    idOf[id] = id;
    if (name) idOf[name] = id;
    rooms.push({ id: id, name: name || id });
    if (str_(r[2]) === 'ไม่') closed.push(id);
  });
  const limit = addDays_(today, API_DAYS_AHEAD);
  const busy = {};
  rooms.forEach(function (r) { busy[r.id] = []; });
  bookingRows.slice(1).forEach(function (r) {
    const id = idOf[str_(r[C.room - 1])];
    const ci = normDate_(r[C.checkIn - 1]), co = normDate_(r[C.checkOut - 1]);
    if (!id || !ci || !co || co <= ci) return;
    if (str_(r[C.status - 1]) === CANCELLED) return;
    if (co <= today || ci >= limit) return;
    busy[id].push([ci, co]);
  });
  Object.keys(busy).forEach(function (id) { busy[id] = mergeRanges_(busy[id]); });
  return {
    ok: true,
    today: today,
    updatedAt: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'),
    rooms: rooms,
    closed: closed,
    busy: busy
  };
}

function mergeRanges_(list) {
  list.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  const out = [];
  list.forEach(function (x) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1]) { if (x[1] > last[1]) last[1] = x[1]; } else out.push([x[0], x[1]]);
  });
  return out;
}

// =====================================================================
// หลังบ้าน (Admin.html) — เปิดที่ .../exec?page=admin
// ทุกฟังก์ชันที่หน้าเว็บเรียกได้ ต้องเรียก auth_(pin) ก่อนเสมอ
// งานเขียนทุกงานอยู่ใน withLock_() กันสองคนบันทึกพร้อมกัน
// ตรรกะ payStatus_ / findConflict_ มีสำเนาใน Admin.html ถ้าแก้ต้องแก้ทั้งสองที่
// =====================================================================

const PIN_KEY = 'รหัสเข้าหลังบ้าน';
const DEFAULT_PIN = '1234';
const FORMULA_KEYS = ['nights', 'balance', 'payStatus']; // คอลัมน์สูตร ห้ามเขียนทับ
const PIN_FAIL_KEY = 'pin-fail';
const PIN_MAX_FAIL = 10;

/** เข้าสู่ระบบ + โหลดการจองทั้งหมด (หน้าเว็บใช้ทั้งตอนล็อกอินและกดโหลดใหม่) */
function adminData(pin) {
  auth_(pin);
  return withLock_(function () {
    const sh = SpreadsheetApp.getActive().getSheetByName(TAB.bookings);
    const last = lastDataRow_(sh);
    if (last >= 2) stampRows_(sh, 2, last - 1); // แถวที่กรอกในชีตแต่ยังไม่มีเลขที่จอง
    return { meta: meta_(), bookings: readBookings_(sh) };
  });
}

/** เพิ่มหรือแก้การจอง  b.row ว่าง = เพิ่มใหม่ */
function saveBooking(pin, input) {
  auth_(pin);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(TAB.bookings);
    const meta = meta_();
    const b = cleanBooking_(input, meta);
    const all = readBookings_(sh);
    let row = 0;
    if (b.id) {
      row = findRow_(sh, b.id, b.row);
      if (!row) throw new Error('ไม่พบการจองเลขที่ ' + b.id + ' (อาจถูกลบในชีต) กดโหลดใหม่แล้วลองอีกครั้ง');
    }
    const clash = findConflict_(b, all, row);
    if (clash) throw new Error(conflictText_(clash));
    if (!row) {
      row = lastDataRow_(sh) + 1;
      if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
      const ids = sh.getRange(2, C.id, Math.max(1, row - 2), 1).getValues().map(function (r) { return String(r[0]); });
      const prefix = 'YN' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-';
      b.id = prefix + ('0' + nextSeq_(ids, prefix)).slice(-2);
      b.createdAt = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
    } else {
      b.createdAt = str_(sh.getRange(row, C.createdAt).getValue()) || Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
    }
    writeBooking_(sh, row, b);
    clearCache_();
    SpreadsheetApp.flush();
    return { savedId: b.id, bookings: readBookings_(sh) };
  });
}

/** รับเงินเพิ่ม: บวกยอดชำระแล้ว และจดลงช่อง "การชำระ / หลักฐาน" */
function addPayment(pin, p) {
  auth_(pin);
  return withLock_(function () {
    const sh = SpreadsheetApp.getActive().getSheetByName(TAB.bookings);
    const row = findRow_(sh, str_(p && p.id), Number(p && p.row) || 0);
    if (!row) throw new Error('ไม่พบการจองนี้ กดโหลดใหม่แล้วลองอีกครั้ง');
    const amount = Math.round(Number(p.amount));
    if (!(amount > 0)) throw new Error('ใส่จำนวนเงินมากกว่า 0');
    const paid = Number(sh.getRange(row, C.paid).getValue()) || 0;
    const old = str_(sh.getRange(row, C.payNote).getValue());
    const line = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy') + ' รับ ' + amount.toLocaleString('en-US') + ' บาท' +
      (str_(p.method) ? ' (' + str_(p.method).slice(0, 40) + ')' : '') + (str_(p.by) ? ' · ' + str_(p.by).slice(0, 40) : '');
    sh.getRange(row, C.paid).setValue(paid + amount);
    sh.getRange(row, C.payNote).setValue(old ? old + '\n' + line : line);
    SpreadsheetApp.flush();
    return { savedId: str_(p.id), bookings: readBookings_(sh) };
  });
}

/** เปลี่ยนสถานะการจอง (เช่น เข้าพักแล้ว / ยกเลิก) */
function setBookingStatus(pin, id, row, status) {
  auth_(pin);
  return withLock_(function () {
    const sh = SpreadsheetApp.getActive().getSheetByName(TAB.bookings);
    const meta = meta_();
    status = str_(status);
    if (status && meta.statuses.indexOf(status) < 0) throw new Error('ไม่มีสถานะ "' + status + '"');
    const r = findRow_(sh, str_(id), Number(row) || 0);
    if (!r) throw new Error('ไม่พบการจองนี้ กดโหลดใหม่แล้วลองอีกครั้ง');
    const all = readBookings_(sh);
    const me = all.filter(function (x) { return x.row === r; })[0];
    if (me && me.status === CANCELLED && status !== CANCELLED) {
      const clash = findConflict_(Object.assign({}, me, { status: status }), all, r);
      if (clash) throw new Error('เปิดการจองนี้คืนไม่ได้ เพราะ' + conflictText_(clash));
    }
    sh.getRange(r, C.status).setValue(status);
    clearCache_();
    SpreadsheetApp.flush();
    return { savedId: str_(id), bookings: readBookings_(sh) };
  });
}

/** เมนูในชีต: แสดงลิงก์หลังบ้าน */
function showAdminLink() {
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (err) { /* ยังไม่ได้ deploy */ }
  const html = url
    ? '<p style="font-family:sans-serif">ลิงก์หลังบ้าน:</p><p><a href="' + url + '?page=admin" target="_blank" style="font-family:sans-serif;font-size:16px">' +
      url + '?page=admin</a></p><p style="font-family:sans-serif;color:#666;font-size:13px">ถ้าลิงก์นี้ใช้ไม่ได้ ให้ใช้ลิงก์ /exec ที่ได้ตอน Deploy แล้วต่อท้ายด้วย ?page=admin</p>'
    : '<p style="font-family:sans-serif">ยังไม่ได้ Deploy เป็น Web app ดูวิธีใน docs/apps-script.md</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(180), 'หลังบ้าน');
}

// ---------------- ตัวช่วยของหลังบ้าน ----------------

function auth_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get(PIN_FAIL_KEY)) || 0;
  if (fails >= PIN_MAX_FAIL) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
  const real = getPin_();
  if (!real) throw new Error('ยังไม่ได้ตั้ง "' + PIN_KEY + '" ในแท็บตั้งค่า');
  if (str_(pin) !== real) {
    cache.put(PIN_FAIL_KEY, String(fails + 1), 600);
    throw new Error('รหัสไม่ถูกต้อง');
  }
}

function getPin_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.settings);
  if (!sh) return '';
  const v = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 2).getValues();
  for (let i = 0; i < v.length; i++) if (str_(v[i][0]) === PIN_KEY) return str_(v[i][1]);
  return '';
}

/** เพิ่มแถว "รหัสเข้าหลังบ้าน" ในแท็บตั้งค่า ถ้ายังไม่มี (ชีตที่ติดตั้งก่อนมีหลังบ้าน) */
function ensurePin_(sh) {
  ensureSetting_(sh, PIN_KEY, DEFAULT_PIN, 'รหัสเข้าหน้าเว็บหลังบ้าน (.../exec?page=admin) ค่าเริ่มต้น 1234 กรุณาเปลี่ยน', true);
}

/** เพิ่มแถว หัวข้อ/ค่า ในแท็บตั้งค่า ถ้ายังไม่มี (ไม่ทับค่าเดิม) */
function ensureSetting_(sh, key, value, note, asText) {
  const v = sh.getRange(1, 1, Math.max(3, sh.getLastRow()), 2).getValues();
  for (let i = 0; i < v.length; i++) if (str_(v[i][0]) === key) return;
  let row = 3;
  while (str_(sh.getRange(row, 1).getValue())) row++;
  if (asText) sh.getRange(row, 2).setNumberFormat('@');
  sh.getRange(row, 1, 1, 2).setValues([[key, value]]);
  sh.getRange(row, 2).setBackground(COLOR.input).setNote(note);
}

/** อ่านค่าในแท็บตั้งค่าจากหัวข้อ */
function getSetting_(key) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.settings);
  if (!sh) return '';
  const v = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 2).getValues();
  for (let i = 0; i < v.length; i++) if (str_(v[i][0]) === key) return v[i][1];
  return '';
}

/** แท็บห้องพักที่สร้างก่อนมีราคา: เพิ่มหัวคอลัมน์ E และเติมราคาตั้งต้นในช่องที่ว่าง */
function ensureRoomPrices_(sh) {
  if (str_(sh.getRange('E1').getValue())) return;
  sh.getRange('E1').setValue(ROOM_PRICE_HEAD);
  styleHeader_(sh.getRange('E1'));
  const last = Math.max(2, sh.getLastRow());
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  ids.forEach(function (r, i) {
    const seed = SEED_ROOMS.filter(function (x) { return x[0] === str_(r[0]); })[0];
    if (seed && !str_(sh.getRange(i + 2, 5).getValue())) sh.getRange(i + 2, 5).setValue(seed[4]);
  });
}

/** เพิ่มตัวเลือกในรายการ (คอลัมน์ col ของแท็บตั้งค่า) ถ้ายังไม่มี */
function ensureListItem_(sh, col, item) {
  const v = sh.getRange(2, col, Math.max(1, sh.getLastRow()), 1).getValues().map(function (r) { return str_(r[0]); });
  if (v.indexOf(item) >= 0) return;
  let i = v.length;
  while (i > 0 && !v[i - 1]) i--;
  sh.getRange(i + 2, col).setValue(item);
}

function meta_() {
  const ss = SpreadsheetApp.getActive();
  const rooms = values_(ss.getSheetByName(TAB.rooms)).slice(1)
    .filter(function (r) { return str_(r[1]); })
    .map(function (r) { return { id: str_(r[0]), name: str_(r[1]), active: str_(r[2]) !== 'ไม่', price: Number(r[4]) || 0 }; });
  const set = ss.getSheetByName(TAB.settings);
  const v = values_(set);
  const list = function (col) {
    return v.slice(1).map(function (r) { return str_(r[col]); }).filter(Boolean);
  };
  return {
    rooms: rooms,
    channels: list(3),
    recorders: list(4),
    statuses: list(5),
    depositPct: Number(set.getRange('B2').getValue()) || 0,
    extraBedPrice: Number(getSetting_(KEY_BED)) || 0,
    mookataPrice: Number(getSetting_(KEY_MOOKATA)) || 0,
    bankInfo: str_(getSetting_(KEY_BANK)),
    pinIsDefault: getPin_() === DEFAULT_PIN,
    sheetUrl: ss.getUrl(),
    today: today_()
  };
}

function readBookings_(sh) {
  const last = lastDataRow_(sh);
  if (last < 2) return [];
  const dep = Number(SpreadsheetApp.getActive().getSheetByName(TAB.settings).getRange('B2').getValue()) || 0;
  return sh.getRange(2, 1, last - 1, COLS.length).getValues()
    .map(function (r, i) { return bookingFromRow_(r, i + 2, dep); })
    .filter(function (b) { return b.room; });
}

/** แถวในชีต → ออบเจกต์ (วันที่เป็น yyyy-MM-dd) */
function bookingFromRow_(r, row, depositPct) {
  const g = function (k) { return r[C[k] - 1]; };
  const num = function (k) { const x = g(k); return x === '' || x === null ? '' : Number(x) || 0; };
  const b = {
    row: row, id: str_(g('id')), room: str_(g('room')),
    checkIn: normDate_(g('checkIn')), checkOut: normDate_(g('checkOut')),
    name: str_(g('name')), phone: str_(g('phone')), chatName: str_(g('chatName')), channel: str_(g('channel')),
    adults: num('adults'), children: num('children'), extraBeds: num('extraBeds'), mookata: num('mookata'),
    mookataPrice: num('mookataPrice'), mookataNote: str_(g('mookataNote')), deposit: num('deposit'),
    total: num('total'), paid: num('paid'),
    status: str_(g('status')), payNote: str_(g('payNote')), recorder: str_(g('recorder')),
    note: str_(g('note')), createdAt: str_(g('createdAt'))
  };
  b.nights = b.checkIn && b.checkOut ? Math.round((parseIso_(b.checkOut) - parseIso_(b.checkIn)) / 864e5) : '';
  b.balance = b.total === '' ? '' : b.total - (Number(b.paid) || 0);
  b.payStatus = payStatus_(b, depositPct);
  return b;
}

/** สถานะเงิน (ต้องตรงกับสูตรคอลัมน์ Q ในชีต และ payStatus ใน Admin.html) */
function payStatus_(b, depositPct) {
  if (b.status === CLOSED) return CLOSED;
  if (b.status === CANCELLED) return CANCELLED;
  if (b.total === '' || b.total === null) return 'ยังไม่ใส่ยอด';
  const paid = Number(b.paid) || 0, total = Number(b.total) || 0;
  if (paid >= total) return 'ชำระครบ';
  const dep = b.deposit === '' || b.deposit === null || b.deposit === undefined ? total * depositPct / 100 : Number(b.deposit) || 0;
  if (paid >= dep) return 'มัดจำแล้ว';
  return paid > 0 ? 'จ่ายบางส่วน' : 'รอมัดจำ';
}

/** หาการจองที่ชนกับ b (ห้องเดียวกัน คืนทับกัน ไม่นับที่ยกเลิก และไม่นับแถวตัวเอง) */
function findConflict_(b, all, selfRow) {
  if (b.status === CANCELLED) return null;
  for (let i = 0; i < all.length; i++) {
    const x = all[i];
    if (x.row === selfRow || x.status === CANCELLED || x.room !== b.room) continue;
    if (!x.checkIn || !x.checkOut) continue;
    if (b.checkIn < x.checkOut && b.checkOut > x.checkIn) return x;
  }
  return null;
}

function conflictText_(x) {
  const fmt = function (iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  return x.room + ' ถูกจองแล้วช่วง ' + fmt(x.checkIn) + ' – ' + fmt(x.checkOut) +
    (x.status === CLOSED ? ' (ปิดห้อง)' : ' (' + (x.name || 'ไม่มีชื่อ') + (x.id ? ' · ' + x.id : '') + ')');
}

/** ตรวจและทำความสะอาดข้อมูลจากหน้าเว็บ (ไม่เชื่อข้อมูลจากหน้าเว็บ) */
function cleanBooking_(x, meta) {
  x = x || {};
  const s = function (k, max) { return str_(x[k]).slice(0, max || 200); };
  const n = function (k, label) {
    const v = str_(x[k]);
    if (v === '') return '';
    const num = Number(v);
    if (!isFinite(num) || num < 0) throw new Error(label + ' ต้องเป็นตัวเลข 0 ขึ้นไป');
    return Math.round(num);
  };
  const iso = function (k, label) {
    const v = str_(x[k]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || fmtIso_(parseIso_(v)) !== v) throw new Error('กรุณาใส่' + label + 'ให้ถูกต้อง (วว/ดด/ปปปป)');
    return v;
  };
  const b = {
    row: Number(x.row) || 0, id: s('id', 30),
    room: s('room'), checkIn: iso('checkIn', 'วันเช็คอิน'), checkOut: iso('checkOut', 'วันเช็คเอาท์'),
    name: s('name'), phone: s('phone', 40), chatName: s('chatName'), channel: s('channel'),
    adults: n('adults', 'ผู้ใหญ่'), children: n('children', 'เด็ก'), extraBeds: n('extraBeds', 'เตียงเสริม'), mookata: n('mookata', 'หมูกระทะ'),
    mookataPrice: n('mookataPrice', 'ค่าหมูกระทะ'), mookataNote: s('mookataNote', 500), deposit: n('deposit', 'มัดจำ'),
    total: n('total', 'ยอดรวม'), paid: n('paid', 'ชำระแล้ว'),
    status: s('status'), payNote: s('payNote', 2000), recorder: s('recorder'), note: s('note', 2000)
  };
  if (!meta.rooms.some(function (r) { return r.name === b.room; })) throw new Error('กรุณาเลือกห้อง');
  if (b.checkOut <= b.checkIn) throw new Error('วันเช็คเอาท์ต้องหลังวันเช็คอิน');
  if (b.status !== CLOSED) { // ข้อมูลที่ต้องใช้ในข้อความยืนยันการจอง
    if (!b.name) throw new Error('กรุณาใส่ชื่อผู้จอง');
    if (!b.phone) throw new Error('กรุณาใส่เบอร์โทร');
    if (!(b.adults > 0)) throw new Error('กรุณาใส่จำนวนผู้ใหญ่');
    if (b.total === '') throw new Error('กรุณาใส่ยอดรวม');
  }
  if (b.deposit !== '' && b.total !== '' && b.deposit > b.total) throw new Error('มัดจำต้องไม่มากกว่ายอดรวม');
  if (b.channel && meta.channels.indexOf(b.channel) < 0) throw new Error('ไม่มีช่องทาง "' + b.channel + '" ในแท็บตั้งค่า');
  if (b.recorder && meta.recorders.indexOf(b.recorder) < 0) throw new Error('ไม่มีผู้บันทึก "' + b.recorder + '" ในแท็บตั้งค่า');
  if (b.status && meta.statuses.indexOf(b.status) < 0) throw new Error('ไม่มีสถานะ "' + b.status + '" ในแท็บตั้งค่า');
  return b;
}

/** เขียนแถว โดยข้ามคอลัมน์สูตร (เขียนทับแล้ว ARRAYFORMULA จะพัง) */
function writeBooking_(sh, row, b) {
  const val = function (k) {
    if (k === 'checkIn' || k === 'checkOut') return Utilities.parseDate(b[k], TZ, 'yyyy-MM-dd');
    return b[k] === undefined || b[k] === null ? '' : b[k];
  };
  writeSegments_(COLS.map(function (c) { return c[0]; }), FORMULA_KEYS).forEach(function (seg) {
    sh.getRange(row, C[seg[0]], 1, seg.length).setValues([seg.map(val)]);
  });
}

/** แบ่งคอลัมน์เป็นช่วงติดกันที่ไม่ใช่คอลัมน์สูตร เช่น [[id,room,checkIn,checkOut],[name..paid],[status..createdAt]] */
function writeSegments_(keys, skip) {
  const out = [];
  let cur = [];
  keys.forEach(function (k) {
    if (skip.indexOf(k) >= 0) { if (cur.length) out.push(cur); cur = []; } else cur.push(k);
  });
  if (cur.length) out.push(cur);
  return out;
}

/** แถวสุดท้ายที่มีข้อมูลจริง (ดูคอลัมน์เลขที่จอง ห้อง วันที่ ชื่อ ไม่นับคอลัมน์สูตร) */
function lastDataRow_(sh) {
  const n = sh.getMaxRows() - 1;
  if (n < 1) return 1;
  const v = sh.getRange(2, 1, n, C.name).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (str_(v[i][C.id - 1]) || str_(v[i][C.room - 1]) || str_(v[i][C.checkIn - 1]) || str_(v[i][C.name - 1])) return i + 2;
  }
  return 1;
}

/** หาแถวจากเลขที่จอง (ลองแถวที่หน้าเว็บส่งมาก่อน เผื่อมีคนเรียงชีตใหม่) */
function findRow_(sh, id, hint) {
  if (!id) return 0;
  if (hint >= 2 && hint <= sh.getMaxRows() && str_(sh.getRange(hint, C.id).getValue()) === id) return hint;
  const last = lastDataRow_(sh);
  if (last < 2) return 0;
  const ids = sh.getRange(2, C.id, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (str_(ids[i][0]) === id) return i + 2;
  return 0;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function parseIso_(s) { const p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function fmtIso_(d) { return d.toISOString().slice(0, 10); }

// =====================================================================
// ตัวช่วย
// =====================================================================

function values_(sh) { return sh ? sh.getDataRange().getValues() : [[]]; }
function clearCache_() { try { CacheService.getScriptCache().remove(CACHE_KEY); } catch (err) { /* ข้าม */ } }
function toast_(msg) { try { SpreadsheetApp.getActive().toast(msg, 'ยูนนานโฮมสเตย์', 5); } catch (err) { /* ข้าม */ } }
function str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** รับ Date / yyyy-MM-dd / dd/MM/yyyy (ปี พ.ศ. จะลบ 543) แล้วคืนค่า yyyy-MM-dd */
function normDate_(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = str_(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return '';
  if (y > 2400) y -= 543;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

function addDays_(iso, n) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

function letter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function writeList_(sh, col, items) {
  sh.getRange(2, col, items.length, 1).setValues(items.map(function (x) { return [x]; }));
}

function listFrom_(range) {
  return SpreadsheetApp.newDataValidation().requireValueInRange(range, true).setAllowInvalid(false).build();
}

function styleHeader_(range) {
  range.setBackground(COLOR.header).setFontColor('#ffffff').setFontWeight('bold');
}

function rule_(range, formula, bg, fg) {
  return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
    .setBackground(bg).setFontColor(fg).setRanges([range]).build();
}

function textRule_(range, text, bg, fg) { return textRuleMany_([range], text, bg, fg); }

function textRuleMany_(ranges, text, bg, fg) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextContains(text)
    .setBackground(bg).setFontColor(fg).setRanges(ranges).build();
}
