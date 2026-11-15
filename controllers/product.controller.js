const pool = require("../config/database");
const productService = require("../services/product.service");

exports.create = async (req, res) => {
    let data = JSON.parse(req.body.data);
    data.imagesMeta = data.imagesMeta.map((e, index) => {
        e.url = req.files[index].filename;
        return e;
    })

    // console.log("BODY",req.body)
    // console.log("FILES",req.file)
    // res.send(req.body);
    // const result = await productService.createProduct(req.body.data);
    // console.log("SARTHAK", data);
    const result = await productService.createProduct(data);
    res.status(201).json(result)
};
exports.getProducts = async (req, res) => {
    const result = await productService.getProducts(req.params);
    res.status(200).json(result);
}

exports.getProductBySlug = async (req, res) => {
    const result = await productService.getProductBySlug(req.params);
    res.status(200).json(result);
}

exports.getProductBySku = async (req, res) => {
    const result = await productService.getProductBySku(req.params);
    res.status(200).json(result);
}

exports.softDeleteProduct = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };
    const result = await productService.softDeleteProduct(id);
    res.status(200).json(result);
}

exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    if (!id) throw { status: 400, message: "ID is required" };

    let data = req.body;
    if (req.body.data) {
        data = JSON.parse(req.body.data);
    }

    if (req.files && req.files.length > 0) {
        data.imagesMeta = data.imagesMeta.map((e, index) => {
            if (req.files[index]) {
                e.url = req.files[index].filename;
            }
            return e;
        });
    }

    const result = await productService.updateProduct(id, data);
    res.status(200).json(result);
}

exports.getProductsByBrand = async (req, res) => {
    const result = await productService.getProductsByBrand(req.params);
    res.status(200).json(result);
}

// exports.getModelsByBrand = async (req, res) => {
//     const result = await productService.getModelsByBrand(req.params);
//     res.status(200).json(result);
// }

exports.getSeriesByBrand = async (req, res) => {
    const result = await productService.getSeriesByBrand(req.params);
    res.status(200).json(result);
}
exports.getModelsByBrandSeries = async (req, res) => {
    const result = await productService.getModelsByBrandSeries(req.params);
    res.status(200).json(result);
}

exports.getModelByBrandModel = async (req, res) => {
    const result = await productService.getModelByBrandModel(req.params);
    res.status(200).json(result);
}

exports.getQuestionsByModelSlug = async (req, res) => {
    const result = await productService.getQuestionsByModelSlug(req.params);
    res.status(200).json(result);
}

exports.getVariantsByBrandModel = async (req, res) => {
    const result = await productService.getVariantsByBrandModel(req.params);
    res.status(200).json(result);
}
