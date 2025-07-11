const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const fs = require('fs')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session') 
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Aktifkan QR di terminal
        browser: ['Termux-Bot', 'Safari', '1.0.0']
    })

    sock.ev.on('connection.update', (update) => {
        if (update.qr) {
            console.log('Scan QR ini di WhatsApp > Linked Devices')
        }
        
        if (update.connection === 'open') {
            console.log('Bot berhasil terhubung!')
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

startBot().catch(console.error)
