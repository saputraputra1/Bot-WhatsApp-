const { Client, LocalAuth } = require('whatsapp-web.js');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// ================================================
// DATABASE SETUP
// ================================================
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

// ================================================
// CLIENT SETUP (PAIRING MODE)
// ================================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox']
    },
    authOptions: {
        qrTimeout: 0, // Nonaktifkan QR
        phonePairingCode: true // Aktifkan pairing code
    }
});

// Track user activity
const userActivity = new Map();

// ================================================
// PAIRING CODE HANDLER
// ================================================
client.on('pairing_code', (code) => {
    console.log(`\nPAIRING CODE: ${code}\n`);
    console.log('Cara Pakai:');
    console.log('1. Buka WhatsApp di HP');
    console.log('2. Menu 3 titik → Linked Devices → Link a Device');
    console.log('3. Masukkan kode di atas\n');
});

client.on('ready', () => {
    console.log('[!] Bot aktif dan siap digunakan!');
    // Bersihkan aktivitas setiap jam
    setInterval(() => {
        userActivity.clear();
        console.log('[!] Aktivitas pengguna dibersihkan');
    }, 3600000);
});

// ================================================
// ANTI-SPAM CORE FUNCTION
// ================================================
client.on('message', async msg => {
    if (msg.from.endsWith('@g.us')) await handleAntiSpam(msg);
});

async function handleAntiSpam(msg) {
    const chat = await msg.getChat();
    const sender = await msg.getContact();
    const userId = sender.id.user;
    const groupId = chat.id._serialized;

    // Skip jika admin
    if (await checkIsAdmin(msg) && db.get(`groupSettings.${groupId}.adminBypass`).value()) {
        return;
    }

    // Inisialisasi data pengguna/grup
    initUserData(userId);
    initGroupData(groupId);

    // Deteksi spam
    const spamDetected = await detectSpam(msg, userId, groupId, msg.body);
    if (spamDetected) {
        await handleSpammer(msg, userId, groupId, spamDetected.type);
    }
}

// ================================================
// IMPROVED DETECT SPAM FUNCTION (FIXED)
// ================================================
async function detectSpam(msg, userId, groupId, message) {
    const userData = db.get(`users.${userId}`).value();
    const groupSettings = db.get(`groupSettings.${groupId}`).value();
    const { flood, caps, repeat, links } = db.get('spamPatterns').value();

    // 1. Deteksi Flood
    const activities = userActivity.get(userId) || [];
    if (activities.length >= flood.threshold) {
        const timeDiff = Date.now() - activities[0].timestamp;
        if (timeDiff < flood.interval) return { type: 'flood', severity: 'high' };
    }

    // 2. Deteksi CAPS
    if (message.length > 10) {
        const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
        if (capsRatio > caps.threshold) return { type: 'caps', severity: 'medium' };
    }

    // 3. Deteksi Repeat
    if (userData.lastMessages.length >= repeat.threshold) {
        const lastMessages = userData.lastMessages.slice(-repeat.threshold);
        if (lastMessages.every(m => m === message)) return { type: 'repeat', severity: 'medium' };
    }

    // 4. Deteksi Links (strict mode only)
    if (groupSettings.strictMode) {
        const detectedLinks = message.match(/https?:\/\/[^\s]+/g) || [];
        if (detectedLinks.some(link => {
            const domain = new URL(link).hostname.replace('www.', '');
            return !links.whitelist.includes(domain);
        })) return { type: 'links', severity: 'high' };
    }

    // 5. Deteksi Pattern Spam (FIXED: ganti nama variabel)
    const SPAM_PATTERNS = [
        /([!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{4,})/,
        /(\w{20,})/,
        /([\u200B-\u200D\uFEFF])/
    ];

    if (SPAM_PATTERNS.some(pattern => pattern.test(message))) {
        return { type: 'pattern', severity: 'high' };
    }

    return null;
}

// ================================================
// HELPER FUNCTIONS
// ================================================
function initUserData(userId) {
    if (!db.get(`users.${userId}`).value()) {
        db.set(`users.${userId}`, {
            warnings: 0,
            lastMessages: [],
            isMuted: false
        }).write();
    }
}

function initGroupData(groupId) {
    if (!db.get(`groupSettings.${groupId}`).value()) {
        db.set(`groupSettings.${groupId}`, {
            antiSpamEnabled: true,
            strictMode: false,
            adminBypass: true
        }).write();
    }
}

async function handleSpammer(msg, userId, groupId, spamType) {
    const chat = await msg.getChat();
    const sender = await msg.getContact();
    const warnings = db.get(`users.${userId}.warnings`).value() + 1;

    // Update peringatan
    db.update(`users.${userId}.warnings`, w => w + 1).write();
    db.update(`users.${userId}.lastMessages`, messages => [...messages, msg.body].slice(-5)).write();

    // Kirim peringatan
    const warningMsg = `@${userId} ${getWarningMessage(spamType)} (Peringatan ${warnings}/3)`;
    await msg.reply(warningMsg);

    // Tindakan jika 3x peringatan
    if (warnings >= 3) {
        const groupSettings = db.get(`groupSettings.${groupId}`).value();
        try {
            if (groupSettings.strictMode) {
                await chat.removeParticipants([sender.id._serialized]);
                await msg.reply(`@${userId} dikeluarkan karena spam.`);
            } else {
                await chat.setMessagesAdminsOnly(true);
                await msg.reply(`@${userId} dimute selama 1 jam.`);
                setTimeout(() => chat.setMessagesAdminsOnly(false), 3600000);
            }
            db.set(`users.${userId}.warnings`, 0).write();
        } catch (error) {
            console.error('Gagal mengambil tindakan:', error);
        }
    }
}

function getWarningMessage(type) {
    const messages = {
        flood: 'Jangan kirim pesan terlalu cepat!',
        caps: 'Hindari huruf kapital berlebihan!',
        repeat: 'Jangan kirim pesan berulang!',
        links: 'Berbagi link dilarang!',
        pattern: 'Pesan terdeteksi sebagai spam!'
    };
    return messages[type] || 'Aktivitas terdeteksi sebagai spam!';
}

async function checkIsAdmin(msg) {
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const participants = await chat.participants;
    return participants.some(p => p.id._serialized === contact.id._serialized && p.isAdmin);
}

// ================================================
// START BOT
// ================================================
client.initialize();
