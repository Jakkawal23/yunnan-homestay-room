# yunnan-homestay-room

เว็บไซต์และปฏิทินห้องพักของ **ยูนนานโฮมสเตย์** ใจกลางชุมชนจีนยูนนาน ดอยอ่างขาง จังหวัดเชียงใหม่

- **หน้าดูห้องพัก** (`index.html`) รูปห้อง รายละเอียด ราคาเริ่มต้น แผนที่
- **หน้าเช็คห้องว่าง** (`check.html`) เลือกวัน ดูว่าห้องไหนว่าง แล้วกด "สนใจจอง" เพื่อเปิดแชท LINE พร้อมข้อความอัตโนมัติ
- **Google Sheet ปฏิทินห้องพัก** ทีมงานบันทึกการจอง (`apps-script/Code.gs` สร้างชีตและเป็น API ให้หน้าเช็คห้องว่าง)
- **หลังบ้าน** (`apps-script/Admin.html`) เว็บสำหรับทีมงาน ดู เพิ่ม แก้ไขการจอง รับเงิน ผ่านมือถือ อยู่บน Apps Script (`/exec?page=admin`)

ทั้ง 2 หน้าเป็น HTML ธรรมดา ไม่ต้อง build เน้นเปิดบนมือถือ และใส่ไว้ใน Rich menu ของ LINE OA

## โครงสร้างโฟลเดอร์

```
index.html              หน้าดูห้องพัก
check.html              หน้าเช็คห้องว่าง
assets/
  config.js             ★ ตั้งค่าทั้งหมด: ลิงก์ LINE ห้องพัก ราคา ข้อความ (แก้ที่นี่ที่เดียว)
  common.js             ฟังก์ชันที่ 2 หน้าใช้ร่วม
  common.css            สี ฟอนต์ ปุ่ม ที่ 2 หน้าใช้ร่วม
images/
  hero.jpg, hero-small.jpg       รูปหน้าที่พัก
  room_01 … room_05/             รูปห้อง 01–05.jpg (01 = หน้าปก) + small/ รูปเล็ก
  common-hall.jpg                ห้องโถงส่วนกลาง
  night-street.jpg               บรรยากาศกลางคืนในชุมชน
  small/                         รูปเล็กของสองรูปด้านบน
apps-script/
  Code.gs               วางใน Google Sheet → Extensions → Apps Script
  Admin.html            หน้าหลังบ้าน (ไฟล์ HTML ชื่อ Admin ใน Apps Script)
  appsscript.json       ตั้งค่าโปรเจกต์ Apps Script (ไม่บังคับ)
docs/                   คู่มือแต่ละส่วน (ด้านล่าง)
tests/
  code.test.js          ทดสอบตรรกะใน Code.gs (ห้องว่าง API)
  admin.test.js         ทดสอบหลังบ้านกับชีตจำลอง
```

ไฟล์ต้นฉบับขนาดใหญ่เก็บไว้ใน `originals/` บนเครื่อง ไม่ได้อัปโหลดขึ้น GitHub

## คู่มือ

| เรื่อง | ไฟล์ |
|---|---|
| ภาพรวมระบบ ลูกค้าและทีมงานใช้อย่างไร | [docs/system-overview.md](docs/system-overview.md) |
| สร้างและกรอก Google Sheet ปฏิทินห้องพัก | [docs/google-sheet.md](docs/google-sheet.md) |
| ติดตั้ง Apps Script และ API ห้องว่าง | [docs/apps-script.md](docs/apps-script.md) |
| หลังบ้าน: ดู เพิ่ม แก้ไขการจองผ่านเว็บ | [docs/admin.md](docs/admin.md) |
| หน้าเว็บ และ `config.js` ทุกช่อง | [docs/website.md](docs/website.md) |
| Deploy เปลี่ยนลิงก์ ตั้ง Rich menu และ checklist | [docs/deploy-and-urls.md](docs/deploy-and-urls.md) |

## เริ่มใช้งาน (สรุป)

1. สร้าง Google Sheet → วาง `apps-script/Code.gs` และไฟล์ HTML `Admin` → รัน `setup` → เปลี่ยนรหัสเข้าหลังบ้าน
2. Deploy Apps Script เป็น Web app (Anyone) → คัดลอกลิงก์ `/exec`
3. ใส่ลิงก์ใน `assets/config.js → urls.availabilityApi` → push ขึ้น `main`
4. ตั้ง Rich menu: "เช็คห้องว่าง" → `/check.html` และ "ดูห้องพัก" → `/`
5. ส่งลิงก์หลังบ้าน `/exec?page=admin` ให้ทีมงาน

## ดูบนเครื่อง / ทดสอบ

```bash
npx serve .
```

```bash
node tests/code.test.js
```

```bash
node tests/admin.test.js
```

Branch: `main` = เว็บจริง · `develop` = แก้ไขและทดลอง
