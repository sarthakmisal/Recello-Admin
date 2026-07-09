const uiService = require('../services/ui.service')

exports.getHomeBanners = async (req, res) => {
    const result = await uiService.getHomeBanners();
    res.status(200).json(result);
}