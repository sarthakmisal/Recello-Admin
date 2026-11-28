const multer = require('multer')
const path = require('path')
const fs = require('fs')

const uploadDir = path.join(process.cwd(), 'uploads/banners')

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // random name, extension from the checked image type
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.bin'))
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only image files allowed'))
    }
  }
})

module.exports = upload