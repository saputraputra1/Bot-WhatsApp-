const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const { handlePesan } = require("./pesan");
const fs = require("fs");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    getMessage: async () => ({})
  });

  // Menampilkan Pairing Code jika belum login
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ Bot WhatsApp aktif via Pairing Code!");
      if (!state.creds?.registered) {
        try {
          const kode = await sock.requestPairingCode("6285647271487"); // ← ganti dengan nomor kamu
          console.log("🔐 Pairing Code (masukkan di HP):", kode);
        } catch (err) {
          console.error("❌ Gagal mendapatkan pairing code:", err);
        }
      }
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❌ Logout. Jalankan ulang untuk pairing ulang.");
      } else {
        console.log("🔄 Terputus. Menghubungkan ulang...");
        startBot(); // Auto reconnect
      }
    }
  });

  // Balasan otomatis
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const dari = msg.key.remoteJid;
    const teks = msg.message.conversation || msg.message.extendedTextMessage?.text;

    const balasan = handlePesan(dari, teks);
    if (balasan) {
      await sock.sendMessage(dari, { text: balasan });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();
