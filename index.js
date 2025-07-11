const { makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

// Fix logger error
const fixedLogger = {
    level: 'warn',
    child() {
        return {
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: console.warn,
            error: console.error,
            fatal: console.error
        }
    }
}

async function startBot() {
    try {
        console.log('🚀 Starting WhatsApp Bot...')
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_session')
        
        const sock = makeWASocket({
            auth: state,
            browser: Browsers.macOS('Desktop'),
            logger: fixedLogger, // Gunakan logger yang sudah difix
            printQRInTerminal: false // WAJIB false
        })

        // QR Code Handler
        sock.ev.on('connection.update', ({ qr, connection }) => {
            if (qr) {
                console.log('\n▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄')
                console.log('█ SCAN QR INI █')
                console.log('▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀')
                qrcode.generate(qr, { small: true })
            }
            
            if (connection === 'open') {
                console.log('\n✅ Connected to WhatsApp!')
                sock.sendMessage('status@broadcast', { text: 'Bot aktif!' })
            }
        })

        // Save session
        sock.ev.on('creds.update', saveCreds)

    } catch (err) {
        console.error('❌ Main Error:', err)
        process.exit(1)
    }
}

startBot()
