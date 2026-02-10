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

const phoneNumber = "33769403239"; // Ton numéro configuré

app.get("/", (req, res) => res.status(200).send("BOT_WAITING_FOR_PAIRING"));

let sock;

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_final');
    
    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        logger: pino({ level: 'silent' }), 
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false // On désactive le QR code
    });

    // --- LOGIQUE DE JUMELAGE ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log("---------------------------------------");
                console.log("🔥 TON CODE DE JUMELAGE WHATSAPP :");
                console.log(`👉 ${code} 👈`);
                console.log("---------------------------------------");
            } catch (err) {
                console.error("Erreur lors de la demande du code :", err);
            }
        }, 5000); // On attend 5s que le socket soit prêt
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u;
        if (connection === 'open') console.log("✅ WHATSAPP CONNECTÉ ET PRÊT !");
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
        }
    });
}

// ROUTE POUR GOOGLE SHEETS
app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    if (!sock) return res.json({ status: "error", message: "Socket non pret" });

    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent); 
        } 
        else if (action === "delete" && msgId && msgId.id) {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) {
        return res.json({ status: "error", message: e.message });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 Serveur en ligne");
    connectToWhatsApp();
});
