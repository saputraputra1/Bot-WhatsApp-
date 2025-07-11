const { makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

async function startBot() {
    // 1. Inisialisasi Session
    const { state, saveCreds } = await useMultiFileAuthState('auth_session')
    
    // 2. Buat Socket Connection
    const sock = makeWASocket({
        auth: state,
        browser: Browsers.macOS('Desktop'),
        logger: { level: 'warn' } // Hanya tampilkan warning dan error
    })

    // 3. Handle QR Code Manual
    sock.ev.on('connection.update', async (update) => {
        const { qr, connection } = update
        
        // Generate QR di Terminal
        if (qr) {
            console.log('\n=== SCAN QR INI ===')
            qrcode.generate(qr, { small: true })
            
            // Simpan QR ke File (Opsional)
            fs.writeFileSync('qr-code.txt', qr)
        }
        
        // Handle Koneksi
        if (connection === 'open') {
            console.log('✅ Berhasil terhubung ke WhatsApp!')
            await sock.sendMessage('status@broadcast', { text: 'Bot aktif!' })
        }
        
        if (connection === 'close') {
            console.log('⌛ Mencoba reconnect...')
            startBot()
        }
    })

    // 4. Simpan Session
    sock.ev.on('creds.update', saveCreds)
}

// 5. Jalankan dengan Error Handling
startBot().catch(err => {
    console.error('Error utama:', err)
    process.exit(1)
})
