// ทดสอบตรรกะใน apps-script/Code.gs ด้วย Node (ไม่ต้องใช้ Google จริง)
// รัน:  node tests/code.test.js
// ทดสอบได้เฉพาะส่วนคำนวณ (ห้องว่าง วันที่ เลขที่จอง API) ส่วนสร้างชีต setup() ต้องลองใน Google Sheet จริง
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TZ_OFFSET = 7 * 3600 * 1000; // Asia/Bangkok
let cacheStore = {};
const ctx = {
  console,
  Utilities: {
    formatDate(d, tz, fmt) {
      const b = new Date(d.getTime() + TZ_OFFSET);
      const p = n => String(n).padStart(2, '0');
      const map = { yyyy: b.getUTCFullYear(), yy: p(b.getUTCFullYear() % 100), MM: p(b.getUTCMonth() + 1), M: b.getUTCMonth() + 1,
        dd: p(b.getUTCDate()), HH: p(b.getUTCHours()), mm: p(b.getUTCMinutes()) };
      return fmt.replace(/yyyy|yy|MM|M|dd|HH|mm/g, k => map[k]);
    }
  },
  CacheService: { getScriptCache: () => ({
    get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; }, remove: k => { delete cacheStore[k]; } }) },
  ContentService: {
    MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
    createTextOutput(s) { return { s, mime: null, setMimeType(m) { this.mime = m; return this; } }; }
  },
  SpreadsheetApp: null
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8') +
  '\n;Object.assign(this, { COLS, C, CACHE_KEY });', ctx); // const ไม่ติดมากับ context เอง
const G = ctx;

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

// แถวจำลองของแท็บการจอง ตามลำดับคอลัมน์ COLS
function bk(o) {
  const row = new Array(G.COLS.length).fill('');
  Object.keys(o).forEach(k => { row[G.C[k] - 1] = o[k]; });
  return row;
}
const HEAD = G.COLS.map(c => c[1]);
const ROOMS = [['รหัสห้อง', 'ชื่อห้อง', 'เปิดให้จอง', 'หมายเหตุ'],
  ['R1', 'ห้อง 1', 'ใช่', ''], ['R2', 'ห้อง 2', 'ใช่', ''], ['R3', 'ห้อง 3', 'ไม่', ''], ['', '', '', '']];
// เที่ยงคืนเวลาไทย เหมือนค่าที่ Sheets คืนมา (สร้างด้วย Date ของ sandbox ให้ instanceof Date ใน Code.gs ทำงาน)
const VDate = vm.runInContext("Date", ctx);
const d = (y, m, day) => new VDate(Date.UTC(y, m - 1, day) - TZ_OFFSET);
const plain = x => JSON.parse(JSON.stringify(x));

console.log('Code.gs');

test('normDate_ รับ Date, ISO, วว/ดด/ปปปป และปี พ.ศ.', () => {
  assert.strictEqual(G.normDate_(d(2026, 12, 25)), '2026-12-25');
  assert.strictEqual(G.normDate_('2026-1-5'), '2026-01-05');
  assert.strictEqual(G.normDate_('5/1/2026'), '2026-01-05');
  assert.strictEqual(G.normDate_('25/12/2569'), '2026-12-25');
  assert.strictEqual(G.normDate_(''), '');
  assert.strictEqual(G.normDate_('abc'), '');
});

test('addDays_ ข้ามเดือนและปี', () => {
  assert.strictEqual(G.addDays_('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(G.addDays_('2026-03-01', -1), '2026-02-28');
});

test('mergeRanges_ รวมช่วงที่ต่อกันหรือทับกัน', () => {
  assert.deepStrictEqual(plain(G.mergeRanges_([['2026-10-05', '2026-10-07'], ['2026-10-01', '2026-10-03'], ['2026-10-03', '2026-10-04'], ['2026-10-06', '2026-10-09']])),
    [['2026-10-01', '2026-10-04'], ['2026-10-05', '2026-10-09']]);
});

test('buildAvailability_ ส่งเฉพาะช่วงไม่ว่าง ไม่มีข้อมูลส่วนตัว', () => {
  const rows = [HEAD,
    bk({ room: 'ห้อง 1', checkIn: d(2026, 10, 20), checkOut: d(2026, 10, 22), name: 'สมชาย', phone: '0812345678', total: 2000 }),
    bk({ room: 'ห้อง 1', checkIn: d(2026, 10, 22), checkOut: d(2026, 10, 23), name: 'ต่อเนื่อง' }),
    bk({ room: 'ห้อง 2', checkIn: d(2026, 10, 25), checkOut: d(2026, 10, 26), status: 'ยกเลิก' }),
    bk({ room: 'ห้อง 2', checkIn: d(2026, 10, 10), checkOut: d(2026, 10, 12) }),        // ผ่านไปแล้ว
    bk({ room: 'ห้อง 2', checkIn: d(2026, 10, 30), checkOut: d(2026, 11, 2), status: 'ปิดห้อง' }),
    bk({ room: 'R2', checkIn: '05/11/2026', checkOut: '06/11/2026' }),                  // ใส่รหัสห้องและวันที่เป็นข้อความ
    bk({ room: 'ห้อง 1', checkIn: d(2026, 11, 3), checkOut: d(2026, 11, 3) }),          // วันออกไม่ถูกต้อง
    bk({ room: 'ห้อง 9', checkIn: d(2026, 11, 3), checkOut: d(2026, 11, 4) }),          // ไม่มีห้องนี้
    bk({ room: 'ห้อง 1', checkIn: '', checkOut: '' })
  ];
  const out = G.buildAvailability_(ROOMS, rows, '2026-10-21');
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.rooms)), [{ id: 'R1', name: 'ห้อง 1' }, { id: 'R2', name: 'ห้อง 2' }, { id: 'R3', name: 'ห้อง 3' }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.closed)), ['R3']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.busy)), {
    R1: [['2026-10-20', '2026-10-23']],
    R2: [['2026-10-30', '2026-11-02'], ['2026-11-05', '2026-11-06']],
    R3: []
  });
  const json = JSON.stringify(out);
  ['สมชาย', '0812345678', '2000'].forEach(s => assert.ok(json.indexOf(s) < 0, 'หลุดข้อมูล: ' + s));
});

