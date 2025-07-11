const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  useSingleFileAuthState,
  makeCacheableSignalKeyStore,
  PHONENUMBER_MCC,
  makeWALegacySocket,
  useRemoteFileAuthState,
  makeInMemoryStore,
  makeWAPairingCode
} = require("@whiskeysockets/baileys");

const { handlePesan } = require("./pesan");
const { Boom } = require("@hapi/boom");
const fs = require("fs");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    getMessage: async () => ({}),
  });

  // Pairing code langsung dari soket
  if (!state.creds?.registered) {
    const code = await sock.requestPairingCode("6285647271487"); // Ganti nomor kamu di sini
    console.log("🔐 Pairing Code:", code);
  }

  sock.ev.on("creds.update", saveCreds);

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

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Bot aktif via pairing code!");
    }
  });
}

startBot();
