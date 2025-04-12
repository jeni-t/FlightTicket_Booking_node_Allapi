const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, 'your_secret_key');
        req.user = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ msg: 'Invalid token' });
    }
};
