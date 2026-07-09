const fs = require("fs/promises");
const path = require("path");

const deleteFile = async (filename) => {
    if (!filename) return;

    try {
        await fs.unlink(path.join(process.cwd(), "uploads", filename));
    } catch { }
};

module.exports = deleteFile;