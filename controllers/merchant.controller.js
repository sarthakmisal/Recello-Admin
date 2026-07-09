const merchantService = require("../services/merchant.service");
const asyncHandler = require('../middlewares/async_handler')

exports.loginMerchant = asyncHandler(async (req, res) => {
    const data = await merchantService.loginMerchant(req.body);
    res.status(200).json(data);
});

exports.getProfileDetails = asyncHandler(async (req, res) => {
    const data = await merchantService.getProfileDetails(req.user);
    res.status(200).json(data);
});

exports.updateProfileDetails = asyncHandler(async (req, res) => {
    req.body.user = req.user
    const data = await merchantService.updateProfileDetails(req.body);
    res.status(200).json(data);
});

exports.getLeadsByMerchant = asyncHandler(async (req, res) => {
    const data = await merchantService.getLeadsByMerchant(req.user);
    res.status(200).json(data);
});

exports.getCompletedLeads = asyncHandler(async (req, res) => {
    const data = await merchantService.getCompletedLeads({ user: req.user });
    res.status(200).json(data);
});

exports.requestOTP = asyncHandler(async (req, res) => {
    if (!req.body.listing_id) throw { status: 400, message: "Listing ID is required" };

    const data = await merchantService.requestOTP(req.user, req.body);
    res.status(200).json(data);
});

exports.verifyOTP = asyncHandler(async (req, res) => {
    req.body.user = req.user;
    if (!req.body.id || !req.body.otp) throw { status: 400, message: "OTP is required" };
    const data = await merchantService.verifyOTP(req.body);
    res.status(200).json(data);
});

exports.getLeadsByLeadId = asyncHandler(async (req, res) => {
    if (!req.params.id) throw { status: 400, message: "Lead ID is required" };
    const data = await merchantService.getLeadsByLeadId(req.user, req.params);
    res.status(200).json(data);
});

exports.getLeadResume = asyncHandler(async (req, res) => {
    if (!req.params.id) throw { status: 400, message: 'Lead ID is required' };
    const data = await merchantService.getLeadResume({ user: req.user, listing_id: req.params.id });
    res.status(200).json(data);
});

exports.acceptLead = asyncHandler(async (req, res) => {
    // res.send({"hello":req.user})
    req.body.agent_id = req.user.userId
    const data = await merchantService.acceptLead(req.body);
    res.status(200).json(data);
});

exports.inviteMerchantAgent = asyncHandler(async (req, res) => {
    req.body.user_id = req.user.userId
    const data = await merchantService.inviteMerchantAgent(req.body);
    res.status(200).json(data);
});

exports.verifyMerchantAgent = asyncHandler(async (req, res) => {
    if (!req.query.token) throw { status: 400, message: "Token is required" };
    const data = await merchantService.verifyMerchantAgent(req.query);
    res.status(200).json(data);
});


exports.registerMerchantAgent = asyncHandler(async (req, res) => {
    if (!req.query.token) throw { status: 400, message: "Token is required" };
    req.body.token = req.query.token
    const data = await merchantService.registerMerchantAgent(req.body);
    res.status(200).json(data);
});


exports.getRequoteQuestions = asyncHandler(async (req, res) => {
    // if (req.query.context && req.query.context !== "inspection") throw { status: 400, message: "Invalid context" };
    const data = await merchantService.getRequoteQuestions();
    res.status(200).json(data);
});

exports.postRequote = asyncHandler(async (req, res) => {
    // if (req.query.context && req.query.context !== "inspection") throw { status: 400, message: "Invalid context" };
    const data = await merchantService.postRequote(req.query);
    res.status(200).json(data);
});

exports.getMerchantAgents = asyncHandler(async (req, res) => {
    const data = await merchantService.getMerchantAgents(req.user);
    res.status(200).json(data);
});

