# Deploy เปลี่ยนลิงก์ และตั้ง LINE Rich menu

## ลิงก์ทั้งหมดในระบบ

| ลิงก์ | ตั้งที่ไหน | ใช้ที่ไหน |
|---|---|---|
| หน้าดูห้องพัก `https://<เว็บ>/` | ที่ deploy (GitHub Pages / Vercel) | Rich menu, `config.js → urls.roomsPage` |
| หน้าเช็คห้องว่าง `https://<เว็บ>/check.html` | ที่ deploy | Rich menu, `config.js → urls.checkPage` |
| API `https://script.google.com/macros/s/.../exec` | Apps Script → Deploy | `config.js → urls.availabilityApi` |
| หลังบ้าน `https://script.google.com/macros/s/.../exec?page=admin` | ลิงก์เดียวกับ API + `?page=admin` | ส่งให้ทีมงานเท่านั้น (ห้ามใส่ในเว็บลูกค้า/Rich menu) |
| แชท LINE `@579lmqrb` | LINE OA | `config.js → line.id` |

**ทุกลิงก์ที่เว็บใช้ อยู่ใน `assets/config.js` ไฟล์เดียว** ไม่มีลิงก์ซ่อนอยู่ใน HTML

## Deploy หน้าเว็บ

ทั้ง 2 หน้าอยู่ใน repo เดียวกัน deploy ครั้งเดียวได้ทั้งคู่ (เลือกอย่างใดอย่างหนึ่ง)

### แบบ A: Vercel (แนะนำ ใช้อยู่แล้วที่ yunnan-home-stay.vercel.app)

