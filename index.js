const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

// Message de test pour vérifier que le serveur répond sur le web
app.get("/", (req, res) => res.send("✅ API Raclette en ligne !"));

let sock;

async function connectToWhatsApp() {
    console.log("🚀 INITIALISATION DE LA CONNEXION WHATSAPP...");
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // On cache les logs inutiles
        printQRInTerminal: true, // COMMANDE CRUCIALE POUR LE QR CODE
        browser: ["Chrome (Linux)", "RacletteBot", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 QR CODE REÇU ! PRÉPARE TON TÉLÉPHONE :");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ RACLETTE BOT CONNECTÉ ET PRÊT !");
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("❌ CONNEXION FERMÉE. RECONNEXION :", shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        }
    });
}

// ENDPOINT POUR GOOGLE APPS SCRIPT
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    console.log(`📩 ACTION REÇUE : ${action} pour ${chatId}`);
    
    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text: text });
            return res.json(sent);
        } 
        if (action === "delete") {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) {
        console.error("⚠️ ERREUR API :", e.message);
        res.status(500).send(e.message);
    }
});

// LANCEMENT DU SERVEUR
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`🌐 SERVEUR DÉMARRÉ SUR LE PORT ${PORT}`);
    connectToWhatsApp();
});
