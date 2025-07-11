const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const fs = require("fs");
const { handlePesan } = require("./pesan");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    getMessage: async () => ({})
  });

  let sudahTampilkanKode = false;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Bot aktif via pairing code!");
      if (!state.creds?.registered && !sudahTampilkanKode) {
        const kode = await sock.requestPairingCode("6285647271487"); // ← Ganti nomormu di sini
        console.log("🔐 Pairing Code:", kode);
        sudahTampilkanKode = true;
      }
    } else if (connection === "close") {
      console.log("❌ Koneksi terputus. Jalankan ulang jika perlu pairing ulang.");
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
}

startBot();
