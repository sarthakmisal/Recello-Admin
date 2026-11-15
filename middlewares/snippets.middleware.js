exports.allowRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.some(r => req.user.roles.includes(r))) {
            return next({ status: 403, message: "Access denied" });
        }
        
        next();
    };
};