const strings = {
  en: {
    tagline: 'Share files with devices nearby',
    searching: 'Looking for devices…',
    emptyLocal: 'Open Nearby on another device on the same Wi‑Fi to send files.',
    emptyRoom: 'Waiting for others to join room {code}. Scan the QR code or enter the code on another device.',
    youAre: 'You are',
    rename: 'Rename this device',
    renamePrompt: 'Device name',
    modeLocal: 'Same network',
    modeRoom: 'Room {code}',
    modeOffline: 'Room code only',
    ipFailed: 'Could not detect your network. Use a room code instead.',
    room: 'Room',
    roomTitle: 'Connect with a room code',
    roomHelp: 'Use this when devices can’t see each other, or to share across different networks.',
    createRoom: 'Create a room',
    joinRoom: 'Join',
    codePlaceholder: 'Enter code',
    yourRoom: 'Your room',
    scanHint: 'Scan with the other device’s camera, or enter the code there.',
    copyLink: 'Copy link',
    leaveRoom: 'Back to same network',
    linkCopied: 'Link copied',
    close: 'Close',
    cancel: 'Cancel',
    send: 'Send',
    accept: 'Accept',
    decline: 'Decline',
    save: 'Save',
    saveAll: 'Save all',
    copy: 'Copy',
    copied: 'Copied',
    open: 'Open link',
    sendText: 'Send a message',
    sendTextTo: 'Message to {name}',
    textPlaceholder: 'Type text or paste a link…',
    incomingTitle: '{name} wants to send you',
    filesCount: '{n} files · {size}',
    receivedTitle: 'Received from {name}',
    messageFrom: 'Message from {name}',
    waiting: 'Waiting…',
    sending: 'Sending',
    receiving: 'Receiving',
    done: 'Done',
    declined: 'Declined',
    failed: 'Failed',
    busy: 'Busy',
    tooBig: 'Files over {size} aren’t supported yet.',
    pickRecipient: 'Click a device to send {what}',
    pastedFiles: '{n} pasted file(s)',
    pastedText: 'the pasted text',
    cancelPending: 'Cancel',
    tapToSend: 'Click to send files',
    dropHere: 'Drop to send',
    theme: 'Toggle theme',
    language: 'ไทย',
    joinError: 'Connection problem: {msg}',
    peerLeft: '{name} left',
    peerJoined: '{name} is here',
    sentTo: 'Sent to {name}',
    phone: 'Phone',
    tablet: 'Tablet',
    desktop: 'Computer',
    about: 'Files go directly between devices with WebRTC and are never uploaded to a server.',
  },
  th: {
    tagline: 'ส่งไฟล์หาเครื่องที่อยู่ใกล้ๆ',
    searching: 'กำลังค้นหาอุปกรณ์…',
    emptyLocal: 'เปิด Nearby บนอีกเครื่องที่ต่อ Wi‑Fi เดียวกัน แล้วจะเห็นกันที่นี่',
    emptyRoom: 'รอเครื่องอื่นเข้าห้อง {code} สแกน QR หรือกรอกรหัสบนอีกเครื่องได้เลย',
    youAre: 'เครื่องนี้ชื่อ',
    rename: 'เปลี่ยนชื่อเครื่องนี้',
    renamePrompt: 'ชื่อเครื่อง',
    modeLocal: 'เครือข่ายเดียวกัน',
    modeRoom: 'ห้อง {code}',
    modeOffline: 'ใช้รหัสห้องเท่านั้น',
    ipFailed: 'ตรวจหาเครือข่ายไม่ได้ ใช้รหัสห้องแทนนะ',
    room: 'ห้อง',
    roomTitle: 'เชื่อมต่อด้วยรหัสห้อง',
    roomHelp: 'ใช้เมื่อเครื่องหากันไม่เจอ หรืออยากส่งข้ามเครือข่าย',
    createRoom: 'สร้างห้อง',
    joinRoom: 'เข้าห้อง',
    codePlaceholder: 'กรอกรหัส',
    yourRoom: 'ห้องของคุณ',
    scanHint: 'สแกนด้วยกล้องของอีกเครื่อง หรือกรอกรหัสที่เครื่องนั้น',
    copyLink: 'คัดลอกลิงก์',
    leaveRoom: 'กลับไปใช้เครือข่ายเดียวกัน',
    linkCopied: 'คัดลอกลิงก์แล้ว',
    close: 'ปิด',
    cancel: 'ยกเลิก',
    send: 'ส่ง',
    accept: 'รับ',
    decline: 'ไม่รับ',
    save: 'บันทึก',
    saveAll: 'บันทึกทั้งหมด',
    copy: 'คัดลอก',
    copied: 'คัดลอกแล้ว',
    open: 'เปิดลิงก์',
    sendText: 'ส่งข้อความ',
    sendTextTo: 'ส่งข้อความหา {name}',
    textPlaceholder: 'พิมพ์ข้อความหรือวางลิงก์…',
    incomingTitle: '{name} ต้องการส่งให้คุณ',
    filesCount: '{n} ไฟล์ · {size}',
    receivedTitle: 'ได้รับจาก {name}',
    messageFrom: 'ข้อความจาก {name}',
    waiting: 'รอตอบรับ…',
    sending: 'กำลังส่ง',
    receiving: 'กำลังรับ',
    done: 'เสร็จแล้ว',
    declined: 'ถูกปฏิเสธ',
    failed: 'ส่งไม่สำเร็จ',
    busy: 'ไม่ว่าง',
    tooBig: 'ยังไม่รองรับไฟล์ที่ใหญ่กว่า {size}',
    pickRecipient: 'คลิกเครื่องที่จะส่ง{what}',
    pastedFiles: 'ไฟล์ที่วาง {n} ไฟล์',
    pastedText: 'ข้อความที่วาง',
    cancelPending: 'ยกเลิก',
    tapToSend: 'คลิกเพื่อส่งไฟล์',
    dropHere: 'ปล่อยเพื่อส่ง',
    theme: 'สลับโหมดมืด/สว่าง',
    language: 'EN',
    joinError: 'เชื่อมต่อมีปัญหา: {msg}',
    peerLeft: '{name} ออกไปแล้ว',
    peerJoined: '{name} เข้ามาแล้ว',
    sentTo: 'ส่งถึง {name} แล้ว',
    phone: 'มือถือ',
    tablet: 'แท็บเล็ต',
    desktop: 'คอมพิวเตอร์',
    about: 'ไฟล์ส่งตรงระหว่างเครื่องด้วย WebRTC ไม่ถูกอัปโหลดขึ้น server',
  },
}

const LANG_KEY = 'nearby.lang'

function readLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved && strings[saved]) return saved
  } catch {}
  return (navigator.language || 'en').toLowerCase().startsWith('th') ? 'th' : 'en'
}

export let lang = readLang()

export function setLang(next) {
  lang = next
  try { localStorage.setItem(LANG_KEY, next) } catch {}
  document.documentElement.lang = next
}

export function t(key, vars = {}) {
  const s = strings[lang][key] ?? strings.en[key] ?? key
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`))
}

/** Fill every element marked with data-i18n / data-i18n-title / data-i18n-placeholder. */
export function applyStatic(root = document) {
  document.documentElement.lang = lang
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n) })
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle)
    el.setAttribute('aria-label', el.title)
  })
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder) })
}
