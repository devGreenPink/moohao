# Nearby

ส่งไฟล์และข้อความระหว่างอุปกรณ์ที่อยู่ใกล้กัน ผ่านเบราว์เซอร์ ไม่ต้องมี server
Share files and text between nearby devices, right in the browser. No server.

**เว็บ / Live:** https://devgreenpink.github.io/nearby/

## ใช้งาน / How it works

- **เครือข่ายเดียวกัน**: เปิดเว็บบนทุกเครื่องที่ต่อ Wi‑Fi เดียวกัน แล้วจะเห็นกันอัตโนมัติ
  Devices on the same Wi‑Fi find each other automatically.
- **รหัสห้อง / QR**: ถ้าหากันไม่เจอ หรืออยู่คนละเครือข่าย กดปุ่มด้านบนเพื่อสร้างห้อง แล้วสแกน QR จากอีกเครื่อง
  If devices can't see each other, create a room and scan its QR code on the other device.
- แตะอุปกรณ์บนเรดาร์เพื่อเลือก แล้วส่งไฟล์หรือข้อความ หรือลากไฟล์มาวาง / กด Ctrl+V
  Select a device on the radar to send files or text, or drag & drop / paste.
- ผู้รับต้องกด "รับ" ก่อนไฟล์จะถูกส่ง ไฟล์วิ่งตรงระหว่างเครื่องด้วย WebRTC (เข้ารหัส) ไม่ถูกอัปโหลดขึ้น server
  The receiver accepts first; files travel directly over encrypted WebRTC.

### เฟส 2 / Phase 2

- **รหัสยืนยัน (safety code)**: อีโมจิ 4 ตัวที่ได้จาก fingerprint ของการเชื่อมต่อ WebRTC ทั้งสองฝั่ง
  ถ้าตรงกันแปลว่าคุยกับเครื่องที่ถูกต้องจริง ไม่มีใครดักกลางทาง
- **ติดตั้งเป็นแอป (PWA)**: ปุ่ม "ติดตั้งแอป" บนแถบด้านบน (Chrome/Edge/Android), เปิดได้แม้ออฟไลน์
- **รับไฟล์จากเมนูแชร์ (Android)**: หลังติดตั้ง เลือก Nearby จากเมนู "แชร์" ในแอปอื่นได้ (iPhone ยังไม่รองรับ)
- **ไฟล์ใหญ่**: ส่งเป็นชิ้นเล็กต่อเนื่อง ผู้รับเก็บแบบ
  - ≤ 256 MB: เก็บในหน่วยความจำ ดูตัวอย่างได้
  - ใหญ่กว่านั้น บน Chrome/Edge (คอมพิวเตอร์): เลือกที่บันทึก แล้วเขียนลงดิสก์ตรง ๆ
  - เบราว์เซอร์อื่น: ดาวน์โหลดแบบสตรีมผ่าน service worker
  - มีความเร็ว เวลาที่เหลือ และปุ่มยกเลิก (ทั้งฝั่งส่งและรับ)
- **จับคู่ถาวร**: เลือกอุปกรณ์ → "จับคู่ถาวร" → อีกเครื่องเช็กรหัสยืนยันแล้วกด "จับคู่"
  ทั้งสองเครื่องจะเห็นกันอัตโนมัติแม้อยู่คนละเครือข่าย จัดการได้ในหน้าต่าง "ห้อง"

### เชื่อมต่อง่ายขึ้น + แจ้งเตือน / Easier connecting + notifications

- **รหัสห้องเป็น 3 คำ** เช่น "แมว · ส้ม · ดาว" = "cat · orange · star" (คำไทยกับอังกฤษคือห้องเดียวกัน)
  พิมพ์มีหรือไม่มีเว้นวรรคก็ได้ ผสมภาษาได้ และรหัสแบบเก่า 6 ตัวอักษรยังใช้ได้
- **สแกน QR ในแอป** (ปุ่ม "สแกน QR" ในหน้าต่างห้อง) ใช้ BarcodeDetector ถ้ามี ไม่งั้นโหลด jsQR
- **แจ้งเตือนของระบบ** (ปุ่มกระดิ่งบนแถบด้านบน) เมื่อมีคนส่งไฟล์มา (พร้อมปุ่ม รับ/ไม่รับ),
  รับไฟล์เสร็จ, ส่งเสร็จ/ไม่สำเร็จ/ถูกปฏิเสธ, มีข้อความ, มีคนขอจับคู่ และจับคู่สำเร็จ
  - เด้งเฉพาะตอนไม่ได้ดูหน้า Nearby อยู่ และทำงานเฉพาะตอนที่ Nearby เปิดค้างไว้ (ไม่มี push server)
  - สั่นบน Android และแสดงตัวเลขบนไอคอนแอปที่ติดตั้งแล้ว

### ตัวตนของแต่ละเครื่อง / Who is who

