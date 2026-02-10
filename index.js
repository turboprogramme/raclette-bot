const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

// --- 1. RÉPONSE INSTANTANÉE POUR KOYEB (Évite l'erreur Health Check) ---
app.get("/", (req, res) => res.status(200).send("API ACTIVE"));

let sock = null;

// --- 2. LOGIQUE DE CONNEXION WHATSAPP ---
async function connectToWhatsApp() {
    console.log("🔄 Initialisation WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000, // On laisse 1 min pour se connecter
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 QR CODE DISPONIBLE !");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ RACLETTE BOT PRÊT !");
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            // On ne reconnecte que si ce n'est pas une déconnexion manuelle
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion dans 10s...");
                setTimeout(connectToWhatsApp, 10000);
            }
        }
    });
}

// --- 3. RÉCEPTION DES MESSAGES DE GOOGLE SHEETS ---
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).send("Bot en cours de démarrage");

    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent);
        } 
        if (action === "delete" && msgId) {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// --- 4. DÉMARRAGE DU SERVEUR ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur web sur port ${PORT}`);
    // On lance WhatsApp APRÈS que le serveur soit prêt
    connectToWhatsApp().catch(err => console.log("Erreur boot:", err));
});
