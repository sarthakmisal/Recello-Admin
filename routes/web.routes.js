/*
 * /api/web?action=...   (GET for catalog, pow, track, ref_check; POST for the rest)
 * The website and the Android app (Recello-Mobile) call only this. See services/web.service.js.
 */
const express = require('express');
const router = express.Router();
const web = require('../services/web.service');

router.all('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const out = await web.handle(req);
        res.json(out);
    } catch (e) {
        const status = Number(e && e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
        if (status >= 500) console.error('web api error:', e && (e.stack || e.message || e));
        const body = { error: status >= 500 ? 'Something went wrong on our side. Please try again.' : (e.message || 'Something went wrong. Please try again.') };
        if (e && e.need) body.need = e.need;
        if (e && e.retry) { body.retry = e.retry; res.set('Retry-After', String(e.retry)); }
        res.status(status).json(body);
    }
});

module.exports = router;
