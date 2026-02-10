const crypto = require('node:crypto');
if (!global.crypto) global.crypto = crypto.webcrypto;

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");

const app = express();
app.use(express.json());

// 1. APPEL À KOYEB
app.get("/", (req, res) => res.status(200).send("BOT_PAIRING_MODE"));

let sock;

async function connectToWhatsApp() {
    console.log("🛠️ Démarrage en mode CODE DE JUMELAGE...");
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_final');
    
    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, // On désactive le QR déformé
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000
    });

    // --- C'EST ICI QUE LA MAGIE OPÈRE ---
    if(!sock.authState.creds.registered) {
        // ATTENTION : REMPLACE LE NUMÉRO CI-DESSOUS PAR LE TIEN !
        // Format : 336... (France), 32... (Belgique), etc.
        const phoneNumber = "33769403239"; 
        
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log("------------------------------------------------");
                console.log("🚨 TON CODE DE JUMELAGE EST : " + code);
                console.log("------------------------------------------------");
            } catch (err) {
                console.log("Erreur demande code: ", err);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ SUCCÈS : BOT CONNECTÉ VIA CODE !");
        }
        
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });
}

app.post("/update", async (req, res) => {
    const { action, chatId, text } = req.body;
    try {
        if (action === "send" && sock) {
            await sock.sendMessage(chatId, { text });
            res.json({ status: "sent" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Serveur prêt");
    connectToWhatsApp();
});
