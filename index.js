const crypto = require('node:crypto');
if (!global.crypto) global.crypto = crypto.webcrypto;
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const axios = require("axios");

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxaCXBVhq6tQDFJ1H5owJQU4qNUGHXK5K0jmTOtlj97DG38u7XdremJCjmC330jC2Ww/exec"; 
const phoneNumber = "33769403239"; 

let sock;
let lastDashboardId = null; 

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_final');
    
    sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
        logger: pino({ level: 'silent' }), 
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log("🔥 CODE DE CONNEXION : " + code);
            } catch (err) { console.error(err.message); }
        }, 5000); 
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        // --- DÉTECTION SOUPLE DE LA COMMANDE ---
        const messageText = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim().toLowerCase();
        const quotedId = m.message.extendedTextMessage?.contextInfo?.stanzaId;

        // Regex pour accepter : "liste?", "liste ?", "Liste ?", "Liste?"
        const isListeCommand = /^liste\s*\?$/.test(messageText);

        if (isListeCommand && quotedId === lastDashboardId) {
            console.log("🔍 Commande validée pour : " + messageText);
            try { await axios.post(SCRIPT_URL, { action: "get_full_list" }); } catch (e) { console.error(e.message); }
        }
    });

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') console.log("✅ WHATSAPP CONNECTÉ !");
        if (u.connection === 'close') setTimeout(connectToWhatsApp, 5000);
    });
}

app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).json({ error: "Non pret" });
    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            if (text.includes("COMPTEUR")) {
                lastDashboardId = sent.key.id;
                console.log("📌 ID Compteur mémorisé : " + lastDashboardId);
            }
            return res.json(sent); 
        } 
        else if (action === "delete" && msgId?.id) {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) { return res.json({ status: "error" }); }
});

app.listen(8000, '0.0.0.0', () => connectToWhatsApp());

