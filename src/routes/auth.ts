import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password, role, school } = req.body;

  if (!name || !email || !password || !role || !school) {
    res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'Email já cadastrado' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const isAdmin = role === 'professor';

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, school, isAdmin },
    select: { id: true, name: true, email: true, role: true, school: true, isAdmin: true, avatar: true, xp: true, coletas: true, streak: true, foodIndex: true },
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha são obrigatórios' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Email ou senha incorretos' });
    return;
  }

  if (user.status === 'desativado') {
    res.status(403).json({ error: 'Conta desativada. Entre em contato com o administrador' });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: 'Esta conta usa login com Google. Clique em "Continuar com o Google".' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Email ou senha incorretos' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      school: user.school, isAdmin: user.isAdmin, avatar: user.avatar,
      xp: user.xp, coletas: user.coletas, streak: user.streak, foodIndex: user.foodIndex,
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, role: true, school: true, isAdmin: true, avatar: true, xp: true, coletas: true, streak: true, foodIndex: true, status: true },
  });
  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
  res.json(user);
});

// PUT /api/auth/me (atualizar perfil)
router.put('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, school, avatar } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { ...(name && { name }), ...(school && { school }), ...(avatar !== undefined && { avatar }) },
    select: { id: true, name: true, email: true, role: true, school: true, isAdmin: true, avatar: true, xp: true, coletas: true, streak: true, foodIndex: true },
  });
  res.json(user);
});

export default router;
