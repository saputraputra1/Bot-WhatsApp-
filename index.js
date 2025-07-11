const { 
    makeWASocket, 
    useSingleFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    proto,
    getContentType 
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');

// Koneksi WhatsApp
const { state, saveState } = useSingleFileAuthState('./auth_info.json');
const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.macOS('Chrome')
});

// Config
const config = {
    name: "Group Guardian Bot",
    prefix: "!",
    pairingCode: "123456", // Ganti dengan kode pairing yang Anda inginkan
    adminNumbers: ["62895335107865"], // Nomor admin
    bannedWords: ["kata1", "kata2", "kata3"], // Kata-kata terlarang
    welcomeMessage: "Selamat datang di grup!",
    goodbyeMessage: "Selamat tinggal!"
};

// Database sederhana
const groupSettings = {};
const userWarnings = {};

// Fungsi untuk menampilkan animasi loading
function showLoadingAnimation(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    return setInterval(() => {
        process.stdout.write(`\r${frames[i = ++i % frames.length]} ${text}`);
    }, 80);
}

// Pairing tanpa QR
conn.on('credentials-updated', () => {
    const authInfo = conn.base64EncodedAuthInfo();
    fs.writeFileSync('./auth_info.json', JSON.stringify(authInfo, null, 2));
});

if (fs.existsSync('./auth_info.json')) {
    conn.loadAuthInfo('./auth_info.json');
}

// Event saat terhubung
conn.on('open', () => {
    const loading = showLoadingAnimation('Bot sedang memulai...');
    
    setTimeout(() => {
        clearInterval(loading);
        console.log('\nBot berhasil terhubung!');
        console.log(`Gunakan kode pairing: ${config.pairingCode}`);
    }, 3000);
});

