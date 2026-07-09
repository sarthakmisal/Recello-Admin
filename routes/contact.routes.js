const express = require('express')
const router = express.Router()
const contactUsController = require('../controllers/contact.controller')


// GET ALL
router.get('/', contactUsController.getAllContactUs)

// GET SINGLE
router.get('/:id', contactUsController.getContactUsById)

// CREATE
router.post('/', contactUsController.createContactUs)

// UPDATE
router.put('/:id', contactUsController.updateContactUs)

// STATUS TOGGLE
// router.patch('/:id/status', contactUsController.updateContactUsStatus)

// DELETE
router.delete('/:id', contactUsController.deleteContactUs)

module.exports = router