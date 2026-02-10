const crypto = require('node:crypto');
if (!global.crypto) global.crypto = crypto.webcrypto;

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.status(200).send("BOT_EN_LIGNE"));

let sock;

async function connectToWhatsApp() {
    console.log("🔄 Connexion en cours...");
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_final');
    
    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log("✅ BOT CONNECTÉ ! PRÊT À DÉTECTER LE GROUPE.");
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) setTimeout(connectToWhatsApp, 5000);
        }
    });

    // --- LE RADAR À GROUPE ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.key.fromMe && m.message) {
            console.log("------------------------------------------------");
            console.log("📍 ID DU GROUPE DÉTECTÉ : " + m.key.remoteJid);
            console.log("------------------------------------------------");
        }
    });
}

app.post("/update", async (req, res) => {
    const { action, chatId, text } = req.body;
    try {
        if (action === "send" && sock) {
            await sock.sendMessage(chatId, { text });
            res.json({ status: "sent" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Serveur prêt");
    connectToWhatsApp();
});