- **เปิดมาใช้ได้เลย**: ครั้งแรกจะสุ่มชื่ออวกาศ (เช่น "Sleepy Saturn") มาสคอตและสีให้อัตโนมัติ
  ไม่ต้องตั้งค่าอะไรก่อน เปลี่ยนเองได้ทีหลังจากปุ่มโปรไฟล์ (ตัวเราตรงกลางเรดาร์)
  Open it and send right away: a random space name, mascot and colour are picked for you.
- **มาสคอตอวกาศ 16 ตัว** (ดาวเสาร์ จรวด นักบินอวกาศ เอเลี่ยน ดาวเทียม ฯลฯ) สไตล์สติกเกอร์ชุดเดียวกัน
  วาดเป็น SVG จึงหน้าตาเหมือนกันทุกระบบ และอีก 8 สีพาสเทลให้แต่ละเครื่องแยกกันง่าย
- **จำเครื่องที่เคยเจอ** (เก็บในเครื่องเท่านั้น): ป้าย "ใหม่ / เคยเจอ", เชื่อมต่อล่าสุดเมื่อไหร่,
  ส่ง/รับไปกี่ครั้ง และตั้งชื่อเล่นให้เครื่องอื่นได้ เครื่องที่จับคู่/เคยเจออยู่วงในของเรดาร์
- **การ์ดการโอน**: แต่ละไฟล์มีการ์ดของตัวเองพร้อมความเร็ว เวลาที่เหลือ และปุ่มยกเลิก
- **ธีม**: กลางคืน (ค่าเริ่มต้น) หรือรุ่งเช้า พื้นหลังเป็นท้องฟ้าดาวที่วาดครั้งเดียวลง canvas

### ไฟล์ที่ได้รับ + ดูตัวอย่าง / Received files + preview

- ไฟล์ที่รับมา (ไม่เกิน 256 MB) อยู่ในรายการ "ไฟล์ที่ได้รับ" (ไอคอนถาดบนแถบด้านบน) จนกว่าจะบันทึก ลบ หรือปิดหน้า
  มีขนาดรวมที่ใช้หน่วยความจำ ปุ่มบันทึก / ลบทีละไฟล์ / ล้างทั้งหมด และถามก่อนปิดหน้าถ้ายังมีไฟล์ที่ยังไม่ได้บันทึก
- ดูตัวอย่างได้ในแอป: รูป วิดีโอ เสียง PDF และไฟล์ข้อความ (เลื่อนดูไฟล์ถัดไปได้)
  ตัวอย่างไม่เคยเปิดไฟล์เป็นหน้าเว็บ (เช่น HTML) จึงไม่มีสคริปต์จากเครื่องอื่นมารันในหน้านี้

### เมื่อการโอนสะดุด / When a transfer has a problem

- การ์ดการโอนบอกเสมอว่าเกิดอะไรขึ้นและจะเกิดอะไรต่อ: เน็ตหลุด → นับถอยหลังรอส่งต่อจากจุดเดิม,
  ล้มเหลว / ยกเลิก / ไม่รับ → อธิบายว่าไฟล์ที่ค้างครึ่งทางถูกลบแล้ว พร้อมปุ่ม "ส่งอีกครั้ง" และ "ลบออก"
- ไฟล์ที่รับไม่ครบถูกลบทิ้งเสมอ รวมถึงไฟล์ใหญ่ที่เขียนลงดิสก์ (ไม่มีไฟล์ว่าง/ไฟล์ครึ่งเดียวค้างในเครื่อง)
- ถามยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้: หยุดการโอนที่เริ่มแล้ว, ออกจากห้อง, เปลี่ยนห้องระหว่างโอน,
  เลิกจับคู่, ลบไฟล์ที่ยังไม่ได้บันทึก, ล้างไฟล์ทั้งหมด
- ไม่ย้ายห้องอัตโนมัติ (เช่น ตอนเปลี่ยน Wi‑Fi) ระหว่างที่ยังโอนอยู่
- ลากโฟลเดอร์มาวางจะบอกให้เลือกไฟล์ข้างในแทน (ส่งทั้งโฟลเดอร์ไม่ได้)

### สิทธิ์ / Permissions

- **กล้อง**: ใช้เฉพาะตอนสแกน QR อธิบายก่อนที่เบราว์เซอร์จะถาม ถ้าถูกบล็อกจะบอกวิธีเปิดสิทธิ์ (หรือพิมพ์รหัสแทน)
- **ไฟล์**: ไม่ต้องขอสิทธิ์ แอปอ่านเฉพาะไฟล์ที่ผู้ใช้เลือกเอง ไฟล์ใหญ่บน Chrome/Edge จะให้เลือกที่บันทึกหลังกดรับ
- **การแจ้งเตือน**: ขอเมื่อกดปุ่มกระดิ่งเท่านั้น

### เอฟเฟกต์ + ประหยัดพลังงาน / Effects + power saving

