const multer = require("multer");
const path = require("path");

const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },

    filename: (req, file, cb) => {
        // the extension comes from the checked image type, never from the uploaded name
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1e9) +
            (IMAGE_TYPES[file.mimetype] || ".bin");

        cb(null, uniqueName);
    },
});

// only real photos: JPG, PNG, WebP, GIF (no SVG / HTML, which a browser could run)
const IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const upload = multer({
    storage: storageConfig,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // phone cameras often send a name without an extension ("blob"): the type decides
        if (IMAGE_TYPES[file.mimetype] && !/\.(html?|svg|js|php|exe|sh)$/i.test(file.originalname || "")) return cb(null, true);
        const e = new Error("Only JPG, PNG, WebP or GIF images can be uploaded");
        e.status = 400;
        cb(e);
    },
});

module.exports = upload;