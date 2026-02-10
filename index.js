// --- PROTECTION 1 : CORRECTIF CRYPTO ---
const crypto = require('node:crypto');
if (!global.crypto) global.crypto = crypto.webcrypto;

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

// --- PROTECTION 2 : RÉPONSE INSTANTANÉE (Évite le Health Check Failed) ---
app.get("/", (req, res) => res.status(200).send("BOT_READY"));

let sock;

async function connectToWhatsApp() {
    console.log("🛠️ Récupération de l'identité WhatsApp officielle...");
    
    // --- PROTECTION 3 : CONTOURNEMENT ERREUR 405 ---
    const { version } = await fetchLatestBaileysVersion();
    
    const { state, saveCreds } = await useMultiFileAuthState('session_raclette');
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }), // On cache le bruit inutile
        browser: ["Ubuntu", "Chrome", "121.0.6167.184"],
        printQRInTerminal: false, // Désactivé pour éviter les bugs de logs
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 SCANNE CE CODE POUR ACTIVER LE BOT :");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ SUCCÈS : LE BOT EST EN LIGNE !");
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            console.log(`❌ DÉCONNEXION (Code: ${statusCode})`);
            
            // --- PROTECTION 4 : ANTI-BOUCLE ---
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion automatique dans 10 secondes...");
                setTimeout(connectToWhatsApp, 10000);
            }
        }
    });
}

// API pour recevoir les ordres de Google Sheets
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).send("Démarrage...");
    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent);
        } else if (action === "delete") {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur web actif sur le port ${PORT}`);
    connectToWhatsApp().catch(err => console.error("Erreur critique:", err));
});
