const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// Setup database
const adapter = new FileSync('spam-db.json');
const db = low(adapter);
db.defaults({ 
    users: {}, 
    groupSettings: {},
    spamPatterns: {
        flood: { threshold: 5, interval: 10000 }, // 5 pesan dalam 10 detik
        caps: { threshold: 0.7 }, // 70% huruf kapital
        repeat: { threshold: 3 }, // 3 pesan berulang
        links: { whitelist: [] } // domain yang diizinkan
    }
}).write();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

// Variabel untuk melacak aktivitas pengguna
const userActivity = new Map();

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot siap digunakan!');
    // Jadwal pembersihan data aktivitas setiap jam
    setInterval(() => {
        userActivity.clear();
        console.log('Aktivitas pengguna dibersihkan');
    }, 3600000);
});

client.on('message', async msg => {
    if (msg.from.endsWith('@g.us')) {
        await handleAntiSpam(msg);
    }
});

async function handleAntiSpam(msg) {
    const chat = await msg.getChat();
    const sender = await msg.getContact();
    const userId = sender.id.user;
    const groupId = chat.id._serialized;
    const message = msg.body;
    
    // Inisialisasi data grup jika belum ada
    if (!db.get(`groupSettings.${groupId}`).value()) {
        db.set(`groupSettings.${groupId}`, {
            antiSpamEnabled: true,
            strictMode: false,
            adminBypass: true
        }).write();
    }
    
    // Skip jika pengirim adalah admin dan adminBypass aktif
    const isAdmin = await checkIsAdmin(msg);
    if (isAdmin && db.get(`groupSettings.${groupId}.adminBypass`).value()) {
        return;
    }
    
    // Inisialisasi data pengguna jika belum ada
    if (!db.get(`users.${userId}`).value()) {
        db.set(`users.${userId}`, {
            warnings: 0,
            lastMessages: [],
            lastLinks: [],
            isMuted: false
        }).write();
    }
    
    // Update aktivitas pengguna
    updateUserActivity(userId, groupId, message);
    
    // Deteksi berbagai jenis spam
    const spamDetected = await detectSpam(msg, userId, groupId, message);
    
    if (spamDetected) {
        await handleSpammer(msg, userId, groupId, spamDetected.type);
    }
}

