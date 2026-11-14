const strings = {
  en: {
    tagline: 'Send files to friends nearby ✦',
    kicker: '✦ NEARBY SPACE ✦',
    youAre: 'You are',
    you: 'You',
    rename: 'Rename this device',
    renamePrompt: 'Device name',
    modeLocal: 'Same network',
    modeRoom: 'Room {code}',
    modeOffline: 'Room code only',

    // hero + scan bar
    heroSearching: 'Looking for friends nearby',
    heroFound: 'Found friends nearby!',
    heroNone: 'No one here yet',
    heroError: 'Can’t connect right now',
    heroSub: 'Tap a device on the radar to send files',
    heroSubNone: 'Open Nearby on another device and it will pop up here',
    scanSearching: 'Scanning for devices',
    scanFound: 'Found {n} device(s)',
    scanNone: 'No devices found yet',
    scanError: 'Something went wrong',
    scanDetailLocal: 'Searching your network automatically',
    scanDetailRoom: 'Searching room {code}',
    scanDetailFound: 'Still scanning for new devices',
    scanDetailNone: 'Still listening — new devices appear on their own',
    countLabel: '{n} found',
    ipFailed: 'Could not detect your network. Use a room code instead.',
    offline: 'You’re offline. Connect to the internet to find devices.',
    joinError: 'Connection problem: {msg}',
    useRoom: 'Use a room code',

    // side panel
    panelKicker: 'Selected device ✦',
    connected: 'Connected · ready for files',
    sendFiles: 'Send files',
    sendText: 'Send a message',
    dropHint: 'Or drag files onto its icon on the radar',
    deselect: 'Close',
    pickTitle: 'Pick a friend on the radar',
    pickBody: 'Select a device to see its details and send files.',
    searchTitle: 'Scanning…',
    searchBody: 'Open Nearby on another device on the same Wi‑Fi and it will appear on the radar.',
    helpTitle: 'Can’t find your device?',
    help1: 'Make sure both devices are on the same Wi‑Fi',
    help2: 'Keep Nearby open on the other device',
    help3: 'Public Wi‑Fi sometimes blocks devices from seeing each other — try a room code',
    radarLabel: 'Devices found',

    // room dialog
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

    // dialogs & transfers
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
    sendTextTo: 'Message to {name}',
    textPlaceholder: 'Type text or paste a link…',
    incomingTitle: '{name} wants to send you',
    filesCount: '{n} files · {size}',
    receivedTitle: 'Received from {name}',
    messageFrom: 'Message from {name}',
    waiting: 'Waiting for accept…',
    sending: 'Sending',
    receiving: 'Receiving',
    done: 'Done',
    declined: 'Declined',
    failed: 'Failed',
    busy: 'Busy with another transfer',
    tooBig: 'Files over {size} aren’t supported yet.',
    pickRecipient: 'Tap a device to send {what}',
    pastedFiles: '{n} pasted file(s)',
    pastedText: 'the pasted text',
    cancelPending: 'Cancel',
    dropHere: 'Drop to send',
    theme: 'Toggle theme',
    language: 'ไทย',
    sentTo: 'Sent to {name}',
    phone: 'Phone',
    tablet: 'Tablet',
    desktop: 'Computer',
    about: 'Files go directly between devices with WebRTC and are never uploaded to a server.',
  },
  th: {
    tagline: 'ส่งไฟล์ให้เพื่อนใกล้ ๆ ✦',
    kicker: '✦ NEARBY SPACE ✦',
    youAre: 'เครื่องนี้ชื่อ',
    you: 'คุณ',
    rename: 'เปลี่ยนชื่อเครื่องนี้',
    renamePrompt: 'ชื่อเครื่อง',
    modeLocal: 'เครือข่ายเดียวกัน',
    modeRoom: 'ห้อง {code}',
    modeOffline: 'ใช้รหัสห้องเท่านั้น',

    heroSearching: 'กำลังมองหาเพื่อนใกล้ ๆ',
    heroFound: 'เจอเพื่อนแล้ว!',
    heroNone: 'ยังไม่เจอใครเลย',
    heroError: 'ตอนนี้เชื่อมต่อไม่ได้',
    heroSub: 'แตะอุปกรณ์บนเรดาร์เพื่อส่งไฟล์กันเลย',
    heroSubNone: 'เปิด Nearby บนอีกเครื่อง แล้วจะโผล่มาที่นี่',
    scanSearching: 'กำลังสแกนหาอุปกรณ์',
    scanFound: 'เจอแล้ว {n} อุปกรณ์',
    scanNone: 'ยังไม่พบอุปกรณ์',
    scanError: 'เกิดข้อผิดพลาด',
    scanDetailLocal: 'ค้นหาในเครือข่ายเดียวกันอัตโนมัติ',
    scanDetailRoom: 'ค้นหาในห้อง {code}',
    scanDetailFound: 'ยังสแกนต่อเพื่อหาเครื่องใหม่',
    scanDetailNone: 'ยังคอยฟังอยู่ เครื่องใหม่จะโผล่มาเอง',
    countLabel: '{n} ดวง',
    ipFailed: 'ตรวจหาเครือข่ายไม่ได้ ใช้รหัสห้องแทนนะ',
    offline: 'ไม่ได้ต่ออินเทอร์เน็ต ต่อเน็ตก่อนแล้วจะค้นหาได้',
    joinError: 'เชื่อมต่อมีปัญหา: {msg}',
    useRoom: 'ใช้รหัสห้องแทน',

    panelKicker: 'ดาวที่เลือกอยู่ ✦',
    connected: 'เชื่อมต่อแล้ว · พร้อมรับไฟล์',
    sendFiles: 'ส่งไฟล์เลย',
    sendText: 'ส่งข้อความ',
    dropHint: 'หรือลากไฟล์มาวางบนไอคอนในเรดาร์ได้เลย',
    deselect: 'ปิด',
    pickTitle: 'เลือกเพื่อนบนเรดาร์',
    pickBody: 'แตะอุปกรณ์เพื่อดูรายละเอียดและส่งไฟล์',
    searchTitle: 'กำลังค้นหา…',
    searchBody: 'เปิด Nearby บนอีกเครื่องที่ต่อ Wi‑Fi เดียวกัน แล้วจะโผล่บนเรดาร์',
    helpTitle: 'หาไม่เจอใช่ไหม?',
    help1: 'ให้ทุกเครื่องต่อ Wi‑Fi วงเดียวกัน',
    help2: 'เปิด Nearby บนอีกเครื่องค้างไว้',
    help3: 'Wi‑Fi สาธารณะบางที่บล็อกไม่ให้เครื่องเห็นกัน ลองใช้รหัสห้อง',
    radarLabel: 'อุปกรณ์ที่พบ',

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
    sendTextTo: 'ส่งข้อความหา {name}',
    textPlaceholder: 'พิมพ์ข้อความหรือวางลิงก์…',
    incomingTitle: '{name} ต้องการส่งให้คุณ',
    filesCount: '{n} ไฟล์ · {size}',
    receivedTitle: 'ได้รับจาก {name}',
    messageFrom: 'ข้อความจาก {name}',
    waiting: 'รออีกฝั่งกดรับ…',
    sending: 'กำลังส่ง',
    receiving: 'กำลังรับ',
    done: 'เสร็จแล้ว',
    declined: 'ถูกปฏิเสธ',
    failed: 'ส่งไม่สำเร็จ',
    busy: 'กำลังส่งไฟล์อื่นอยู่',
    tooBig: 'ยังไม่รองรับไฟล์ที่ใหญ่กว่า {size}',
    pickRecipient: 'แตะเครื่องที่จะส่ง{what}',
    pastedFiles: 'ไฟล์ที่วาง {n} ไฟล์',
    pastedText: 'ข้อความที่วาง',
    cancelPending: 'ยกเลิก',
    dropHere: 'ปล่อยเพื่อส่ง',
    theme: 'สลับธีมกลางคืน/กลางวัน',
    language: 'EN',
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
