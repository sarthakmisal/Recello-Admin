module.exports = (err, req, res, next) => {
    const status = err.status || 500;
    const payload = {
        success: false,
        message: err.message || 'Internal Server Error',
    };

    if (err.code) payload.code = err.code;
    if (err.details) payload.details = err.details;
    if (err.next_actions) payload.next_actions = err.next_actions;

    res.status(status).json(payload);
}