// --- SÉCURITÉ 2 : CORRECTIF CRYPTO ---
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

// --- SÉCURITÉ 1 : RÉPONSE INSTANTANÉE (Health Check) ---
app.get("/", (req, res) => res.status(200).send("BOT_READY"));

let sock;

async function connectToWhatsApp() {
    console.log("🛠️ Initialisation du protocole...");
    
    // --- SÉCURITÉ 3 : CONTOURNEMENT ERREUR 405 ---
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📡 Version WhatsApp : ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'error' }),
        browser: ["Ubuntu", "Chrome", "121.0.6167.184"],
        printQRInTerminal: false, // Désactivé car déprécié dans tes logs
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 SCANNE CE CODE POUR ACTIVER LE BOT :");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ CONNEXION ÉTABLIE ! Dashboard prêt.");
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            console.log(`❌ DÉCONNEXION (Code: ${statusCode})`);
            
            // --- SÉCURITÉ 4 : ANTI-BOUCLE (Pause de 20s) ---
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("🔄 Temporisation avant reconnexion...");
                setTimeout(connectToWhatsApp, 20000);
            }
        }
    });
}

// API de communication avec Google Sheets
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).send("Bot en pause");
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

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur port ${PORT}`);
    connectToWhatsApp().catch(err => console.error("Crash démarrage:", err));
});
