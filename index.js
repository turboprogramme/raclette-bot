const crypto = require('node:crypto');
if (!global.crypto) global.crypto = crypto.webcrypto;

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
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
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
        logger: pino({ level: 'silent' }), 
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') console.log("🚀 BOT PRÊT");
        if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) setTimeout(connectToWhatsApp, 5000);
    });
}

app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(200).json({ error: "Bot non prêt" });

    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent); 
        } 
        else if (action === "delete") {
            // PROTECTION CRUCIALE : On vérifie la structure de msgId avant d'agir
            if (msgId && typeof msgId === 'object' && msgId.id) {
                await sock.sendMessage(chatId, { delete: msgId });
                return res.json({ status: "deleted" });
            }
            return res.json({ status: "skipped", reason: "invalid_id" });
        }
    } catch (e) {
        // On renvoie TOUJOURS du JSON, même ici
        return res.status(200).json({ status: "error", message: e.message });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => connectToWhatsApp());
