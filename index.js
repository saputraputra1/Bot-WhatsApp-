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
    printQRInTerminal: true, // ✅ Tampilkan QR di terminal
    getMessage: async () => ({})
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Bot WhatsApp aktif setelah scan QR!");
    } else if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❌ Terlogout. Scan ulang QR.");
      } else {
        console.log("🔄 Terputus. Reconnecting...");
        startBot();
      }
    }
  });

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

  sock.ev.on("creds.update", saveCreds);
}

startBot();
