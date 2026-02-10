// --- CORRECTIF CRYPTO POUR KOYEB ---
const crypto = require('node:crypto');
if (!global.crypto) global.crypto = crypto.webcrypto;

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

// 1. SANTÉ DU SERVEUR (Pour Koyeb)
app.get("/", (req, res) => res.status(200).send("API RACLETTE READY"));

let sock;

async function connectToWhatsApp() {
    console.log("🔄 Lancement du moteur WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_raclette');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'error' }),
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "22.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 QR CODE REÇU ! SCANNES-LE VITE :");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ WHATSAPP CONNECTÉ ! LE BOT EST EN VIE.");
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            console.log(`❌ CONNEXION FERMÉE (Code: ${statusCode}).`);
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion dans 10 secondes...");
                setTimeout(connectToWhatsApp, 10000);
            }
        }
    });
}

// 2. RÉCEPTION DU SONDAGE
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).send("Démarrage en cours...");
    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent);
        } else if (action === "delete") {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 3. LANCEMENT
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur port ${PORT}`);
    connectToWhatsApp();
});
