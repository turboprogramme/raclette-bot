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
        if (u.qr) console.log("⚠️ DECONNECTÉ : Nouveau QR Code requis.");
        if (u.connection === 'open') console.log("✅ WHATSAPP CONNECTÉ !");
        if (u.connection === 'close') {
            console.log("🔄 Connexion perdue, tentative de reconnexion...");
            setTimeout(connectToWhatsApp, 5000);
        }
    });
}

app.post("/update", async (req, res) => {
    console.log("📩 REQUÊTE REÇUE :", req.body.action, "pour", req.body.chatId);
    const { action, chatId, text, msgId } = req.body;
    
    if (!sock) return res.json({ status: "error", message: "Socket non initialisé" });

    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            console.log("📤 Message envoyé avec succès !");
            return res.json(sent); 
        } 
        else if (action === "delete" && msgId && msgId.id) {
            await sock.sendMessage(chatId, { delete: msgId });
            console.log("🗑️ Ancien message supprimé !");
            return res.json({ status: "ok" });
        }
    } catch (e) {
        console.log("❌ ERREUR WHATSAPP :", e.message);
        return res.json({ status: "error", message: e.message });
    }
});

app.listen(8000, '0.0.0.0', () => {
    console.log("🚀 Serveur à l'écoute sur port 8000");
    connectToWhatsApp();
});