1. เข้า [vercel.com](https://vercel.com) → Add New → Project → Import repo `Jakkawal23/yunnan-homestay-room`
2. Framework Preset: **Other** · Build Command: เว้นว่าง · Output Directory: เว้นว่าง → Deploy
3. Settings → Git → **Production Branch = `main`**
   - push `main` → เว็บจริงอัปเดต
   - push `develop` → ได้ลิงก์ Preview แยก ไว้ลองก่อน
4. ถ้าจะใช้ชื่อเดิม `yunnan-home-stay.vercel.app` ให้ไปที่โปรเจกต์เดิม → Settings → Git → Connect repo นี้แทน
   หรือ Settings → Domains ของโปรเจกต์ใหม่ แล้วย้ายโดเมนมา

ลิงก์ที่ได้: `https://yunnan-home-stay.vercel.app/` และ `https://yunnan-home-stay.vercel.app/check.html`

### แบบ B: GitHub Pages (ฟรี ไม่ต้องสมัครเพิ่ม)

1. GitHub → repo → **Settings → Pages**
2. Source: **Deploy from a branch** · Branch: **main** · Folder: **/ (root)** → Save
3. รอ 1–2 นาที ได้ลิงก์ `https://jakkawal23.github.io/yunnan-homestay-room/`

ลิงก์หน้าเช็คห้องว่าง: `https://jakkawal23.github.io/yunnan-homestay-room/check.html`

> โฟลเดอร์ `apps-script/` `docs/` `tests/` จะถูกเผยแพร่ด้วย ไม่เป็นไร ไม่มีรหัสหรือข้อมูลลับในนั้น

## ขั้นตอนอัปเดตเว็บ (ทุกครั้งที่แก้)

```bash
git switch develop
```

แก้ไฟล์ แล้วตรวจในเครื่อง (`npx serve .`) จากนั้น

```bash
git add -A
```

```bash
git commit -m "อธิบายสิ่งที่แก้"
```

```bash
git push origin develop
```

ดูลิงก์ Preview ของ develop ใน Vercel ถ้าเรียบร้อย เอาขึ้นเว็บจริง

```bash
git switch main
```

```bash
git merge --ff-only develop
```

```bash
git push origin main
```

```bash
git switch develop
```

## เปลี่ยนลิงก์ (กรณีต่างๆ)

| เหตุการณ์ | ทำอะไร |
|---|---|
| ย้ายเว็บไปที่ใหม่ (เช่น จาก GitHub Pages ไป Vercel) | **ไม่ต้องแก้ config.js** (ลิงก์เป็นชื่อไฟล์อยู่แล้ว) แก้แค่ลิงก์ใน **Rich menu** |
| Deploy Apps Script ใหม่แล้วได้ลิงก์ `/exec` ใหม่ | แก้ `urls.availabilityApi` ใน config.js แล้ว push |
| แก้โค้ด Apps Script หรือ Admin.html (ลิงก์เดิม) | Manage deployments → New version ไม่ต้องแก้อะไรในเว็บ |
| แยก 2 หน้าไว้คนละเว็บ | ใส่ลิงก์เต็มใน `urls.roomsPage` และ `urls.checkPage` (ต้องมี config.js เหมือนกันทั้ง 2 ที่) |
| เปลี่ยน LINE OA | แก้ `line.id` และ `line.url` |
| มีโดเมนของตัวเอง เช่น yunnanhomestay.com | ตั้งใน Vercel → Domains แล้วแก้ลิงก์ใน Rich menu |

## ตั้ง LINE Rich menu

1. เข้า [manager.line.biz](https://manager.line.biz) → เลือกบัญชี ยูนนานโฮมสเตย์
2. เมนูซ้าย **Rich menus → Create**
3. ตั้งชื่อ ช่วงเวลาแสดง และเลือก Template (แนะนำแบบ 2 หรือ 3 ช่อง)
4. ตั้ง Action ของแต่ละช่อง: Type = **Link**

| ช่อง | ข้อความบนปุ่ม | Link |
|---|---|---|
| A | เช็คห้องว่าง | `https://<เว็บ>/check.html` |
| B | ดูห้องพัก | `https://<เว็บ>/` |
| C (ถ้ามี) | แผนที่ / นำทาง | `https://www.google.com/maps/dir/?api=1&destination=19.7619969,99.0125401` |

5. อัปโหลดรูปเมนู แล้วกด Save
6. ทดสอบในมือถือ: เปิดแชท OA → กดเมนู → ต้องเปิดหน้าเว็บใน LINE ได้ → กด "สนใจจอง" → ต้องเด้งกลับมาที่แชทพร้อมข้อความ

ลิงก์พิเศษที่ใส่ใน Rich menu ได้ (ไม่บังคับ)
- `check.html?room=R3` เปิดหน้าเช็คห้องว่างโดยเลือกห้อง 3 ไว้
- `index.html#rooms` เปิดหน้าดูห้องพักที่ส่วนรายการห้อง

## Checklist ก่อนเปิดใช้จริง

- [ ] สร้าง Google Sheet และรัน `setup` ([google-sheet.md](google-sheet.md))
- [ ] แชร์ชีตให้วาฬ แบม เหมยๆ (Editor) และ **ไม่** เปิดแชร์แบบ Anyone with the link
- [ ] Deploy Apps Script เป็น Web app (Anyone) และเปิด `/exec` ได้ `"ok":true` ([apps-script.md](apps-script.md))
- [ ] เพิ่มไฟล์ `Admin` เปลี่ยนรหัสเข้าหลังบ้านจาก 1234 แล้วเปิด `/exec?page=admin` เข้าได้ ([admin.md](admin.md))
- [ ] ลองจองทดสอบในหลังบ้าน → เห็นในแท็บการจองและปฏิทินของชีต → ยกเลิก
- [ ] ใส่ลิงก์ `/exec` ใน `config.js → urls.availabilityApi` แล้ว push ขึ้น main
- [ ] เปิด `check.html` บนเว็บจริง ไม่มีกล่อง "โหมดตัวอย่าง"
- [ ] ลองกรอกการจองทดสอบ 1 แถวในชีต → รอ 1 นาที → หน้าเช็คห้องว่างต้องเห็นห้องนั้น "เต็ม" → แล้วเปลี่ยนสถานะเป็นยกเลิก
- [ ] ตั้ง Rich menu และทดสอบกด "สนใจจอง" ในมือถือ ข้อความต้องขึ้นในช่องพิมพ์ของแชท
- [ ] กรอกการจองที่มีอยู่แล้ว (จากกระดาษ/ระบบเดิม) ลงชีตใหม่ให้ครบ

## ถ้าจะกลับไปใช้ระบบจองเดิม

ระบบจองเต็มรูปแบบเดิม (Public.html / Admin.html / Code.gs ตัวเก่า) ยังอยู่ครบ ลิงก์เดิมยังใช้งานได้
ถ้าต้องการให้ปุ่มบนเว็บกลับไปที่ฟอร์มจองเดิม ให้แก้ปุ่ม "สนใจจอง" ใน `check.html` และ `index.html` ให้ลิงก์ไปที่
`https://script.google.com/macros/s/AKfycbxeIXavg-jgaxzBXTMDnPxQo3m5XF3fEH-12AKux290qLTX7I6jv-pBvLC3HqweUNqVww/exec?room=R3`
(ข้อมูลในชีตใหม่และชีตเก่าแยกกัน ต้องย้ายข้อมูลเอง)