test('วันที่คนเก่าเช็คเอาท์ ไม่นับเป็นวันไม่ว่าง (busy เป็นช่วง [เข้า, ออก) )', () => {
  const out = G.buildAvailability_(ROOMS, [HEAD, bk({ room: 'ห้อง 1', checkIn: d(2026, 10, 21), checkOut: d(2026, 10, 22) })], '2026-10-21');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.busy.R1)), [['2026-10-21', '2026-10-22']]);
});

test('nextSeq_ เลขที่จองนับต่อจากเลขสูงสุดของวันนั้น', () => {
  assert.strictEqual(G.nextSeq_(['YN261021-01', 'YN261021-03', 'YN261020-09', ''], 'YN261021-'), 4);
  assert.strictEqual(G.nextSeq_([], 'YN261021-'), 1);
});

test('letter_ แปลงเลขคอลัมน์เป็นตัวอักษร', () => {
  assert.strictEqual(G.letter_(1), 'A');
  assert.strictEqual(G.letter_(22), 'V');
  assert.strictEqual(G.letter_(27), 'AA');
});

test('คอลัมน์ห้อง/เช็คอิน/เช็คเอาท์ อยู่ B C D (สูตรสีจองซ้อนอ้างตำแหน่งนี้)', () => {
  assert.deepStrictEqual([G.C.room, G.C.checkIn, G.C.checkOut], [2, 3, 4]);
});

// doGet ใช้ชีตจำลอง
function fakeSheets(rooms, bookings) {
  const sh = v => ({ getDataRange: () => ({ getValues: () => v }) });
  ctx.SpreadsheetApp = { getActive: () => ({ getSheetByName: n => n === 'ห้องพัก' ? sh(rooms) : n === 'การจอง' ? sh(bookings) : null }) };
}

test('doGet คืน JSON และเก็บแคช', () => {
  cacheStore = {};
  fakeSheets(ROOMS, [HEAD, bk({ room: 'ห้อง 2', checkIn: d(2099, 1, 1), checkOut: d(2099, 1, 3) })]);
  const r = G.doGet({ parameter: {} });
  assert.strictEqual(r.mime, 'json');
  const o = JSON.parse(r.s);
  assert.strictEqual(o.ok, true);
  assert.ok(cacheStore[G.CACHE_KEY], 'ควรเก็บแคช');
  // ครั้งที่สองอ่านจากแคช แม้ชีตเปลี่ยน
  fakeSheets(ROOMS, [HEAD]);
  assert.strictEqual(JSON.parse(G.doGet({ parameter: {} }).s).updatedAt, o.updatedAt);
});

test('doGet ?callback= คืน JSONP และกันชื่อ callback แปลกๆ', () => {
  cacheStore = {};
  fakeSheets(ROOMS, [HEAD]);
  const r = G.doGet({ parameter: { callback: '__avail123' } });
  assert.strictEqual(r.mime, 'js');
  assert.ok(/^__avail123\(\{.*\}\)$/.test(r.s));
  const bad = G.doGet({ parameter: { callback: 'alert(1);x' } });
  assert.strictEqual(bad.mime, 'json');
});

test('doGet ส่ง ok:false เมื่อเกิดข้อผิดพลาด', () => {
  cacheStore = {};
  ctx.SpreadsheetApp = { getActive: () => { throw new Error('boom'); } };
  const o = JSON.parse(G.doGet({}).s);
  assert.strictEqual(o.ok, false);
  assert.ok(/boom/.test(o.error));
});

console.log(`\n${pass} ข้อผ่าน` + (process.exitCode ? ' (มีข้อที่ไม่ผ่าน)' : ''));
