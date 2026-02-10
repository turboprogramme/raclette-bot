const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

// 1. RÉPONSE IMMÉDIATE POUR KOYEB (Satisfait le Health Check)
app.get("/", (req, res) => res.status(200).send("API_READY"));

let sock;

async function startBot() {
    console.log("🔄 Lancement du moteur WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'error' }), // On ne garde que les erreurs graves
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 QR CODE GÉNÉRÉ ! SCANNES-LE MAINTENANT :");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ WHATSAPP CONNECTÉ ! LE BOT EST PRÊT.");
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            console.log(`❌ CONNEXION FERMÉE. CODE D'ERREUR : ${statusCode}`);
            
            // Gestion intelligente de la reconnexion
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion automatique dans 20 secondes...");
                setTimeout(startBot, 20000);
            } else {
                console.log("⚠️ Session expirée. Tu devras peut-être supprimer le dossier 'auth_info' sur GitHub.");
            }
        }
    });
}

// 2. ENDPOINT POUR GOOGLE SHEETS
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.status(503).send("Bot non prêt");

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

// 3. DÉMARRAGE DU SERVEUR
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur web actif sur le port ${PORT}`);
    startBot().catch(err => console.error("Erreur critique au démarrage :", err));
});