exports.submitRequoteAnswers = asyncHandler(async (req, res) => {
    const context = req.query.context;

    const listing_id = req.body.listing_id ?? req.body.listingId;
    let answers = req.body.answers;
    if (typeof answers === 'string') {
        try {
            answers = JSON.parse(answers);
        } catch {
            throw { status: 400, message: 'Invalid JSON in answers' };
        }
    }

    const filesByField = new Map();
    for (const f of (req.files || [])) filesByField.set(f.fieldname, f);

    const data = await merchantService.submitRequoteAnswers({
        user: req.user,
        context,
        listing_id,
        answers,
        filesByField,
    });
    res.status(200).json(data);
});

exports.updateLeadStatus = asyncHandler(async (req, res) => {
    const listing_id = req.body.listing_id;
    const status = req.body?.status ?? req.body?.to_status ?? req.body?.to;
    const data = await merchantService.updateLeadStatus({
        user: req.user,
        listing_id,
        status,
    });
    res.status(200).json(data);
});

exports.startInspection = asyncHandler(async (req, res) => {
    const listing_id = req.body.listing_id;

    const data = await merchantService.startInspection({ user: req.user, listing_id });
    res.status(data?.already_started ? 200 : 201).json(data);
});

exports.submitInspectionAnswers = asyncHandler(async (req, res) => {
    // console.log('body:', req.body, );
    const listing_id = req.body.listing_id;
    // const context = req.query.context;
    const inspection_id = req.body.inspection_id ?? req.body.inspectionId;

    let answers = req.body.answers;
    if (typeof answers === 'string') {
        try {
            answers = JSON.parse(answers);
        } catch {
            throw { status: 400, message: 'Invalid JSON in answers' };
        }
    }

    // const filesByField = new Map();
    // for (const f of (req.files || [])) filesByField.set(f.fieldname, f);

    const data = await merchantService.submitInspectionAnswers({
        user: req.user,
        listing_id,
        inspection_id,
        answers
    });
    res.status(200).json(data);
});

exports.completeInspection = asyncHandler(async (req, res) => {
    const listing_id = req.body.listing_id;
    const inspection_id = req.body.inspection_id ?? req.body.inspectionId;
    const data = await merchantService.completeInspection({ user: req.user, listing_id, inspection_id });
    res.status(200).json(data);
});

exports.cancelLead = asyncHandler(async (req, res) => {
    const listing_id = req.body.listing_id;
    const inspection_id = req.body.inspection_id ?? req.body.inspectionId;
    const data = await merchantService.cancelLead({
        user: req.user,
        listing_id,
        inspection_id,
        reason: req.body.reason,
        final_offered_price: req.body.final_offered_price ?? req.body.finalOfferedPrice,
        customer_expected_price: req.body.customer_expected_price ?? req.body.customerExpectedPrice,
    });
    res.status(200).json(data);
});

exports.createOffer = asyncHandler(async (req, res) => {
    const listing_id = req.params.id;
    const inspection_id = req.body.inspection_id ?? req.body.inspectionId;
    const amount = req.body.amount;
    const data = await merchantService.createOffer({ user: req.user, listing_id, inspection_id, amount });
    res.status(201).json(data);
});

exports.respondToOffer = asyncHandler(async (req, res) => {
    const listing_id = req.params.id;
    const offer_id = req.params.offer_id;
    const action = req.body.action;
    const data = await merchantService.respondToOffer({ user: req.user, listing_id, offer_id, action });
    res.status(200).json(data);
});

exports.acceptLeadAfterInspection = asyncHandler(async (req, res) => {
    const listing_id = req.body.listing_id;
    const inspection_id = req.body.inspection_id ?? req.body.inspectionId;
    const final_amount = req.body.final_amount ?? req.body.finalAmount;
    const data = await merchantService.acceptLeadAfterInspection({ user: req.user, listing_id, inspection_id, final_amount });
    res.status(200).json(data);
});

exports.uploadMerchantImage = asyncHandler(async (req, res) => {
    const data = await merchantService.uploadMerchantImage({
        user: req.user,
        file: req.file,
        alt_text: req.body?.alt_text,
    });
    res.status(201).json(data);
});