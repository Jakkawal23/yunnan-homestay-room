// ทดสอบฟังก์ชันหลังบ้านใน apps-script/Code.gs กับ Google Sheet จำลองในหน่วยความจำ
// และตรวจกฎของ apps-script/Admin.html
// รัน:  node tests/admin.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TZ_OFFSET = 7 * 3600 * 1000;
let cache = {};
let book, settings, rooms, written;

// ---------- ชีตจำลอง ----------
function makeSheet(name, nRows, nCols) {
  const data = Array.from({ length: nRows }, () => new Array(nCols).fill(''));
  const sh = {
    name, data,
    getName: () => name,
    getMaxRows: () => data.length,
    getLastRow: () => { for (let i = data.length - 1; i >= 0; i--) if (data[i].some(v => v !== '')) return i + 1; return 0; },
    insertRowsAfter: (after, n) => { for (let i = 0; i < n; i++) data.push(new Array(nCols).fill('')); },
    getRange(r, c, nr, nc) {
      if (typeof r === 'string') { // แบบ 'B2'
        const m = /^([A-Z]+)(\d+)$/.exec(r);
        c = [...m[1]].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0); r = Number(m[2]);
      }
      nr = nr || 1; nc = nc || 1;
      const rg = {
        getValues: () => data.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)),
        getValue: () => data[r - 1][c - 1],
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; if (sh === book) written.add(c + j); })); return rg; },
        setValue(x) { return rg.setValues([[x]]); },
        setNumberFormat: () => rg, setBackground: () => rg, setNote: () => rg, setFontColor: () => rg, setFontWeight: () => rg
      };
      return rg;
    },
    getDataRange() { return sh.getRange(1, 1, Math.max(1, sh.getLastRow()), nCols); }
  };
  return sh;
}

