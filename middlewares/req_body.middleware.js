exports.reqBody = async (req, res, next) => {
    if (!req.body) return res.status(400).json({message:"Request Body is Required"})
    next();
}