const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const { handlePesan } = require("./pesan");

async function startBot() {
  const { state, saveCreds, getPairingCode } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    getMessage: async () => ({}),
  });

  // Tampilkan pairing code hanya sekali saat login pertama
  if (!state.creds?.registered) {
    const nomor = "628xxxxxxxxxx"; // ← Ganti dengan nomor kamu (tanpa +)
    const code = await getPairingCode(nomor);
    console.log(`🔐 Pairing Code untuk ${nomor}: ${code}`);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    const balasan = handlePesan(sender, text);
    if (balasan) {
      await sock.sendMessage(sender, { text: balasan });
    }
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❌ Terlogout. Jalankan ulang untuk pairing ulang.");
      } else {
        console.log("🔁 Koneksi terputus. Menghubungkan ulang...");
        startBot(); // Auto reconnect
      }
    } else if (connection === "open") {
      console.log("✅ Bot WhatsApp aktif via Pairing Code!");
    }
  });
}

startBot();
