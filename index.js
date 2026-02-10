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

app.get("/", (req, res) => res.status(200).send("BOT_STAFF_READY"));

let sock;

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_final');
    
    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        logger: pino({ level: 'silent' }), 
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log("🚀 BOT CONNECTÉ ET SILENCIEUX");
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) setTimeout(connectToWhatsApp, 5000);
        }
    });
}

// ROUTE DE RÉCEPTION DES ORDRES
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).send("Indisponible");

    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent); 
        } 
        else if (action === "delete" && msgId) {
            // Suppression sécurisée
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) {
        res.status(500).send("Erreur : " + e.message);
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Serveur actif sur port 8000");
    connectToWhatsApp();
});
