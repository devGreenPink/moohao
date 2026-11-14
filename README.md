# Nearby

ส่งไฟล์และข้อความระหว่างอุปกรณ์ที่อยู่ใกล้กัน ผ่านเบราว์เซอร์ ไม่ต้องติดตั้งแอป ไม่ต้องมี server
Share files and text between nearby devices, right in the browser. No install, no server.

## ใช้งาน / How it works

- **เครือข่ายเดียวกัน**: เปิดเว็บบนทุกเครื่องที่ต่อ Wi‑Fi เดียวกัน แล้วจะเห็นกันอัตโนมัติ
  Devices on the same Wi‑Fi find each other automatically.
- **รหัสห้อง / QR**: ถ้าหากันไม่เจอ หรืออยู่คนละเครือข่าย กดปุ่มด้านบนเพื่อสร้างห้อง แล้วสแกน QR จากอีกเครื่อง
  If devices can't see each other, create a room and scan its QR code on the other device.
- คลิกที่อุปกรณ์เพื่อส่งไฟล์, กดไอคอนข้อความเพื่อส่งข้อความ/ลิงก์, ลากไฟล์มาวาง หรือกด Ctrl+V เพื่อส่งสิ่งที่คัดลอกไว้
  Click a device to send files, the bubble to send text, or drag & drop / paste anywhere.
- ผู้รับต้องกด "รับ" ก่อนไฟล์จะถูกส่ง ไฟล์วิ่งตรงระหว่างเครื่องด้วย WebRTC (เข้ารหัส) ไม่ถูกอัปโหลดขึ้น server
  The receiver accepts first; files travel directly over encrypted WebRTC.

### เบื้องหลัง / Under the hood

- Signaling (ให้เครื่องหากันเจอ) ใช้ [Trystero](https://github.com/dmotz/trystero) ผ่าน Nostr relay สาธารณะ จึง host บน GitHub Pages ได้
- การจับกลุ่ม "เครือข่ายเดียวกัน" ใช้ hash ของ public IPv4 (จาก api.ipify.org) เป็นชื่อห้อง
- ข้อจำกัด: ไฟล์ละไม่เกิน 2 GB (ไฟล์ถูกเก็บในหน่วยความจำ), Wi‑Fi ที่เปิด client isolation อาจต่อกันตรงไม่ได้

## Development

```bash
npm install
npm run serve        # http://localhost:8080
npm run build:vendor # rebuild vendor/vendor.js after upgrading trystero / qrcode-generator
```

### Project layout

| Path | What it does |
|---|---|
| `index.html`, `css/style.css` | Page markup and the night-radar theme (with a light "dawn" variant) |
| `js/app.js` | App wiring: state, rooms, dialogs, paste/drop, transfers |
| `js/net.js` | Networking: network detection, Trystero rooms, offer/accept, file and text transfer |
| `js/i18n.js` | Thai / English strings |
| `js/ui/radar.js` | Radar with device buttons (placement, selection, progress, keyboard) |
| `js/ui/panel.js` | Side panel: selected device / pick prompt / searching / help / error |
| `js/ui/status.js` | Hero heading and scan bar states (searching, found, none, error) |
| `js/ui/mascot.js` | Device mascot SVGs and line icons |
| `js/ui/sky.js` | Decorative twinkling stars |

The site is plain HTML/CSS/JS with no build step. `vendor/vendor.js` is a pre-bundled copy of the two
dependencies and is committed so GitHub Pages can serve the repo root as-is.
