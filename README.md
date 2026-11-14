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

### เบื้องหลัง / Under the hood

- Signaling ใช้ [Trystero](https://github.com/dmotz/trystero) ผ่าน Nostr relay สาธารณะ จึง host บน GitHub Pages ได้
- "เครือข่ายเดียวกัน" ใช้ hash ของ public IPv4 เป็นชื่อห้อง (ลองถามจาก ipify, icanhazip, ident.me ตามลำดับ)
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
| `js/i18n.js` | Thai / English strings |
| `js/ui/radar.js` | Radar with device buttons (placement, selection, progress, keyboard) |
| `js/ui/panel.js` | Side panel: selected device / pick prompt / searching / help / error |
| `js/ui/status.js` | Hero heading and scan bar states (searching, found, none, error) |
| `js/ui/mascot.js` | Device mascot SVGs and line icons |
| `js/ui/sky.js` | Decorative twinkling stars |
| `sw.js` | Service worker: offline cache, share target, streamed downloads |
| `manifest.webmanifest`, `icons/` | PWA manifest and icons (`scripts/make-icons.mjs`) |

The site is plain HTML/CSS/JS with no build step. `vendor/vendor.js` is a pre-bundled copy of the two
dependencies and is committed so GitHub Pages can serve the repo root as-is.
