import jwt from 'jsonwebtoken';

export const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  const role = req.user?.role || 'admin';
  if (!roles.includes(role)) {
    return res.status(403).json({ message: 'Access denied for this role' });
  }
  next();
};

export const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role || 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
