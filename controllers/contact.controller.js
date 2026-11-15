const contactService = require("../services/contact.service");

exports.getAllContactUs = async (req, res) => {
    const data = await contactService.getAllContactUs();
    res.status(200).json(data);
};

exports.getContactUsById = async (req, res) => {
    const data = await contactService.getContactUsById(req.params.id);
    res.status(200).json(data);
};

exports.createContactUs = async (req, res) => {
    const data = await contactService.createContactUs(req.body);
    res.status(201).json(data);
};

exports.updateContactUs = async (req, res) => {
    const data = await contactService.updateContactUs(req.params.id, req.body);
    res.status(200).json(data);
};

exports.deleteContactUs = async (req, res) => {
    await contactService.deleteContactUs(req.params.id);
    res.status(200).json({ message: "Contact deleted successfully" });
};