/**
 * Authentication middleware that extracts and verifies JSON Web Tokens (JWT) 
 * from Authorization headers, handles token expiration vs invalid signatures, and populates 
 * req.userId for protected routes.
 */

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  
  if (!token) return res.status(401).json({ message: 'Sign in required' });
  
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch (err) {
    // Specific error differentiation
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Sign in again.' });
    }
    // If someone tampered with the signature or it's malformed
    return res.status(403).json({ message: 'Invalid token. Access denied.' });
  }
};
