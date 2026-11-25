/*
 * /api/tech?action=...   (GET for me, jobs, job, wallet, photo_get, doc_get; POST for the rest)
 * The Recello Partner (technician) app calls only this. See services/tech.service.js.
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const tech = require('../services/tech.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

function send(res, e) {
    const status = Number(e && e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    if (e && e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Files must be 8 MB or smaller.' });
    if (status >= 500) console.error('tech api error:', e && (e.stack || e.message || e));
    const body = { error: status >= 500 ? 'Something went wrong on our side. Please try again.' : (e.message || 'Something went wrong. Please try again.') };
    if (e && e.retry) { body.retry = e.retry; res.set('Retry-After', String(e.retry)); }
    return res.status(status).json(body);
}

const parse = (req, res, next) => {
    if (/^multipart\/form-data/i.test(req.headers['content-type'] || '')) return upload.single('file')(req, res, (err) => (err ? send(res, err) : next()));
    return next();
};

router.all('/', parse, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const out = await tech.handle(req);
        if (out && out.__file) { res.set('Cache-Control', 'private, max-age=600'); return res.type(out.mime || 'application/octet-stream').sendFile(out.__file); }
        return res.json(out);
    } catch (e) { return send(res, e); }
});

module.exports = router;