const ctx = {
  console,
  Utilities: {
    formatDate(d, tz, fmt) {
      const b = new Date(d.getTime() + TZ_OFFSET);
      const p = n => String(n).padStart(2, '0');
      const map = { yyyy: b.getUTCFullYear(), yy: p(b.getUTCFullYear() % 100), MM: p(b.getUTCMonth() + 1), M: b.getUTCMonth() + 1,
        dd: p(b.getUTCDate()), HH: p(b.getUTCHours()), mm: p(b.getUTCMinutes()) };
      return fmt.replace(/yyyy|yy|MM|M|dd|HH|mm/g, k => map[k]);
    },
    parseDate(s) { const p = s.split('-').map(Number); return new ctx.Date(Date.UTC(p[0], p[1] - 1, p[2]) - TZ_OFFSET); }
  },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: {}, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  SpreadsheetApp: {
    flush() {},
    getActive: () => ({
      getSheetByName: n => ({ 'การจอง': book, 'ตั้งค่า': settings, 'ห้องพัก': rooms })[n] || null,
      getUrl: () => 'https://docs.google.com/spreadsheets/d/test'
    })
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8') +
  '\n;Object.assign(this, { COLS, C, PIN_FAIL_KEY, FORMULA_KEYS });', ctx);
ctx.Date = vm.runInContext('Date', ctx);
const G = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const d = (y, m, day) => new ctx.Date(Date.UTC(y, m - 1, day) - TZ_OFFSET);

function reset() {
  cache = {};
  written = new Set();
  book = makeSheet('การจอง', 20, G.COLS.length);
  book.data[0] = G.COLS.map(c => c[1]);
  settings = makeSheet('ตั้งค่า', 10, 6);
  settings.data[0] = ['หัวข้อ', 'ค่า', '', 'ช่องทางการจอง', 'ผู้บันทึก', 'สถานะการจอง'];
  settings.data[1] = ['มัดจำ (%)', 50, '', 'LINE', 'วาฬ', 'จองแล้ว'];
  settings.data[2] = ['รหัสเข้าหลังบ้าน', '4321', '', 'Facebook', 'แบม', 'เข้าพักแล้ว'];
  settings.data[3] = ['', '', '', '', '', 'ยกเลิก'];
  settings.data[4] = ['', '', '', '', '', 'ปิดห้อง'];
  rooms = makeSheet('ห้องพัก', 8, 5);
  rooms.data[0] = ['รหัสห้อง', 'ชื่อห้อง', 'เปิดให้จอง', 'หมายเหตุ', ''];
  rooms.data[1] = ['R1', 'ห้อง 1', 'ใช่', '', ''];
  rooms.data[2] = ['R2', 'ห้อง 2', 'ใช่', '', ''];
  // การจองเดิม 1 แถว (กรอกในชีต ยังไม่มีเลขที่จอง)
  const row = new Array(G.COLS.length).fill('');
  row[G.C.room - 1] = 'ห้อง 1'; row[G.C.checkIn - 1] = d(2026, 11, 10); row[G.C.checkOut - 1] = d(2026, 11, 12);
  row[G.C.name - 1] = 'สมชาย'; row[G.C.total - 1] = 2000; row[G.C.paid - 1] = 1000;
  book.data[1] = row;
}
const PIN = '4321';
const input = o => Object.assign({ room: 'ห้อง 2', checkIn: '2026-11-10', checkOut: '2026-11-12', name: 'มานี', phone: '0899999999',
  channel: 'LINE', adults: '2', total: '2000', paid: '', status: 'จองแล้ว', recorder: 'วาฬ' }, o);
const throwsMsg = (fn, re) => assert.throws(fn, e => re.test(e.message), 'ควรขึ้น error ' + re);

let pass = 0;
function test(name, fn) {
  try { reset(); fn(); pass++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

console.log('หลังบ้าน (Code.gs)');

test('รหัสผิด = เข้าไม่ได้ และนับครั้งที่ผิด', () => {
  throwsMsg(() => G.adminData('0000'), /รหัสไม่ถูกต้อง/);
  assert.strictEqual(cache[G.PIN_FAIL_KEY], '1');
});

test('ผิดครบ 10 ครั้ง ล็อก แม้รหัสถูก', () => {
  cache[G.PIN_FAIL_KEY] = '10';
  throwsMsg(() => G.adminData(PIN), /รอ 10 นาที/);
});

test('adminData โหลดข้อมูล และเติมเลขที่จองให้แถวที่กรอกในชีต', () => {
  const r = plain(G.adminData(PIN));
  assert.strictEqual(r.bookings.length, 1);
  const b = r.bookings[0];
  assert.ok(/^YN\d{6}-01$/.test(b.id), 'เลขที่จอง: ' + b.id);
  assert.strictEqual(b.checkIn, '2026-11-10');
  assert.strictEqual(b.nights, 2);
  assert.strictEqual(b.balance, 1000);
  assert.strictEqual(b.payStatus, 'มัดจำแล้ว');
  assert.deepStrictEqual(r.meta.statuses, ['จองแล้ว', 'เข้าพักแล้ว', 'ยกเลิก', 'ปิดห้อง']);
  assert.strictEqual(r.meta.pinIsDefault, false);
});

test('saveBooking เพิ่มใหม่ ต่อท้ายแถวสุดท้าย และไม่เขียนทับคอลัมน์สูตร', () => {
  const r = plain(G.saveBooking(PIN, input()));
  assert.ok(/^YN\d{6}-\d\d$/.test(r.savedId));
  assert.strictEqual(r.bookings.length, 2);
  const row = book.data[2];
  assert.strictEqual(row[G.C.name - 1], 'มานี');
  assert.strictEqual(row[G.C.phone - 1], '0899999999');
  assert.strictEqual(row[G.C.total - 1], 2000);
  assert.strictEqual(G.normDate_(row[G.C.checkIn - 1]), '2026-11-10');
  G.FORMULA_KEYS.forEach(k => assert.ok(!written.has(G.C[k]), 'เขียนทับคอลัมน์สูตร ' + k));
});

test('saveBooking กันจองซ้อน (ห้องเดียวกัน คืนทับกัน)', () => {
  throwsMsg(() => G.saveBooking(PIN, input({ room: 'ห้อง 1', checkIn: '2026-11-11', checkOut: '2026-11-13' })), /ห้อง 1 ถูกจองแล้วช่วง 10\/11\/2026/);
});

test('วันที่คนเก่าเช็คเอาท์ จองต่อได้', () => {
  const r = plain(G.saveBooking(PIN, input({ room: 'ห้อง 1', checkIn: '2026-11-12', checkOut: '2026-11-13' })));
  assert.strictEqual(r.bookings.length, 2);
});

test('saveBooking แก้ไขแถวเดิมได้ (ไม่นับตัวเองว่าซ้อน)', () => {
  const id = plain(G.adminData(PIN)).bookings[0].id;
  const r = plain(G.saveBooking(PIN, input({ id, row: 2, room: 'ห้อง 1', checkIn: '2026-11-10', checkOut: '2026-11-13', name: 'สมชาย ใจดี' })));
  assert.strictEqual(r.bookings.length, 1);
  assert.strictEqual(r.bookings[0].name, 'สมชาย ใจดี');
  assert.strictEqual(r.bookings[0].nights, 3);
});

test('แก้ไขแม้มีคนเรียงแถวใหม่ในชีต (หาแถวจากเลขที่จอง)', () => {
  const id = plain(G.adminData(PIN)).bookings[0].id;
  book.data[5] = book.data[1]; book.data[1] = new Array(G.COLS.length).fill(''); // ย้ายแถวไปแถว 6
  const r = plain(G.saveBooking(PIN, input({ id, row: 2, room: 'ห้อง 1', name: 'ย้ายแถว' })));
  assert.strictEqual(book.data[5][G.C.name - 1], 'ย้ายแถว');
  assert.strictEqual(r.bookings.length, 1);
});

test('ตรวจข้อมูลจากหน้าเว็บ', () => {
  throwsMsg(() => G.saveBooking(PIN, input({ room: 'ห้อง 9' })), /เลือกห้อง/);
  throwsMsg(() => G.saveBooking(PIN, input({ checkIn: '2026-02-30' })), /วันเช็คอิน/);
  throwsMsg(() => G.saveBooking(PIN, input({ checkOut: '2026-11-10' })), /หลังวันเช็คอิน/);
  throwsMsg(() => G.saveBooking(PIN, input({ name: '' })), /ชื่อผู้จอง/);
  throwsMsg(() => G.saveBooking(PIN, input({ total: '-5' })), /ยอดรวม/);
  throwsMsg(() => G.saveBooking(PIN, input({ channel: 'TikTok' })), /ช่องทาง/);
  throwsMsg(() => G.saveBooking('x', input()), /รหัส/);
});

test('ต้องกรอก เบอร์โทร จำนวนผู้ใหญ่ ยอดรวม (ใช้ในข้อความยืนยัน)', () => {
  throwsMsg(() => G.saveBooking(PIN, input({ phone: '' })), /เบอร์โทร/);
  throwsMsg(() => G.saveBooking(PIN, input({ adults: '' })), /ผู้ใหญ่/);
  throwsMsg(() => G.saveBooking(PIN, input({ adults: '0' })), /ผู้ใหญ่/);
  throwsMsg(() => G.saveBooking(PIN, input({ total: '' })), /ยอดรวม/);
});

test('ปิดห้อง ไม่ต้องใส่ชื่อ เบอร์ จำนวนคน ยอดรวม', () => {
  const r = plain(G.saveBooking(PIN, input({ name: '', phone: '', adults: '', status: 'ปิดห้อง', total: '' })));
  assert.strictEqual(r.bookings.find(b => b.status === 'ปิดห้อง').payStatus, 'ปิดห้อง');
});

test('บันทึกจำนวน ค่า และหมายเหตุหมูกระทะ (คอลัมน์ต่อท้าย)', () => {
  const r = plain(G.saveBooking(PIN, input({ mookata: '1', mookataPrice: '300', mookataNote: 'ทานตอน 1 ทุ่ม' })));
  const b = r.bookings.find(x => x.name === 'มานี');
  assert.deepStrictEqual([b.mookata, b.mookataPrice, b.mookataNote], [1, 300, 'ทานตอน 1 ทุ่ม']);
  assert.strictEqual(book.data[2][G.C.mookataNote - 1], 'ทานตอน 1 ทุ่ม');
  assert.ok(G.C.mookataPrice > G.C.createdAt && G.C.mookataNote > G.C.createdAt, 'คอลัมน์ใหม่ต้องอยู่ท้ายสุด');
});

test('ensureListItem_ เพิ่ม "อื่นๆ" ในผู้บันทึกของชีตเดิม ครั้งเดียว', () => {
  G.ensureListItem_(settings, 5, 'อื่นๆ');
  G.ensureListItem_(settings, 5, 'อื่นๆ');
  const list = settings.data.slice(1).map(r => r[4]).filter(Boolean);
  assert.deepStrictEqual(list, ['วาฬ', 'แบม', 'อื่นๆ']);
});

test('addPayment บวกยอดและจดประวัติ', () => {
  const b = plain(G.adminData(PIN)).bookings[0];
  const r = plain(G.addPayment(PIN, { id: b.id, row: b.row, amount: 1000, method: 'โอน', by: 'แบม' }));
  const x = r.bookings[0];
  assert.strictEqual(x.paid, 2000);
  assert.strictEqual(x.payStatus, 'ชำระครบ');
  assert.ok(/^\d\d\/\d\d\/\d{4} รับ 1,000 บาท \(โอน\) · แบม$/.test(x.payNote), x.payNote);
  throwsMsg(() => G.addPayment(PIN, { id: b.id, amount: 0 }), /มากกว่า 0/);
});

test('ยกเลิกแล้วห้องว่าง แต่เปิดคืนไม่ได้ถ้ามีคนจองแทนแล้ว', () => {
  const b = plain(G.adminData(PIN)).bookings[0];
  G.setBookingStatus(PIN, b.id, b.row, 'ยกเลิก');
  G.saveBooking(PIN, input({ room: 'ห้อง 1' }));
  throwsMsg(() => G.setBookingStatus(PIN, b.id, b.row, 'จองแล้ว'), /เปิดการจองนี้คืนไม่ได้/);
  throwsMsg(() => G.setBookingStatus(PIN, b.id, b.row, 'หาย'), /ไม่มีสถานะ/);
});

test('ensurePin_ เพิ่มแถวรหัสให้ชีตที่ติดตั้งไว้ก่อน', () => {
  settings.data[2] = ['', '', '', 'Facebook', 'แบม', 'เข้าพักแล้ว'];
  settings.data[3] = ['รายการในคอลัมน์ D–F ...', '', '', '', '', 'ยกเลิก'];
  G.ensurePin_(settings);
  assert.deepStrictEqual(settings.data[2].slice(0, 2), ['รหัสเข้าหลังบ้าน', '1234']);
  G.ensurePin_(settings); // รันซ้ำไม่เพิ่มซ้ำ
  assert.strictEqual(settings.data.filter(r => r[0] === 'รหัสเข้าหลังบ้าน').length, 1);
});

test('payStatus_ ตรงกับ payStatus ใน Admin.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '../apps-script/Admin.html'), 'utf8');
  const js = html.slice(html.indexOf('function payStatus('), html.indexOf('// การจองที่ชนกัน'));
  const clientPay = new Function('CLOSED', 'CANCELLED', js + 'return payStatus;')('ปิดห้อง', 'ยกเลิก');
  [{ total: '', paid: '' }, { total: 1000, paid: 0 }, { total: 1000, paid: 200 }, { total: 1000, paid: 500 },
    { total: 1000, paid: 1000 }, { total: 1000, paid: 1500 }, { total: 0, paid: '' },
    { total: 1000, paid: 0, status: 'ยกเลิก' }, { total: '', paid: '', status: 'ปิดห้อง' },
    { total: 4500, paid: 500, deposit: 500 }, { total: 4500, paid: 400, deposit: 500 }, { total: 4500, paid: 0, deposit: 0 },
    { total: 4500, paid: 2250, deposit: '' }]
    .forEach(b => assert.strictEqual(clientPay(b, 50), G.payStatus_(b, 50), JSON.stringify(b)));
});

test('มัดจำที่กรอกเอง ใช้แทน % (เช่น มัดจำ 500 จากยอด 4,500)', () => {
  assert.strictEqual(G.payStatus_({ total: 4500, paid: 500, deposit: 500 }, 50), 'มัดจำแล้ว');
  assert.strictEqual(G.payStatus_({ total: 4500, paid: 500, deposit: '' }, 50), 'จ่ายบางส่วน');
  const r = plain(G.saveBooking(PIN, input({ total: '4500', deposit: '500', paid: '500' })));
  assert.strictEqual(r.bookings.find(b => b.name === 'มานี').payStatus, 'มัดจำแล้ว');
  throwsMsg(() => G.saveBooking(PIN, input({ total: '1000', deposit: '2000' })), /มัดจำต้องไม่มากกว่ายอดรวม/);
});

test('meta ส่งราคาห้อง ราคาเตียงเสริม หมูกระทะ และบัญชี ให้หน้าเว็บคำนวณ', () => {
  rooms.data[1][4] = 1000; rooms.data[2][4] = 1500;
  settings.data[5] = ['ราคาเตียงเสริม/คืน', 200, '', '', '', ''];
  settings.data[6] = ['ราคาหมูกระทะ/ชุด', 300, '', '', '', ''];
  settings.data[7] = ['บัญชีรับเงิน', 'KBank 123', '', '', '', ''];
  const m = plain(G.adminData(PIN)).meta;
  assert.deepStrictEqual(m.rooms.map(r => r.price), [1000, 1500]);
  assert.deepStrictEqual([m.extraBedPrice, m.mookataPrice, m.bankInfo], [200, 300, 'KBank 123']);
});

test('ชีตเดิม: setup เพิ่มราคาเตียงเสริม/หมูกระทะ/บัญชี และราคาห้อง โดยไม่ทับค่าเดิม', () => {
  settings.data[5] = ['ราคาหมูกระทะ/ชุด', 350, '', '', '', ''];
  G.ensureSettings_(settings);
  const kv = Object.fromEntries(settings.data.filter(r => r[0]).map(r => [r[0], r[1]]));
  assert.strictEqual(kv['ราคาหมูกระทะ/ชุด'], 350, 'ต้องไม่ทับค่าที่มีอยู่');
  assert.strictEqual(kv['ราคาเตียงเสริม/คืน'], 200);
  assert.ok('บัญชีรับเงิน' in kv);
  rooms.data[3] = ['R9', 'ห้องพิเศษ', 'ใช่', '', ''];
  G.ensureRoomPrices_(rooms);
  assert.strictEqual(rooms.data[0][4], 'ราคา/คืน (บาท)');
  assert.deepStrictEqual([rooms.data[1][4], rooms.data[2][4], rooms.data[3][4]], [1000, 1000, '']);
});

console.log('Admin.html');

test('ไม่มี /* หรือ */ ในไฟล์ (Apps Script จะตัดโค้ดทิ้ง) และมี <script> ก้อนเดียว', () => {
  const html = fs.readFileSync(path.join(__dirname, '../apps-script/Admin.html'), 'utf8');
  assert.strictEqual((html.match(/\/\*|\*\//g) || []).length, 0);
  assert.strictEqual((html.match(/<script/g) || []).length, 1);
});

test('ทุกฟังก์ชันที่ Admin.html เรียก มีใน Code.gs และในโหมดตัวอย่าง', () => {
  const html = fs.readFileSync(path.join(__dirname, '../apps-script/Admin.html'), 'utf8');
  const called = [...new Set([...html.matchAll(/run\('(\w+)'/g)].map(m => m[1]))];
  assert.ok(called.length >= 4, called.join(','));
  called.forEach(fn => {
    assert.strictEqual(typeof G[fn], 'function', 'Code.gs ไม่มี ' + fn);
    assert.ok(new RegExp('\\n    ' + fn + '\\(').test(html), 'โหมดตัวอย่างไม่มี ' + fn);
  });
});

console.log(`\n${pass} ข้อผ่าน` + (process.exitCode ? ' (มีข้อที่ไม่ผ่าน)' : ''));