async function detectSpam(msg, userId, groupId, message) {
    const userData = db.get(`users.${userId}`).value();
    const groupSettings = db.get(`groupSettings.${groupId}`).value();
    const spamPatterns = db.get('spamPatterns').value();
    
    // 1. Deteksi Flood (terlalu banyak pesan dalam waktu singkat)
    const userMessages = userActivity.get(userId) || [];
    if (userMessages.length >= spamPatterns.flood.threshold) {
        const firstMessageTime = userMessages[0].timestamp;
        const timeDiff = Date.now() - firstMessageTime;
        
        if (timeDiff < spamPatterns.flood.interval) {
            return { type: 'flood', severity: 'high' };
        }
    }
    
    // 2. Deteksi CAPS LOCK (terlalu banyak huruf kapital)
    if (message.length > 10) {
        const capsCount = (message.match(/[A-Z]/g) || []).length;
        const capsRatio = capsCount / message.length;
        
        if (capsRatio > spamPatterns.caps.threshold) {
            return { type: 'caps', severity: 'medium' };
        }
    }
    
    // 3. Deteksi pesan berulang
    if (userData.lastMessages.length >= spamPatterns.repeat.threshold) {
        const lastMessages = userData.lastMessages.slice(-spamPatterns.repeat.threshold);
        const allSame = lastMessages.every(m => m === message);
        
        if (allSame) {
            return { type: 'repeat', severity: 'medium' };
        }
    }
    
    // 4. Deteksi link (jika strict mode aktif)
    if (groupSettings.strictMode) {
        const linkRegex = /https?:\/\/[^\s]+/g;
        const links = message.match(linkRegex) || [];
        
        if (links.length > 0) {
            const whitelist = spamPatterns.links.whitelist;
            const hasNonWhitelisted = links.some(link => {
                const domain = new URL(link).hostname.replace('www.', '');
                return !whitelist.includes(domain);
            });
            
            if (hasNonWhitelisted) {
                return { type: 'links', severity: 'high' };
            }
        }
    }
    
    // 5. Deteksi karakter khusus/spam pattern
    const spamPatterns = [
        /([!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{4,})/, // Banyak karakter khusus
        /(\w{20,})/, // Kata sangat panjang
        /([\u200B-\u200D\uFEFF])/ // Karakter tak terlihat
    ];
    
    for (const pattern of spamPatterns) {
        if (pattern.test(message)) {
            return { type: 'pattern', severity: 'high' };
        }
    }
    
    return null;
}

async function handleSpammer(msg, userId, groupId, spamType) {
    const chat = await msg.getChat();
    const sender = await msg.getContact();
    const userName = sender.pushname || sender.id.user;
    const groupSettings = db.get(`groupSettings.${groupId}`).value();
    
    // Update peringatan pengguna
    db.update(`users.${userId}.warnings`, w => w + 1).write();
    db.update(`users.${userId}.lastMessages`, messages => [...messages, msg.body].slice(-10)).write();
    
    const warnings = db.get(`users.${userId}.warnings`).value();
    
    // Pesan peringatan berdasarkan jenis spam
    const warningMessages = {
        flood: `@${userId} Mohon jangan mengirim pesan terlalu cepat! (Peringatan ${warnings}/3)`,
        caps: `@${userId} Mohon hindari penggunaan huruf kapital berlebihan! (Peringatan ${warnings}/3)`,
        repeat: `@${userId} Mohon jangan mengirim pesan yang sama berulang kali! (Peringatan ${warnings}/3)`,
        links: `@${userId} Berbagi link tidak diizinkan di grup ini! (Peringatan ${warnings}/3)`,
        pattern: `@${userId} Pesan Anda terdeteksi sebagai spam! (Peringatan ${warnings}/3)`
    };
    
    await msg.reply(warningMessages[spamType] || `@${userId} Aktivitas Anda terdeteksi sebagai spam! (Peringatan ${warnings}/3)`);
    
    // Aksi berdasarkan jumlah peringatan
    if (warnings >= 3) {
        try {
            if (groupSettings.strictMode) {
                await chat.removeParticipants([sender.id._serialized]);
                await msg.reply(`@${userId} telah dikick karena spam.`);
            } else {
                // Mute pengguna (dengan mengubah izin grup)
                await chat.setMessagesAdminsOnly(true);
                await msg.reply(`@${userId} telah dimute karena spam.`);
                db.set(`users.${userId}.isMuted`, true).write();
                
                // Unmute setelah 1 jam
                setTimeout(async () => {
                    await chat.setMessagesAdminsOnly(false);
                    db.set(`users.${userId}.isMuted`, false).write();
                    db.set(`users.${userId}.warnings`, 0).write();
                }, 3600000);
            }
            
            // Reset peringatan
            db.set(`users.${userId}.warnings`, 0).write();
        } catch (error) {
            console.error('Gagal mengambil tindakan anti-spam:', error);
        }
    }
}

function updateUserActivity(userId, groupId, message) {
    const now = Date.now();
    const userData = { timestamp: now, groupId, message };
    
    if (!userActivity.has(userId)) {
        userActivity.set(userId, [userData]);
    } else {
        const activities = userActivity.get(userId);
        activities.push(userData);
        
        // Simpan hanya 10 aktivitas terakhir
        if (activities.length > 10) {
            userActivity.set(userId, activities.slice(-10));
        }
    }
    
    // Update database
    db.update(`users.${userId}.lastMessages`, messages => [...(messages || []), message].slice(-5)).write();
}

async function checkIsAdmin(msg) {
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const participants = await chat.participants;
    
    const user = participants.find(
        participant => participant.id._serialized === contact.id._serialized
    );
    
    return user && user.isAdmin;
}

client.initialize();