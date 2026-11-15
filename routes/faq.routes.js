const express = require('express')
const router = express.Router()
const faqController = require('../controllers/faq.controller')

// PUBLIC ACTIVE FAQS
router.get('/active', faqController.getActiveFaqs)

// GET ALL
router.get('/', faqController.getAllFaqs)

// GET SINGLE
router.get('/:id', faqController.getFaqById)

// CREATE
router.post('/', faqController.createFaq)

// UPDATE
router.put('/:id', faqController.updateFaq)

// STATUS TOGGLE
router.patch('/:id/status', faqController.updateFaqStatus)

// DELETE
router.delete('/:id', faqController.deleteFaq)

module.exports = router