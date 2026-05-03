import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { notify } from '../lib/notify';

const router = Router();

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

// POST /api/moderation/reports — qualquer usuário autenticado pode reportar
router.post('/reports', requireAuth, async (req: AuthRequest, res: Response) => {
  const { postId, reason } = req.body as { postId?: string; reason?: string };
  if (!postId || !reason || !reason.trim()) {
    res.status(400).json({ error: 'postId e reason são obrigatórios' });
    return;
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    res.status(404).json({ error: 'Publicação não encontrada' });
    return;
  }

  // Evita o usuário reportar o mesmo post várias vezes ainda em aberto
  const existing = await prisma.report.findFirst({
    where: { postId, reporterId: req.userId, resolution: 'aberta' },
  });
  if (existing) {
    res.status(200).json({ ok: true, alreadyReported: true });
    return;
  }

  const report = await prisma.report.create({
    data: {
      postId,
      reporterId: req.userId!,
      reason: reason.trim(),
    },
  });
  res.status(201).json({ id: report.id, ok: true });
});

// GET /api/moderation/reports — admin vê todos os reports (filtrável)
router.get('/reports', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      post: { include: { author: true } },
      reporter: true,
      reviewer: true,
    },
  });

  res.json(reports.map(r => ({
    id: r.id,
    reason: r.reason,
    resolution: r.resolution,
    reviewerNote: r.reviewerNote,
    createdAt: r.createdAt,
    timeAgo: timeAgo(r.createdAt),
    reviewedAt: r.reviewedAt,
    post: r.post ? {
      id: r.post.id,
      title: r.post.title,
      description: r.post.description,
      image: r.post.image,
      type: r.post.type,
      status: r.post.status,
      author: { id: r.post.author.id, name: r.post.author.name, avatar: r.post.author.avatar },
    } : null,
    reporter: { id: r.reporter.id, name: r.reporter.name },
    reviewer: r.reviewer ? { id: r.reviewer.id, name: r.reviewer.name } : null,
  })));
});

// PATCH /api/moderation/reports/:id — admin resolve o report
router.patch('/reports/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { resolution, reviewerNote } = req.body as { resolution?: string; reviewerNote?: string };
  const valid = ['mantida', 'removida', 'aviso'];
  if (!resolution || !valid.includes(resolution)) {
    res.status(400).json({ error: `resolution deve ser um de: ${valid.join(', ')}` });
    return;
  }

  const report = await prisma.report.findUnique({ where: { id: req.params.id }, include: { post: true } });
  if (!report) {
    res.status(404).json({ error: 'Report não encontrado' });
    return;
  }

  await prisma.report.update({
    where: { id: req.params.id },
    data: {
      resolution,
      reviewerNote: reviewerNote?.trim() || null,
      reviewerId: req.userId,
      reviewedAt: new Date(),
    },
  });

  // Se a decisão foi remover, marca o post como removida
  if (resolution === 'removida' && report.post) {
    await prisma.post.update({ where: { id: report.postId }, data: { status: 'removida' } });
  }

  // Notifica o autor do post quando aviso ou remoção
  if (report.post && (resolution === 'removida' || resolution === 'aviso')) {
    const titleMsg = resolution === 'removida'
      ? 'Sua publicação foi removida'
      : 'Aviso sobre sua publicação';
    const bodyMsg = resolution === 'removida'
      ? `"${report.post.title}" foi removida pela moderação. Motivo: ${reviewerNote || report.reason}`
      : `"${report.post.title}" recebeu um aviso. ${reviewerNote || report.reason}`;
    await notify({
      userId: report.post.authorId,
      type: 'post_reported_action',
      title: titleMsg,
      body: bodyMsg,
      linkTo: `/publicacao/${report.postId}`,
    });
  }

  res.json({ ok: true });
});

export default router;
