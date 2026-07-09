const systemService = require("../services/system.service")

exports.getServices = async (req, res) => {
    const data = await systemService.getServices(req.query);
    res.status(200).json(data);
}
exports.createService = async (req, res) => {
    req.body.image = req.file ? req.file.filename : null;
    const data = await systemService.createService(req.body);
    res.status(200).json(data);
};
exports.deleteService = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const data = await systemService.deleteService(id);
    res.status(200).json(data);
}

exports.toggleService = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const { status } = req.body;
    const data = await systemService.toggleService(id, status);
    res.status(200).json(data);
}
exports.getCategories = async (req, res) => {
    // console.log(req.params)
    if (!req.params) throw { status: 400, message: "Parameters are required" }
    const data = await systemService.getCategories(req.params);
    res.status(200).json(data);
}
exports.createCategory = async (req, res) => {
    req.body.image = req.file ? req.file.filename : null;
    const data = await systemService.createCategory(req.body);
    res.status(200).json(data);
};

exports.updateCategory = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    if (req.file) {
        req.body.image = req.file.filename;
    }
    const data = await systemService.updateCategory(id, req.body);
    res.status(200).json(data);
}

exports.toggleCategory = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const { status } = req.body;
    const data = await systemService.toggleCategory(id, status);
    res.status(200).json(data);
}

exports.getBrands = async (req, res) => {
    const data = await systemService.getBrands({ ...req.params, ...req.query });
    res.status(200).json(data);
}
// exports.getCategoryBrands = async (req, res) => {
//     const data = await systemService.getCategoryBrands(req.params);
//     res.status(200).json(data);
// }
exports.createBrand = async (req, res) => {
    req.body.image = req.file ? req.file.filename : null;
    const data = await systemService.createBrand(req.body);
    res.status(200).json(data);
};

exports.updateBrand = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    if (req.file) {
        req.body.image = req.file.filename;
    }
    const data = await systemService.updateBrand(id, req.body);
    res.status(200).json(data);
}

exports.deleteBrand = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const data = await systemService.deleteBrand(id);
    res.status(200).json(data);
}

exports.toggleBrand = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const { status } = req.body;
    const data = await systemService.toggleBrand(id, status);
    res.status(200).json(data);
}

// ── Brands Excel ─────────────────────────────────────────
exports.downloadBrandsTemplate = async (req, res) => {
    const { buffer, fileName } = await systemService.getBrandsImportTemplate();
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(buffer);
}

exports.importBrandsExcel = async (req, res) => {
    if (!req.file?.buffer) throw { status: 400, message: 'Excel file is required (field: file)' };
    const data = await systemService.importBrandsFromExcel(req.file.buffer);
    res.status(200).json(data);
}

exports.getRoles = async (req, res) => {
    const data = await systemService.getRoles();
    res.status(200).json(data);
}

exports.getDashboardSummary = async (req, res) => {
    const data = await systemService.getDashboardSummary();
    res.status(200).json(data);
}

exports.updateModel = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    if (req.file) {
        req.body.image = req.file.filename;
    }
    const data = await systemService.updateModel(id, req.body);
    res.status(200).json(data);
}

exports.getModelSeries = async (req, res) => {
    const data = await systemService.getModelSeries(req.params);
    res.status(200).json(data);
}

exports.createSeries = async (req, res) => {
    // console.log(req.body)
    const data = await systemService.createSeries(req.body);
    res.status(200).json(data);
};

exports.updateSeries = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const data = await systemService.updateSeries(id, req.body);
    res.status(200).json(data);
}

exports.deleteSeries = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    const data = await systemService.deleteSeries(id);
    res.status(200).json(data);
}

exports.getModels = async (req, res) => {
    const data = await systemService.getModels(req.params);
    res.status(200).json(data);
}

exports.createModel = async (req, res) => {
    // console.log(req.body)
    req.body.image = req.file ? req.file.filename : null;
    const data = await systemService.createModel(req.body);
    res.status(200).json(data);
};

exports.updateService = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" }
    if (req.file) {
        req.body.image = req.file.filename;
    }
    const data = await systemService.updateService(id, req.body);
    res.status(200).json(data);
};

exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: "ID is required" });
        const data = await systemService.deleteCategory(id);
        res.status(200).json(data);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Failed to delete category" });
    }
}

exports.deleteModel = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: "ID is required" });
        const data = await systemService.deleteModel(id);
        res.status(200).json(data);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || "Failed to delete model" });
    }
}

exports.sarthakQuery = async (req, res) => {
    const data = await systemService.sarthakQuery(req.body);
    res.status(200).json(data.rows);
}

exports.getCategoryBrandMappings = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: 'Category ID is required' };
    const data = await systemService.getCategoryBrandMappings(id);
    res.status(200).json({ success: true, data });
}

exports.updateCategoryBrandMappings = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: 'Category ID is required' };
    const brandIds = req.body?.brand_ids ?? req.body?.brandIds ?? req.body?.brands ?? [];
    const data = await systemService.updateCategoryBrandMappings(id, brandIds);
    res.status(200).json(data);
}