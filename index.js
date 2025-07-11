const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth')
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Termux-Bot', 'Chrome', '120.0.0'],
        logger: { level: 'silent' } // Nonaktifkan log spam
    })

    sock.ev.on('connection.update', (update) => {
        const { qr, connection } = update
        
        // Tampilkan QR di terminal
        if (qr) {
            console.log('\n\n=== SCAN QR INI ===')
            qrcode.generate(qr, { small: true })
            console.log('=== LINK DEVICE ===\n')
        }
        
        // Berhasil terkoneksi
        if (connection === 'open') {
            console.log('✅ Berhasil terhubung ke WhatsApp!')
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

// Jalankan dengan error handling
startBot().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
