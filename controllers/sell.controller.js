const sellService = require("../services/sell.service");

// ── Model Configs ─────────────────────────────────────────

exports.getModelConfigs = async (req, res) => {
    const data = await sellService.getModelConfigs(req.params);
    res.status(200).json(data);
};

exports.createModelConfig = async (req, res) => {
    const data = await sellService.createModelConfig(req.body);
    res.status(201).json(data);
};

exports.updateModelConfig = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.updateModelConfig(id, req.body);
    res.status(200).json(data);
};

exports.deleteModelConfig = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.deleteModelConfig(id);
    res.status(200).json(data);
};

// ── Questions ─────────────────────────────────────────────

exports.getQuestions = async (req, res) => {
    const data = await sellService.getQuestions(req.query);
    res.status(200).json(data);
};

exports.getQuestionContexts = async (req, res) => {
    const data = await sellService.getQuestionContexts();
    res.status(200).json(data);
};

exports.uploadImage = async (req, res) => {
    const data = await sellService.uploadImage({
        file: req.file,
        alt_text: req.body?.alt_text,
        uploaded_by: req.user?.userId ?? null,
    });
    res.status(201).json(data);
};

exports.getQuestionsByModel = async (req, res) => {
    const data = await sellService.getQuestionsByModel(req.params);
    res.status(200).json(data);
};

exports.getQuestionsByCategory = async (req, res) => {
    const { category_id } = req.params;
    const data = await sellService.getQuestionsByCategory(category_id);
    res.status(200).json(data);
};

exports.createQuestion = async (req, res) => {
    const data = await sellService.createQuestion(req.body);
    res.status(201).json(data);
};

exports.updateQuestion = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.updateQuestion(id, req.body);
    res.status(200).json(data);
};

exports.deleteQuestion = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.deleteQuestion(id);
    res.status(200).json(data);
};

// ── Question Options ──────────────────────────────────────

exports.getQuestionOptions = async (req, res) => {
    const { question_id } = req.params;
    const data = await sellService.getQuestionOptions(question_id);
    res.status(200).json(data);
};

exports.createQuestionOption = async (req, res) => {
    const data = await sellService.createQuestionOption(req.body);
    res.status(201).json(data);
};

exports.updateQuestionOption = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.updateQuestionOption(id, req.body);
    res.status(200).json(data);
};

exports.deleteQuestionOption = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.deleteQuestionOption(id);
    res.status(200).json(data);
};

// ── Conditions ────────────────────────────────────────────

exports.getConditions = async (req, res) => {
    const { question_id } = req.params;
    const data = await sellService.getConditions(question_id);
    res.status(200).json(data);
};

exports.createCondition = async (req, res) => {
    const data = await sellService.createCondition(req.body);
    res.status(201).json(data);
};

exports.deleteCondition = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const data = await sellService.deleteCondition(id);
    res.status(200).json(data);
};

// ── Category-Question Mapping ─────────────────────────────

exports.getCategoryQuestions = async (req, res) => {
    const { category_id } = req.params;
    const data = await sellService.getCategoryQuestions(category_id);
    res.status(200).json(data);
};

exports.mapQuestionToCategory = async (req, res) => {
    const data = await sellService.mapQuestionToCategory(req.body);
    res.status(201).json(data);
};

exports.unmapQuestionFromCategory = async (req, res) => {
    const { category_id, question_id } = req.params;
    const data = await sellService.unmapQuestionFromCategory(category_id, question_id);
    res.status(200).json(data);
};

// ── Sell Flow: Questions for Category (with conditions) ───

exports.getQuestionsByCategorySlug = async (req, res) => {
    const { category_slug } = req.params;
    const data = await sellService.getQuestionsByCategorySlug(category_slug, req.query);
    res.status(200).json(data);
};

// ── Calculate Price ───────────────────────────────────────

exports.calculatePrice = async (req, res) => {
    const data = await sellService.calculateSellPrice(req.body);
    res.status(200).json(data);
};

// ── Sell Listings (Leads) ─────────────────────────────────

exports.createListing = async (req, res) => {
    req.body.user_id = req.user.userId; // for now
    if (!req.user.userId) throw { status: 400, message: "ID is required" };

    const data = await sellService.createSellListing(req.body);
    res.status(201).json(data);
};

exports.getListings = async (req, res) => {
    const data = await sellService.getListings(req.query);
    res.status(200).json(data);
};

exports.getListingDetails = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: 'Listing id is required' };
    const data = await sellService.getListingDetails(id);
    res.status(200).json(data);
};

exports.getListingOffers = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: 'Listing id is required' };
    const data = await sellService.getListingOffers({ listing_id: id, user: req.user });
    res.status(200).json(data);
};

exports.assignListing = async (req, res) => {
    const { id } = req.params;
    const { merchant_id } = req.body;
    const data = await sellService.assignListing(id, merchant_id);
    res.status(200).json(data);
};

exports.transferListing = async (req, res) => {
    const { id } = req.params;
    const data = await sellService.transferListing(id);
    res.status(200).json(data);
};

exports.cancelListing = async (req, res) => {
    const { id } = req.params;
    const data = await sellService.cancelListing(id);
    res.status(200).json(data);
};

// PICKUP
exports.schedulePickup = async (req, res) => {
    req.body.user_id = req.user.userId
    const result = await sellService.schedulePickup(req.body);
    res.status(200).json(result);
}

// GET ORDERS
exports.getOrders = async (req, res) => {
    const data = await sellService.getOrders(req.user);
    res.status(200).json(data);
};

// ── Merchants ─────────────────────────────────────────────
exports.getMerchants = async (req, res) => {
    const data = await sellService.getMerchants();
    res.status(200).json(data);
};