- จุดบนเรดาร์กะพริบตอนเส้นกวาดผ่าน, ดาวหางพุ่งตอนเริ่มส่ง, ดาวแตกกระจายตอนส่งเสร็จ,
  มาสคอตกะพริบตาและยิ้มเมื่อชี้เมาส์
- ใช้แค่ transform/opacity (ให้ GPU ทำ) ไม่มี blur ที่หนักเครื่อง และปิดเองเมื่อเปิด "ลดการเคลื่อนไหว"
- **โหมดประหยัดพลังงาน** (ในโปรไฟล์: อัตโนมัติ / ประหยัด / เต็มที่) อัตโนมัติจะเปิดเองเมื่อเครื่องสเปกต่ำ
  (≤ 2 คอร์ หรือ RAM ≤ 2 GB) หรือแบตเหลือ ≤ 20% และไม่ได้ชาร์จ

### เบื้องหลัง / Under the hood

- Signaling ใช้ [Trystero](https://github.com/dmotz/trystero) ผ่าน Nostr relay สาธารณะ จึง host บน GitHub Pages ได้
- "เครือข่ายเดียวกัน" ใช้ hash ของ public IPv4 เป็นชื่อห้อง (ลองถามจาก ipify, icanhazip, ident.me ตามลำดับ)
- ไบต์ของไฟล์วิ่งบน RTCDataChannel แยก (ชิ้นละ 64 KB) ส่วนข้อความควบคุมอยู่บน Trystero
  ผู้รับตอบ ack ทุก 1 MB และผู้ส่งค้างได้ไม่เกิน 8 MB จึงเร็วแต่ไม่ล้นหน่วยความจำ
- **ส่งต่อได้เมื่อหลุด**: ถ้าการเชื่อมต่อขาดระหว่างส่ง จะต่อจากจุดเดิมภายใน 90 วินาที
  และขอ wake lock ไม่ให้จอดับระหว่างโอน
- การจับคู่ = secret ที่สุ่มแล้วเก็บไว้ทั้งสองเครื่อง ใช้ตั้งชื่อห้องส่วนตัวที่ทั้งคู่เข้าทุกครั้งที่เปิดแอป
- ข้อจำกัด:
  - Wi‑Fi ที่เปิด client isolation หรือเน็ตมือถือบางค่ายอาจต่อตรงไม่ได้ (ไม่มี TURN server)
  - เบราว์เซอร์ที่ไม่มีทั้ง File System Access และ service worker (เช่น บางโหมดของ iOS) รับได้สูงสุด 2 GB ต่อครั้ง

## Development

```bash
npm install
npm run serve        # http://localhost:8080
npm run build:vendor # rebuild vendor/vendor.js after upgrading trystero / qrcode-generator
node scripts/make-icons.mjs  # regenerate PNG icons
```

Tip: `localhost:8080` and `127.0.0.1:8080` have separate storage, so two tabs on those two
addresses behave like two different devices (handy for testing pairing).

### Project layout

| Path | What it does |
|---|---|
| `index.html`, `css/style.css` | Page markup and the night-radar theme (with a light "dawn" variant) |
| `js/app.js` | App wiring: state, sessions, dialogs, paste/drop, transfers, pairing, install |
| `js/net.js` | Networking: network detection, Trystero rooms, offer/accept, chunked transfer, safety code, pair requests |
| `js/sinks.js` | Where received bytes go: memory, disk (File System Access) or streamed download |
| `js/pairing.js` | Saved pairings (localStorage) |
| `js/identity.js` | Random space names, mascot + colour per device |
| `js/known.js` | Devices seen before: badges, last seen, transfer counts, nicknames |
| `js/words.js` | 3-word room codes (Thai / English), parsing incl. Thai typed without spaces |
| `js/notify.js` | System notifications, vibration, app badge, on/off setting |
| `js/ui/scanner.js` | In-app QR scanner (BarcodeDetector or jsQR) |
| `js/i18n.js` | Thai / English strings |
| `js/ui/radar.js` | Radar with device buttons (placement, selection, progress, keyboard) |
| `js/ui/panel.js` | Side panel: selected device / pick prompt / searching / help / error |
| `js/ui/status.js` | Hero heading and scan bar states (searching, found, none, error) |
| `js/ui/avatars.js` | The 16 space mascot SVGs |
| `js/ui/mascot.js` | Device-type badges and line icons |
| `js/ui/transfers.js` | Transfer cards and the transfer tray |
| `js/ui/inbox.js` | Received files list and the preview viewer |
| `js/ui/effects.js` | Effects on/off and power-saving mode |
| `js/ui/sky.js` | Starry background (canvas), twinkles, shooting stars |
| `sw.js` | Service worker: offline cache, share target, streamed downloads |
| `manifest.webmanifest`, `icons/` | PWA manifest and icons (`scripts/make-icons.mjs`) |

The site is plain HTML/CSS/JS with no build step. `vendor/vendor.js` is a pre-bundled copy of the two
dependencies and is committed so GitHub Pages can serve the repo root as-is.
