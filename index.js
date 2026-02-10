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

// 1. Pour Koyeb : On dit qu'on est vivant tout de suite
app.get("/", (req, res) => res.status(200).send("BOT_EN_LIGNE"));

let sock;

async function startBot() {
    console.log("⚙️ Démarrage...");
    
    // On récupère la vraie version de WhatsApp pour éviter le blocage 405
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_folder');
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }), // Silencieux pour nettoyer les logs
        printQRInTerminal: true, // On remet ça, Koyeb le gère bien avec Node 20
        browser: ["Ubuntu", "Chrome", "120.0.0"],
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("🚨 --- SCANNE CE QR CODE MAINTENANT --- 🚨");
            qrcode.generate(qr, { small: true });
            console.log("---------------------------------------");
        }
        
        if (connection === 'open') {
            console.log("✅ SUCCÈS TOTAL : LE BOT EST CONNECTÉ !");
        }
        
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Coupure (Code: ${code}). Redémarrage...`);
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(startBot, 5000); // On relance proprement
            }
        }
    });
}

// Route pour Google Sheets
app.post("/update", async (req, res) => {
    const { action, chatId, text } = req.body;
    try {
        if (action === "send" && sock) {
            await sock.sendMessage(chatId, { text });
            res.json({ status: "sent" });
        } else {
            res.status(500).json({ error: "Bot pas prêt" });
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(8000, '0.0.0.0', () => {
    console.log("🚀 Serveur Web OK sur port 8000");
    startBot();
});
