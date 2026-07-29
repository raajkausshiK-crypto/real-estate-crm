import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret') as { id: number };
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
