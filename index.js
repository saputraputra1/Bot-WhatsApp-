const { makeWASocket, useSingleFileAuthState, fetchLatestBaileysVersion, Browsers, delay, proto } = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const ffmpeg = require('fluent-ffmpeg')
const { exec } = require('child_process')

// Config
const config = {
    name: "Group Guardian Bot",
    prefix: "!",
    pairingCode: "123456", // Ganti dengan kode pairing
    adminNumbers: ["6281234567890"], // Nomor admin
    bannedWords: ["kata1", "kata2", "kata3"], // Kata terlarang
    welcomeMessage: "Selamat datang di grup!",
    goodbyeMessage: "Selamat tinggal!",
    apiKeys: {
        ytdl: "https://ytdl-api.example.com",
        igdl: "https://instagram-downloader.example.com",
        ttdl: "https://tiktok-downloader.example.com"
    }
}

// Database sederhana
const groupSettings = {}
const userWarnings = {}

// Animasi loading
function showLoadingAnimation(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let i = 0
    return setInterval(() => {
        process.stdout.write(`\r${frames[i = ++i % frames.length]} ${text}`)
    }, 80)
}

// Auth state
const { state, saveState } = useSingleFileAuthState('./auth_info.json')

async function startBot() {
    const { version } = await fetchLatestBaileysVersion()
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        getMessage: async (key) => {
            return {}
        }
    })

    // Event connection
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update
        
        if (connection === 'open') {
            const loading = showLoadingAnimation('Bot sedang memulai...')
            setTimeout(() => {
                clearInterval(loading)
                console.log('\nBot berhasil terhubung!')
                console.log(`Gunakan kode pairing: ${config.pairingCode}`)
            }, 3000)
        }
        
        if (qr === config.pairingCode) {
            console.log('Pairing berhasil!')
        }
        
        if (connection === 'close') {
            console.log('Koneksi terputus, mencoba menghubungkan kembali...')
            startBot()
        }
    })

    // Event messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message) return
        
        const messageType = Object.keys(m.message)[0]
        const text = m.message.conversation || 
                    (m.message.extendedTextMessage && m.message.extendedTextMessage.text) || ''
        const sender = m.key.remoteJid
        const isGroup = sender.endsWith('@g.us')
        const groupId = isGroup ? sender : null
        const user = m.participant ? m.participant : sender
        
        // Inisialisasi grup
        if (isGroup && !groupSettings[groupId]) {
            groupSettings[groupId] = {
                autoKick: true,
                autoAdd: false,
                warnBeforeKick: true
            }
        }
        
        // Cek kata terlarang
        if (isGroup && groupSettings[groupId].autoKick) {
            const bannedWord = config.bannedWords.find(word => 
                text.toLowerCase().includes(word.toLowerCase())
            )
            
            if (bannedWord) {
                if (groupSettings[groupId].warnBeforeKick) {
                    if (!userWarnings[user]) userWarnings[user] = 0
                    userWarnings[user]++
                    
                    if (userWarnings[user] < 2) {
                        await sock.sendMessage(groupId, { 
                            text: `⚠ Peringatan @${user.split('@')[0]}! Jangan menggunakan kata terlarang "${bannedWord}"`,
                            mentions: [user]
                        })
                        return
                    }
                }
                
                try {
                    await sock.groupParticipantsUpdate(groupId, [user], 'remove')
                    await sock.sendMessage(groupId, { 
                        text: `🚫 @${user.split('@')[0]} telah dikick karena menggunakan kata terlarang "${bannedWord}"`,
                        mentions: [user]
                    })
                    
                    if (userWarnings[user]) delete userWarnings[user]
                } catch (error) {
                    console.error('Gagal mengkick member:', error)
                }
            }
        }
        
        // Proses command
        if (text.startsWith(config.prefix)) {
            const command = text.split(' ')[0].slice(config.prefix.length).toLowerCase()
            const args = text.split(' ').slice(1)
            
            // Command admin
            if (config.adminNumbers.includes(user.split('@')[0])) {
                switch(command) {
                    case 'add':
                        if (isGroup && args.length > 0) {
                            const numbers = args.map(num => num.includes('@') ? num : num + '@s.whatsapp.net')
                            await sock.groupParticipantsUpdate(groupId, numbers, 'add')
                            await sock.sendMessage(groupId, { text: `✅ Berhasil menambahkan ${numbers.length} member` })
                        }
                        break
                        
                    case 'kick':
                        if (isGroup && args.length > 0) {
                            const numbers = args.map(num => num.includes('@') ? num : num + '@s.whatsapp.net')
                            await sock.groupParticipantsUpdate(groupId, numbers, 'remove')
                            await sock.sendMessage(groupId, { text: `🚫 Berhasil mengkick ${numbers.length} member` })
                        }
                        break
                        
                    case 'autokick':
                        if (isGroup) {
                            groupSettings[groupId].autoKick = !groupSettings[groupId].autoKick
                            const status = groupSettings[groupId].autoKick ? 'AKTIF' : 'NONAKTIF'
                            await sock.sendMessage(groupId, { text: `🔧 Auto Kick: ${status}` })
                        }
                        break
                        
                    case 'autoadd':
                        if (isGroup) {
                            groupSettings[groupId].autoAdd = !groupSettings[groupId].autoAdd
                            const status = groupSettings[groupId].autoAdd ? 'AKTIF' : 'NONAKTIF'
                            await sock.sendMessage(groupId, { text: `🔧 Auto Add: ${status}` })
                        }
                        break
                        
                    case 'warnmode':
                        if (isGroup) {
                            groupSettings[groupId].warnBeforeKick = !groupSettings[groupId].warnBeforeKick
                            const status = groupSettings[groupId].warnBeforeKick ? 'AKTIF' : 'NONAKTIF'
                            await sock.sendMessage(groupId, { text: `🔧 Peringatan sebelum kick: ${status}` })
                        }
                        break
                        
                    case 'banword':
                        if (args.length > 0) {
                            const word = args[0].toLowerCase()
                            if (!config.bannedWords.includes(word)) {
                                config.bannedWords.push(word)
                                await sock.sendMessage(sender, { text: `✅ Kata "${word}" ditambahkan ke daftar terlarang` })
                            } else {
                                await sock.sendMessage(sender, { text: `⚠ Kata "${word}" sudah ada dalam daftar terlarang` })
                            }
                        }
                        break
                }
            }
            
            // Command umum
            switch(command) {
                case 'menu':
                    const menu = `
🤖 *${config.name}* 🤖

📌 *Admin Commands:*
!add [nomor] - Tambahkan member
!kick [nomor] - Kick member
!autokick - Aktifkan/nonaktifkan auto kick
!autoadd - Aktifkan/nonaktifkan auto add
!warnmode - Aktifkan/nonaktifkan peringatan sebelum kick
!banword [kata] - Tambahkan kata terlarang

📥 *Download Commands:*
!yt [url] - Download video YouTube
!ig [url] - Download video Instagram
!tt [url] - Download video TikTok
!song [judul] - Download lagu

🖼 *Media Commands:*
!sticker - Buat stiker dari gambar
!toimg - Ubah stiker menjadi gambar
!resize [lebar] [tinggi] - Ubah ukuran gambar
                    `
                    await sock.sendMessage(sender, { text: menu })
                    break
                    
                case 'yt':
                    if (args.length > 0) {
                        const loading = showLoadingAnimation('Mengunduh video YouTube...')
                        try {
                            const url = args[0]
                            const { data } = await axios.get(`${config.apiKeys.ytdl}?url=${url}`)
                            
                            clearInterval(loading)
                            console.log('\nVideo berhasil diunduh!')
                            
                            await sock.sendMessage(sender, { text: '📥 Video YouTube berhasil diunduh!' })
                            await sock.sendMessage(sender, {
                                video: { url: data.videoUrl },
                                caption: 'Video YouTube'
                            })
                        } catch (error) {
                            clearInterval(loading)
                            console.error('\nGagal mengunduh video:', error)
                            await sock.sendMessage(sender, { text: '❌ Gagal mengunduh video YouTube' })
                        }
                    }
                    break
                    
                case 'ig':
                    // Implementasi serupa dengan yt
                    break
                    
                case 'tt':
                    // Implementasi serupa dengan yt
                    break
                    
                case 'song':
                    // Implementasi download lagu
                    break
                    
                case 'sticker':
                    if (m.message.imageMessage || (m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage)) {
                        const loading = showLoadingAnimation('Membuat stiker...')
                        try {
                            const buffer = await sock.downloadMediaMessage(m)
                            const outputPath = './temp/sticker.webp'
                            
                            await new Promise((resolve, reject) => {
                                ffmpeg(buffer)
                                    .input(buffer)
                                    .outputOptions([
                                        '-vcodec libwebp',
                                        '-vf scale=512:512',
                                        '-lossless 1',
                                        '-q 80',
                                        '-preset default',
                                        '-loop 0',
                                        '-an',
                                        '-vsync 0'
                                    ])
                                    .toFormat('webp')
                                    .save(outputPath)
                                    .on('end', resolve)
                                    .on('error', reject)
                            })
                            
                            clearInterval(loading)
                            await sock.sendMessage(sender, {
                                sticker: fs.readFileSync(outputPath)
                            })
                            fs.unlinkSync(outputPath)
                        } catch (error) {
                            clearInterval(loading)
                            await sock.sendMessage(sender, { text: '❌ Gagal membuat stiker' })
                        }
                    }
                    break
                    
                case 'toimg':
                    if (m.message.stickerMessage) {
                        const loading = showLoadingAnimation('Mengubah stiker ke gambar...')
                        try {
                            const buffer = await sock.downloadMediaMessage(m)
                            const outputPath = './temp/image.png'
                            
                            await new Promise((resolve, reject) => {
                                ffmpeg(buffer)
                                    .toFormat('png')
                                    .save(outputPath)
                                    .on('end', resolve)
                                    .on('error', reject)
                            })
                            
                            clearInterval(loading)
                            await sock.sendMessage(sender, {
                                image: fs.readFileSync(outputPath)
                            })
                            fs.unlinkSync(outputPath)
                        } catch (error) {
                            clearInterval(loading)
                            await sock.sendMessage(sender, { text: '❌ Gagal mengubah stiker ke gambar' })
                        }
                    }
                    break
            }
        }
    })

    // Event group update
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (action === 'add') {
            await sock.sendMessage(id, { text: config.welcomeMessage })
        } else if (action === 'remove') {
            await sock.sendMessage(id, { text: config.goodbyeMessage })
        }
    })

    // Simpan credentials
    sock.ev.on('creds.update', saveState)
}

// Mulai bot
startBot().catch(err => console.log(err))
