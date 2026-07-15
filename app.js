const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const morgan = require('morgan');
const responseLogger = require('./config/response.logger');
const fs = require("fs");
const path = require('path');

const app = express();
const allowedOrigins = [
  // Local/LAN dev (Vite)
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://localhost:8100",
  "http://127.0.0.1:8100",
  "http://127.0.0.1:3000",
  "http://192.168.1.19:5173",
  "http://10.195.223.133:5173",
  "http://192.168.1.31:5173",
  "http://192.168.1.31:3000",
  "http://192.168.1.40:3000",

  // Production
  "http://recello.thecanatech.com",
  "https://recello.thecanatech.com",
  "http://dev.recello.in",
  "https://dev.recello.in",
  "http://recello.in",
  "https://recello.in"
]

// app.use(cors({
//   origin: allowedOrigins,
//   credentials: true
// }));

app.use(cors({
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true
}));

const uploadsDir = path.resolve(__dirname, 'uploads');

app.use('/uploads', (req, res, next) => {
  // Sanitise path to prevent directory traversal
  const requestedFile = path.join(uploadsDir, req.path);
  if (!requestedFile.startsWith(uploadsDir)) {
    return res.status(403).json({ error: 'Forbidden', code: 403 });
  }
  next();
}, express.static(uploadsDir, {
  // Tell browsers (and CDNs) how long to cache
  maxAge: '7d',
  // Serve with correct MIME type; Express infers from extension,
  // but we set fallback headers just in case.
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    if (mimeMap[ext]) {
      res.setHeader('Content-Type', mimeMap[ext]);
    }
    // Allow cross-origin image loads (needed if frontend is on a different subdomain)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));



// ─────────────────────────────────────────────
// 3. BODY PARSING & MISC MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(responseLogger);

// ─────────────────────────────────────────────
// 4. FRONTEND STATIC FILES
// ─────────────────────────────────────────────
const adminPath = path.join(__dirname, 'public', 'admin');
const appPath = path.join(__dirname, 'public', 'app');

const staticOptions = {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.js') res.setHeader('Content-Type', 'application/javascript');
    if (ext === '.css') res.setHeader('Content-Type', 'text/css');
  }
};

// User app
app.use(express.static(appPath, staticOptions));

// Admin app
app.use('/admin', express.static(adminPath, staticOptions));

// ─────────────────────────────────────────────
// 5. API ROUTES
// ─────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/product', require('./routes/product.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/system', require('./routes/system.routes'));
app.use('/api/sell', require('./routes/sell.routes'));
app.use('/api/banners', require('./routes/banner.routes'));
app.use('/api/faqs', require('./routes/faq.routes'));
app.use('/api/contact_us', require('./routes/contact.routes'));

// MERCHANT ROUTES
app.use('/api/merchant', require('./routes/merchant.routes'));

// SARTHAK ROUTE -REMOVED IN PRODUCTION
app.use('/api/sarthak', require('./routes/system.routes'));


// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', code: 200 });
});
// Logs
app.get('/api/logs', (req, res) => {
  const d = new Date().toISOString().split('T')[0];
  const file = `logs/app.log.${d}`;
  if (!fs.existsSync(file)) return res.json([]);
  const logs = fs.readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return line; } });
  res.json(logs.reverse());
});

app.get('/api/logs_clean', (req, res) => {
  const d = new Date().toISOString().split('T')[0];
  fs.writeFileSync(`logs/app.log.${d}`, '');
  res.json({ message: 'Logs cleaned' });
});

// ─────────────────────────────────────────────
// 6. SPA FALLBACKS — after API routes so they
//    can never catch an /api/* OR /uploads/* URL
// ─────────────────────────────────────────────
app.use('/admin', (req, res, next) => {
  if (req.path.includes('.')) return next(); // let 404 handle missing assets
  res.sendFile(path.join(adminPath, 'index.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (req.path.startsWith('/admin')) return next();
  if (req.path.startsWith('/uploads')) return next();
  if (req.path.includes('.')) return next(); // missing static asset → 404
  res.sendFile(path.join(appPath, 'index.html'));
});

// 7 ERROR HANDLING
const error_handler = require('./middlewares/error_handler.middleware');
app.use(error_handler);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', code: 404 });
});

module.exports = app;
