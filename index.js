const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("✅ API Raclette en ligne !"));

async function connectToWhatsApp() {
    console.log("🚀 TENTATIVE DE CONNEXION...");
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'info' }), // On active les logs pour voir l'erreur
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📢 QR CODE DISPONIBLE !");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("✅ RACLETTE BOT CONNECTÉ !");
        }
        
        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error?.output?.statusCode || error?.code;
            
            console.log(`❌ CONNEXION FERMÉE ! Code: ${statusCode}`);
            console.log("Détails de l'erreur :", error);

            // On ne reconnecte que si ce n'est pas une déconnexion volontaire
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("🔄 Tentative de reconnexion dans 5 secondes...");
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });

    // On expose le socket pour les requêtes HTTP
    app.locals.sock = sock;
}

app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    const sock = app.locals.sock;
    if (!sock) return res.status(500).send("Bot non initialisé");

    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent);
        } 
        if (action === "delete") {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`🌐 Serveur sur port ${PORT}`);
    connectToWhatsApp().catch(err => console.log("Erreur critique :", err));
});
