import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  isAdmin?: boolean;
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

// Cache em memória do último bump de lastActive por usuário.
// Evita escrever no DB a cada request — só atualiza se passou >5min.
const lastActiveCache = new Map<string, number>();
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status === 'desativado') {
      res.status(401).json({ error: 'Usuário inválido ou desativado' });
      return;
    }
    req.userId = user.id;
    req.userRole = user.role;
    req.isAdmin = user.isAdmin;

    const now = Date.now();
    const lastBumped = lastActiveCache.get(user.id) ?? 0;
    if (now - lastBumped > LAST_ACTIVE_THROTTLE_MS) {
      lastActiveCache.set(user.id, now);
      prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } })
        .catch(() => { /* não bloqueia o request se falhar */ });
    }

    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Acesso restrito a administradores' });
    return;
  }
  next();
}

// Para endpoints públicos que QUEREM saber se há um usuário logado
// (ex: GET /posts retorna liked/saved específicos do user). Se não houver
// token ou o token for inválido, segue sem userId — não rejeita.
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (user && user.status !== 'desativado') {
      req.userId = user.id;
      req.userRole = user.role;
      req.isAdmin = user.isAdmin;
    }
  } catch {
    // token inválido ou expirado — segue como visitante
  }

  next();
}
