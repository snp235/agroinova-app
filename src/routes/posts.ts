import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';

const router = Router();

function formatPost(post: any, userId?: string) {
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    description: post.description,
    image: post.image,
    likes: post.postLikes?.length ?? 0,
    liked: userId ? post.postLikes?.some((l: any) => l.userId === userId) : false,
    saved: userId ? post.postSaves?.some((s: any) => s.userId === userId) : false,
    garden: post.garden,
    category: post.category,
    location: post.location,
    collectTime: post.collectTime,
    createdAt: post.createdAt,
    timeAgo: getTimeAgo(post.createdAt),
    author: {
      id: post.author.id,
      name: post.author.name,
      role: post.author.role,
      school: post.author.school,
      avatar: post.author.avatar,
    },
    scientificData: post.type === 'coleta' ? {
      verified: post.sciVerified ?? false,
      verifiedBy: post.sciVerifiedBy,
      popularName: post.sciPopularName,
      scientificName: post.sciScientificName,
      family: post.sciFamily,
      ecologicalInfo: post.sciEcologicalInfo,
    } : undefined,
  };
}

function getTimeAgo(date: Date | string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

const postInclude = {
  author: true,
  postLikes: { select: { userId: true } },
  postSaves: { select: { userId: true } },
};

// GET /api/posts
router.get('/', async (req: AuthRequest, res: Response) => {
  const { type, category, search, page = '1', limit = '20' } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { status: 'ativo' };
  if (type) where.type = type;
  if (category) where.category = category;
  if (search) where.OR = [
    { title: { contains: String(search) } },
    { description: { contains: String(search) } },
  ];

  const posts = await prisma.post.findMany({
    where, include: postInclude, orderBy: { createdAt: 'desc' }, skip, take: Number(limit),
  });

  res.json(posts.map(p => formatPost(p, req.userId)));
});

// GET /api/posts/saved
router.get('/saved', requireAuth, async (req: AuthRequest, res: Response) => {
  const saved = await prisma.postSave.findMany({
    where: { userId: req.userId },
    include: { post: { include: postInclude } },
    orderBy: { post: { createdAt: 'desc' } },
  });
  res.json(saved.map(s => formatPost(s.post, req.userId)));
});

// GET /api/posts/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id }, include: postInclude });
  if (!post || post.status === 'removida') { res.status(404).json({ error: 'Publicação não encontrada' }); return; }
  res.json(formatPost(post, req.userId));
});

// POST /api/posts (com ou sem imagem)
router.post('/', requireAuth, uploadSingle('image'), async (req: AuthRequest, res: Response) => {
  const { type, title, description, garden, category, location, collectTime } = req.body;

  if (!type || !title || !description) {
    res.status(400).json({ error: 'type, title e description são obrigatórios' });
    return;
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || null;

  const post = await prisma.post.create({
    data: {
      type, title, description, garden, category, location, collectTime,
      image: imageUrl,
      authorId: req.userId!,
      sciVerified: false,
    },
    include: postInclude,
  });

  // XP por nova publicação
  await grantXP(req.userId!, 10, 'Nova publicação', `${title}`, 10);
  if (type === 'coleta') {
    await prisma.user.update({ where: { id: req.userId }, data: { coletas: { increment: 1 } } });
    await grantXP(req.userId!, 0, 'Registro de coleta', title, 0);
  }

  res.status(201).json(formatPost(post, req.userId));
});

// PUT /api/posts/:id/like — toggle curtida
router.post('/:id/like', requireAuth, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: req.params.id, userId: req.userId! } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { postId_userId: { postId: req.params.id, userId: req.userId! } } });
    res.json({ liked: false });
  } else {
    await prisma.postLike.create({ data: { postId: req.params.id, userId: req.userId! } });
    res.json({ liked: true });
  }
});

// POST /api/posts/:id/save — toggle salvar
router.post('/:id/save', requireAuth, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.postSave.findUnique({
    where: { postId_userId: { postId: req.params.id, userId: req.userId! } },
  });

  if (existing) {
    await prisma.postSave.delete({ where: { postId_userId: { postId: req.params.id, userId: req.userId! } } });
    res.json({ saved: false });
  } else {
    await prisma.postSave.create({ data: { postId: req.params.id, userId: req.userId! } });
    res.json({ saved: true });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) { res.status(404).json({ error: 'Não encontrado' }); return; }
  if (post.authorId !== req.userId && !req.isAdmin) {
    res.status(403).json({ error: 'Sem permissão' }); return;
  }
  await prisma.post.update({ where: { id: req.params.id }, data: { status: 'removida' } });
  res.json({ ok: true });
});

async function grantXP(userId: string, xpAmount: number, action: string, detail: string, amount: number) {
  if (xpAmount > 0) {
    await prisma.user.update({ where: { id: userId }, data: { xp: { increment: xpAmount } } });
  }
  await prisma.leafEntry.create({ data: { userId, action, detail, amount } });
}

export default router;
