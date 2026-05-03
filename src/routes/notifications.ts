import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

// GET /api/notifications — lista notificações do usuário logado
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const list = await prisma.notification.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(list.map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    linkTo: n.linkTo,
    read: n.read,
    createdAt: n.createdAt,
    timeAgo: timeAgo(n.createdAt),
  })));
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: req.userId, read: false },
  });
  res.json({ count });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!n || n.userId !== req.userId) {
    res.status(404).json({ error: 'Notificação não encontrada' });
    return;
  }
  await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  res.json({ ok: true });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

export default router;
