const fs = require("fs");

const DATA_FILE = "./users.json";

function loadUsers() {
  return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : {};
}

function saveUsers(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function isPhone(msg) {
  return /^628\d{8,13}$/.test(msg);
}

function handlePesan(sender, msg) {
  const db = loadUsers();
  if (!db[sender]) db[sender] = { status: "belum_bayar", step: null };

  const text = msg.toLowerCase();

  if (text === "menu") {
    return `📋 *MENU NOKOS*\n\n1. harga\n2. negara\n3. kualitas\n4. bayar\n5. buat nokos\n6. kontak\n7. grup`;
  }

  if (text === "harga") {
    return `💰 *DAFTAR HARGA NOKOS*\n\n` +
      `🇮🇩 Indonesia:\n  • Biasa: Rp5.000\n  • Premium: Rp8.000\n  • Super: Rp10.000\n\n` +
      `🇺🇸 Amerika Serikat:\n  • Biasa: Rp35.000\n  • Premium: Rp50.000\n  • Super: Rp75.000\n\n` +
      `🇯🇵 Jepang:\n  • Biasa: Rp80.000\n  • Premium: Rp120.000\n  • Super: Rp180.000\n\n` +
      `🇨🇦 Kanada:\n  • Biasa: Rp38.000\n  • Premium: Rp55.000\n  • Super: Rp79.000\n\n` +
      `🇨🇴 Kolombia:\n  • Biasa: Rp21.000\n  • Premium: Rp33.000\n  • Super: Rp49.000\n\n` +
      `🇰🇪 Kenya:\n  • Biasa: Rp17.000\n  • Premium: Rp25.000\n  • Super: Rp33.000\n\n` +
      `🇷🇺 Rusia:\n  • Biasa: Rp40.000\n  • Premium: Rp65.000\n  • Super: Rp85.000\n\n` +
      `🌍 dan negara lainnya tersedia.`;
  }

  if (text === "negara") {
    return `🌍 *Negara Tersedia untuk Nokos:*\n\n` +
      `🇮🇩 Indonesia\n🇺🇸 Amerika Serikat\n🇯🇵 Jepang\n🇨🇦 Kanada\n🇨🇴 Kolombia\n🇰🇪 Kenya\n🇷🇺 Rusia\n` +
      `🇻🇳 Vietnam\n🇪🇬 Mesir\n🇧🇷 Brazil\n🇹🇭 Thailand\n🇭🇰 Hongkong\n🇳🇱 Belanda\n🇩🇪 Jerman`;
  }

  if (text === "kualitas") {
    return `💎 *Penjelasan Kualitas Nokos:*\n\n` +
      `⭐ *Biasa* → Nomor standar, lebih murah, cocok untuk percobaan\n` +
      `⭐⭐ *Premium* → Lebih stabil, prioritas moderat, support aktif\n` +
      `⭐⭐⭐ *Super* → Paling stabil, anti banned, layanan prioritas tinggi`;
  }

  if (text === "bayar") {
    db[sender].status = "sudah_bayar";
    saveUsers(db);
    return `💳 *Metode Pembayaran:*\n\n` +
      `• GoPay: 0895335107865 a.n. IZMET\n` +
      `• SeaBank: 901444670611 a.n. IZMET\n` +
      `• DANA: 085346808546 a.n. REPIKA\n\n` +
      `📌 Setelah transfer, ketik *buat nokos* untuk lanjut.`;
  }

  if (text === "buat nokos") {
    if (db[sender].status !== "sudah_bayar") {
      return `❌ Kamu belum bayar! Ketik *bayar* untuk melanjutkan.`;
    }
    db[sender].step = "input_nomor";
    saveUsers(db);
    return `📲 Silakan kirim nomor HP kamu (format: 628xxxxxxxxxx):`;
  }

  if (db[sender].step === "input_nomor" && isPhone(text)) {
    db[sender].step = null;
    db[sender].nomor = text;
    saveUsers(db);
    return `✅ Nokos berhasil dibuat untuk nomor: *${text}*\n🎉 Silakan cek statusnya di website atau hubungi admin.`;
  }

  if (text === "kontak") {
    return `📞 Hubungi Admin:\nhttps://wa.me/62895335107865`;
  }

  if (text === "grup") {
    return `👥 Gabung Grup WhatsApp:\nhttps://chat.whatsapp.com/KUoGURsIF3Z2WwuUqnQcnS?mode=ac_t`;
  }

  return `❓ Perintah tidak dikenal.\nKetik *menu* untuk melihat semua opsi.`;
}

module.exports = { handlePesan };
