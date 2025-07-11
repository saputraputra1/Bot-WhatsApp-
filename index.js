const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const { handlePesan } = require("./pesan");
const fs = require("fs");
const qrcode = require("qrcode-terminal"); // ← penting!

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    getMessage: async () => ({})
  });

  // ✅ Ganti printQRInTerminal → tampilkan QR manual
  sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      qrcode.generate(qr, { small: true }); // ✅ Tampilkan QR manual
    }

    if (connection === "open") {
      console.log("✅ Bot aktif! Kamu sudah login.");
    } else if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❌ Terlogout. Jalankan ulang untuk scan ulang.");
      } else {
        console.log("🔄 Koneksi putus. Mencoba ulang...");
        startBot();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    const reply = handlePesan(sender, text);
    if (reply) {
      await sock.sendMessage(sender, { text: reply });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();