// Event saat menerima pesan
conn.on('chat-update', async chatUpdate => {
    if (!chatUpdate.hasNewMessage) return;
    
    const m = chatUpdate.messages.all()[0];
    if (!m.message) return;
    
    const messageType = Object.keys(m.message)[0];
    const text = m.message.conversation || 
                (m.message.extendedTextMessage && m.message.extendedTextMessage.text) || '';
    const sender = m.key.remoteJid;
    const isGroup = sender.endsWith('@g.us');
    const groupId = isGroup ? sender : null;
    const user = m.participant ? m.participant : sender;
    
    // Inisialisasi pengaturan grup jika belum ada
    if (isGroup && !groupSettings[groupId]) {
        groupSettings[groupId] = {
            autoKick: true,
            autoAdd: false,
            warnBeforeKick: true
        };
    }
    
    // Cek kata terlarang
    if (isGroup && groupSettings[groupId].autoKick) {
        const bannedWord = config.bannedWords.find(word => 
            text.toLowerCase().includes(word.toLowerCase())
        );
        
        if (bannedWord) {
            if (groupSettings[groupId].warnBeforeKick) {
                // Beri peringatan dulu
                if (!userWarnings[user]) userWarnings[user] = 0;
                userWarnings[user]++;
                
                if (userWarnings[user] < 2) {
                    await conn.sendMessage(groupId, `⚠ Peringatan @${user.split('@')[0]}! Jangan menggunakan kata terlarang "${bannedWord}"`, MessageType.text, {
                        contextInfo: { mentionedJid: [user] }
                    });
                    return;
                }
            }
            
            // Kick member
            try {
                await conn.groupRemove(groupId, [user]);
                await conn.sendMessage(groupId, `🚫 @${user.split('@')[0]} telah dikick karena menggunakan kata terlarang "${bannedWord}"`, MessageType.text, {
                    contextInfo: { mentionedJid: [user] }
                });
                
                // Reset peringatan
                if (userWarnings[user]) delete userWarnings[user];
            } catch (error) {
                console.error('Gagal mengkick member:', error);
            }
        }
    }
    
    // Proses command
    if (text.startsWith(config.prefix)) {
        const command = text.split(' ')[0].slice(config.prefix.length).toLowerCase();
        const args = text.split(' ').slice(1);
        
        // Command untuk admin
        if (config.adminNumbers.includes(user.split('@')[0])) {
            switch(command) {
                case 'add':
                    if (isGroup && args.length > 0) {
                        const numbers = args.map(num => num.includes('@') ? num : num + '@s.whatsapp.net');
                        await conn.groupAdd(groupId, numbers);
                        await conn.sendMessage(groupId, `✅ Berhasil menambahkan ${numbers.length} member`, MessageType.text);
                    }
                    break;
                    
                case 'kick':
                    if (isGroup && args.length > 0) {
                        const numbers = args.map(num => num.includes('@') ? num : num + '@s.whatsapp.net');
                        await conn.groupRemove(groupId, numbers);
                        await conn.sendMessage(groupId, `🚫 Berhasil mengkick ${numbers.length} member`, MessageType.text);
                    }
                    break;
                    
                case 'autokick':
                    if (isGroup) {
                        groupSettings[groupId].autoKick = !groupSettings[groupId].autoKick;
                        const status = groupSettings[groupId].autoKick ? 'AKTIF' : 'NONAKTIF';
                        await conn.sendMessage(groupId, `🔧 Auto Kick: ${status}`, MessageType.text);
                    }
                    break;
                    
                case 'autoadd':
                    if (isGroup) {
                        groupSettings[groupId].autoAdd = !groupSettings[groupId].autoAdd;
                        const status = groupSettings[groupId].autoAdd ? 'AKTIF' : 'NONAKTIF';
                        await conn.sendMessage(groupId, `🔧 Auto Add: ${status}`, MessageType.text);
                    }
                    break;
                    
                case 'warnmode':
                    if (isGroup) {
                        groupSettings[groupId].warnBeforeKick = !groupSettings[groupId].warnBeforeKick;
                        const status = groupSettings[groupId].warnBeforeKick ? 'AKTIF' : 'NONAKTIF';
                        await conn.sendMessage(groupId, `🔧 Peringatan sebelum kick: ${status}`, MessageType.text);
                    }
                    break;
                    
                case 'banword':
                    if (args.length > 0) {
                        const word = args[0].toLowerCase();
                        if (!config.bannedWords.includes(word)) {
                            config.bannedWords.push(word);
                            await conn.sendMessage(sender, `✅ Kata "${word}" ditambahkan ke daftar terlarang`, MessageType.text);
                        } else {
                            await conn.sendMessage(sender, `⚠ Kata "${word}" sudah ada dalam daftar terlarang`, MessageType.text);
                        }
                    }
                    break;
            }
        }
        
        // Command untuk semua user
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

Ketik !help [command] untuk info lebih detail
                `;
                await conn.sendMessage(sender, menu, MessageType.text);
                break;
                
            case 'yt':
                if (args.length > 0) {
                    const loading = showLoadingAnimation('Mengunduh video YouTube...');
                    try {
                        const url = args[0];
                        const { data } = await axios.get(`https://ytdl-api.herokuapp.com/?url=${url}`);
                        
                        clearInterval(loading);
                        console.log('\nVideo berhasil diunduh!');
                        
                        await conn.sendMessage(sender, '📥 Video YouTube berhasil diunduh!', MessageType.text);
                        await conn.sendMessage(sender, data.videoUrl, MessageType.video, {
                            mimetype: Mimetype.mp4,
                            caption: 'Video YouTube'
                        });
                    } catch (error) {
                        clearInterval(loading);
                        console.error('\nGagal mengunduh video:', error);
                        await conn.sendMessage(sender, '❌ Gagal mengunduh video YouTube', MessageType.text);
                    }
                }
                break;
                
            case 'ig':
                if (args.length > 0) {
                    const loading = showLoadingAnimation('Mengunduh video Instagram...');
                    try {
                        const url = args[0];
                        const { data } = await axios.get(`https://instagram-downloader-api.herokuapp.com/?url=${url}`);
                        
                        clearInterval(loading);
                        console.log('\nVideo berhasil diunduh!');
                        
                        await conn.sendMessage(sender, '📥 Video Instagram berhasil diunduh!', MessageType.text);
                        await conn.sendMessage(sender, data.videoUrl, MessageType.video, {
                            mimetype: Mimetype.mp4,
                            caption: 'Video Instagram'
                        });
                    } catch (error) {
                        clearInterval(loading);
                        console.error('\nGagal mengunduh video:', error);
                        await conn.sendMessage(sender, '❌ Gagal mengunduh video Instagram', MessageType.text);
                    }
                }
                break;
                
            case 'tt':
                if (args.length > 0) {
                    const loading = showLoadingAnimation('Mengunduh video TikTok...');
                    try {
                        const url = args[0];
                        const { data } = await axios.get(`https://tiktok-downloader-api.herokuapp.com/?url=${url}`);
                        
                        clearInterval(loading);
                        console.log('\nVideo berhasil diunduh!');
                        
                        await conn.sendMessage(sender, '📥 Video TikTok berhasil diunduh!', MessageType.text);
                        await conn.sendMessage(sender, data.videoUrl, MessageType.video, {
                            mimetype: Mimetype.mp4,
                            caption: 'Video TikTok'
                        });
                    } catch (error) {
                        clearInterval(loading);
                        console.error('\nGagal mengunduh video:', error);
                        await conn.sendMessage(sender, '❌ Gagal mengunduh video TikTok', MessageType.text);
                    }
                }
                break;
                
            case 'song':
                if (args.length > 0) {
                    const loading = showLoadingAnimation('Mencari dan mengunduh lagu...');
                    try {
                        const query = args.join(' ');
                        const { data } = await axios.get(`https://song-downloader-api.herokuapp.com/?query=${encodeURIComponent(query)}`);
                        
                        clearInterval(loading);
                        console.log('\nLagu berhasil diunduh!');
                        
                        await conn.sendMessage(sender, '🎵 Lagu berhasil diunduh!', MessageType.text);
                        await conn.sendMessage(sender, data.audioUrl, MessageType.audio, {
                            mimetype: Mimetype.mp4Audio,
                            ptt: false
                        });
                    } catch (error) {
                        clearInterval(loading);
                        console.error('\nGagal mengunduh lagu:', error);
                        await conn.sendMessage(sender, '❌ Gagal mengunduh lagu', MessageType.text);
                    }
                }
                break;
                
            case 'sticker':
                if (m.message.imageMessage || (m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.quotedMessage && m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage)) {
                    const loading = showLoadingAnimation('Membuat stiker...');
                    try {
                        const imageBuffer = await conn.downloadMediaMessage(m);
                        const outputPath = './temp/sticker.webp';
                        
                        await new Promise((resolve, reject) => {
                            ffmpeg()
                                .input(imageBuffer)
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
                                .on('error', reject);
                        });
                        
                        clearInterval(loading);
                        console.log('\nStiker berhasil dibuat!');
                        
                        await conn.sendMessage(sender, fs.readFileSync(outputPath), MessageType.sticker);
                        fs.unlinkSync(outputPath);
                    } catch (error) {
                        clearInterval(loading);
                        console.error('\nGagal membuat stiker:', error);
                        await conn.sendMessage(sender, '❌ Gagal membuat stiker', MessageType.text);
                    }
                } else {
                    await conn.sendMessage(sender, '⚠ Kirim gambar atau reply gambar dengan caption !sticker', MessageType.text);
                }
                break;
                
            case 'toimg':
                if (m.message.stickerMessage) {
                    const loading = showLoadingAnimation('Mengubah stiker ke gambar...');
                    try {
                        const stickerBuffer = await conn.downloadMediaMessage(m);
                        const outputPath = './temp/image.png';
                        
                        await new Promise((resolve, reject) => {
                            ffmpeg()
                                .input(stickerBuffer)
                                .toFormat('png')
                                .save(outputPath)
                                .on('end', resolve)
                                .on('error', reject);
                        });
                        
                        clearInterval(loading);
                        console.log('\nGambar berhasil dibuat!');
                        
                        await conn.sendMessage(sender, fs.readFileSync(outputPath), MessageType.image, {
                            mimetype: Mimetype.png
                        });
                        fs.unlinkSync(outputPath);
                    } catch (error) {
                        clearInterval(loading);
                        console.error('\nGagal mengubah stiker:', error);
                        await conn.sendMessage(sender, '❌ Gagal mengubah stiker ke gambar', MessageType.text);
                    }
                } else {
                    await conn.sendMessage(sender, '⚠ Kirim stiker dengan caption !toimg', MessageType.text);
                }
                break;
        }
    }
});

// Event saat ada yang bergabung ke grup
conn.on('group-participants-update', async ({jid, participants, action}) => {
    if (action === 'add') {
        // Kirim pesan selamat datang
        await conn.sendMessage(jid, config.welcomeMessage, MessageType.text);
        
        // Jika auto add aktif, tambahkan ke database
        if (groupSettings[jid] && groupSettings[jid].autoAdd) {
            // Simpan data member baru
        }
    } else if (action === 'remove') {
        // Kirim pesan selamat tinggal
        await conn.sendMessage(jid, config.goodbyeMessage, MessageType.text);
    }
});

// Mulai bot
conn.connect();
