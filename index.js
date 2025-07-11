const { makeWASocket, useMultiFileAuthState, Browsers, delay } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')

// Config
const config = {
    sessionPath: './auth_session',
    browserName: 'Termux-Bot',
    qrTimeout: 60000, // 60 detik
    maxRetries: 5
}

// Buat folder session jika belum ada
if (!fs.existsSync(config.sessionPath)) {
    fs.mkdirSync(config.sessionPath, { recursive: true })
}

async function startBot(retryCount = 0) {
    try {
        console.log('🔄 Memulai bot...')
        
        // 1. Inisialisasi Session
        const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath)
        
        // 2. Buat Socket Connection
        const sock = makeWASocket({
            auth: state,
            browser: [config.browserName, 'Chrome', '3.0'],
            printQRInTerminal: false, // Wajib false untuk versi terbaru
            logger: { level: 'warn' }, // Hanya tampilkan warning dan error
            qrTimeout: config.qrTimeout
        })

        // 3. Handle QR Code Manual
        sock.ev.on('connection.update', async (update) => {
            const { qr, connection, lastDisconnect } = update
            
            // Generate QR di Terminal
            if (qr) {
                console.log('\n╔════════════════════════════╗')
                console.log('║       SCAN QR INI         ║')
                console.log('╚════════════════════════════╝')
                qrcode.generate(qr, { small: true })
                
                // Simpan QR ke File (Opsional)
                fs.writeFileSync(path.join(config.sessionPath, 'qr-code.txt'), qr)
            }
            
            // Handle Koneksi Berhasil
            if (connection === 'open') {
                console.log('\n✅ Berhasil terhubung ke WhatsApp!')
                retryCount = 0 // Reset retry counter
                
                // Kirim test message
                await sock.sendMessage('status@broadcast', { 
                    text: `Bot aktif pada ${new Date().toLocaleString()}`
                })
            }
            
            // Handle Koneksi Terputus
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401
                console.log(`⌛ Koneksi terputus, mencoba reconnect... (${retryCount + 1}/${config.maxRetries})`)
                
                if (shouldReconnect && retryCount < config.maxRetries) {
                    await delay(5000)
                    startBot(retryCount + 1)
                } else {
                    console.error('❌ Gagal reconnect setelah beberapa percobaan')
                    process.exit(1)
                }
            }
        })

        // 4. Simpan Session
        sock.ev.on('creds.update', saveCreds)

        // 5. Handle Error Global
        sock.ev.on('messages.upsert', () => {})
        process.on('uncaughtException', (err) => {
            console.error('⚠ Error tidak tertangkap:', err)
        })

    } catch (err) {
        console.error('❌ Error utama:', err)
        if (retryCount < config.maxRetries) {
            console.log(`Mencoba ulang dalam 5 detik... (${retryCount + 1}/${config.maxRetries})`)
            await delay(5000)
            startBot(retryCount + 1)
        } else {
            console.error('🚫 Gagal memulai bot setelah beberapa percobaan')
            process.exit(1)
        }
    }
}

// Jalankan bot
startBot().catch(err => {
    console.error('🚫 Error fatal:', err)
    process.exit(1)
})
