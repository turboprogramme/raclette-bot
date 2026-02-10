const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const app = express();
app.use(express.json());

let sock;
async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({ 
        auth: state, 
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true 
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => {
        if(u.qr) {
            console.log("--- SCANNE MOI ---");
            qrcode.generate(u.qr, {small: true});
        }
        if(u.connection === 'open') console.log("✅ RACLETTE BOT ONLINE");
    });
}

app.post("/update", async (req, res) => {
    const { action, chatId, text, msgId } = req.body;
    try {
        if (action === "send") {
            const sent = await sock.sendMessage(chatId, { text });
            return res.json(sent);
        } 
        if (action === "delete") {
            await sock.sendMessage(chatId, { delete: msgId });
            return res.json({ status: "ok" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.listen(process.env.PORT || 3000, () => connect());