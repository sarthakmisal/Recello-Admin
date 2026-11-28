/*
 * Admin panel: Team, Security, Settings (mounted at /api/system, before the other system routes).
 * The access gate (middlewares/access.middleware.js) lets only a signed-in main admin through here,
 * except GET /me and PUT /me/password (any panel login) and GET /site_config (public).
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { reqBody } = require('../middlewares/req_body.middleware');
const team = require('../services/team.service');
const security = require('../services/security.service');
const settings = require('../services/settings.service');
const store = require('../services/staff.store');

const mainAdmin = (req, res, next) =>
    req.staff && req.staff.admin ? next() : res.status(403).json({ message: 'Only a main admin can do this.', code: 403 });

// who is signed in (the panel shows / hides screens with this)
router.get('/me', authMiddleware, async (req, res) => res.json(await team.me(req.user.userId)));
router.put('/me/password', authMiddleware, reqBody, async (req, res) => res.json(await team.changeOwnPassword(req.user.userId, req.body)));

// Team
router.get('/team', authMiddleware, mainAdmin, async (req, res) => res.json(await team.list()));
router.post('/team', authMiddleware, mainAdmin, reqBody, async (req, res) => res.json(await team.save(null, req.body, req.staff)));
router.put('/team/:id', authMiddleware, mainAdmin, reqBody, async (req, res) => res.json(await team.save(req.params.id, req.body, req.staff)));

// Security
router.get('/security', authMiddleware, mainAdmin, async (req, res) => res.json(await security.checks(req)));
router.get('/activity', authMiddleware, mainAdmin, async (req, res) => res.json(await security.activity(req.query)));

// Settings
router.get('/settings', authMiddleware, mainAdmin, async (req, res) => res.json(await settings.all()));
router.put('/settings/:key', authMiddleware, mainAdmin, reqBody, async (req, res) =>
    res.json(await settings.save(req.params.key, req.body, req.staff.userId)),
);
router.get('/connection', authMiddleware, mainAdmin, async (req, res) => res.json(await settings.connection()));
router.get('/backup', authMiddleware, mainAdmin, async (req, res) => {
    const buf = await settings.backup();
    const d = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="recello-backup-${d}.json.gz"`);
    res.send(buf);
});

// public: what the website and the app read (cities, pincodes, rapid pickup, growth, support details)
router.get('/site_config', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await settings.siteConfig());
});

store.ensure().catch(() => {});
module.exports = router;
