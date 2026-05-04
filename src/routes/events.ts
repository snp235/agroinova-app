import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import { notify } from '../lib/notify';

const router = Router();

function formatEvent(e: any, userId?: string) {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.time,
    endTime: e.endTime,
    allDay: e.allDay,
    location: e.location,
    address: e.address,
    type: e.type,
    category: e.category,
    description: e.description,
    status: e.status,
    coverImage: e.coverImage,
    gardenId: e.gardenId,
    createdAt: e.createdAt,
    interested: e.eventInterests?.length ?? 0,
    isInterested: userId ? e.eventInterests?.some((i: any) => i.userId === userId) : false,
    organizer: e.organizer ? {
      id: e.organizer.id,
      name: e.organizer.name,
      role: e.organizer.role,
      school: e.organizer.school,
      avatar: e.organizer.avatar,
    } : null,
  };
}

const eventInclude = {
  organizer: { select: { id: true, name: true, role: true, school: true, avatar: true } },
  eventInterests: { select: { userId: true } },
};

// GET /api/events
router.get('/', async (req: AuthRequest, res: Response) => {
  const { category, type, upcoming, gardenId, search } = req.query;
  const where: any = {};
  if (category) where.category = category;
  if (type) where.type = type;
  if (gardenId) where.gardenId = gardenId;
  if (search) where.title = { contains: String(search) };
  if (upcoming === 'true') where.date = { gte: new Date().toISOString().split('T')[0] };

  const events = await prisma.event.findMany({
    where,
    include: eventInclude,
    orderBy: { date: 'asc' },
  });

  res.json(events.map(e => formatEvent(e, req.userId)));
});

// GET /api/events/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id }, include: eventInclude });
  if (!event) { res.status(404).json({ error: 'Evento não encontrado' }); return; }
  res.json(formatEvent(event, req.userId));
});

// POST /api/events (admin)
router.post('/', requireAuth, requireAdmin, uploadSingle('coverImage'), async (req: AuthRequest, res: Response) => {
  const { title, date, time, endTime, allDay, location, address, type, category, description, gardenId } = req.body;

  if (!title || !date || !time || !location || !type || !category || !description) {
    res.status(400).json({ error: 'Campos obrigatórios faltando' });
    return;
  }

  const coverImage = req.file ? `/uploads/${req.file.filename}` : req.body.coverImage || null;

  const event = await prisma.event.create({
    data: {
      title, date, time, endTime, allDay: allDay === 'true',
      location, address, type, category, description, coverImage,
      organizerId: req.userId!,
      gardenId: gardenId || null,
    },
    include: eventInclude,
  });

  res.status(201).json(formatEvent(event, req.userId));
});

// PUT /api/events/:id (admin)
router.put('/:id', requireAuth, requireAdmin, uploadSingle('coverImage'), async (req: AuthRequest, res: Response) => {
  const { title, date, time, endTime, allDay, location, address, type, category, description, status, gardenId } = req.body;
  const coverImage = req.file ? `/uploads/${req.file.filename}` : req.body.coverImage;

  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: {
      ...(title && { title }), ...(date && { date }), ...(time && { time }),
      ...(endTime !== undefined && { endTime }), ...(allDay !== undefined && { allDay: allDay === 'true' }),
      ...(location && { location }), ...(address !== undefined && { address }),
      ...(type && { type }), ...(category && { category }), ...(description && { description }),
      ...(status && { status }), ...(coverImage && { coverImage }),
      ...(gardenId !== undefined && { gardenId: gardenId || null }),
    },
    include: eventInclude,
  });

  res.json(formatEvent(event, req.userId));
});

// DELETE /api/events/:id (admin) — remoção definitiva
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) { res.status(404).json({ error: 'Evento não encontrado' }); return; }

  await prisma.event.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /api/events/:id/interest — toggle interesse
router.post('/:id/interest', requireAuth, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.eventInterest.findUnique({
    where: { eventId_userId: { eventId: req.params.id, userId: req.userId! } },
  });

  if (existing) {
    await prisma.eventInterest.delete({ where: { eventId_userId: { eventId: req.params.id, userId: req.userId! } } });
    res.json({ interested: false });
  } else {
    await prisma.eventInterest.create({ data: { eventId: req.params.id, userId: req.userId! } });
    // XP por interesse em evento
    await prisma.user.update({ where: { id: req.userId }, data: { xp: { increment: 8 } } });
    await prisma.leafEntry.create({ data: { userId: req.userId!, action: 'Participação em evento', detail: 'Interesse registrado', amount: 8 } });
    res.json({ interested: true });
  }
});

// ---- Sugestões de Evento ----

// GET /api/events/suggestions/list
router.get('/suggestions/list', async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const where: any = {};
  if (status) where.status = status;

  const suggestions = await prisma.eventSuggestion.findMany({
    where,
    include: { author: { select: { id: true, name: true, role: true, school: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(suggestions.map(s => ({
    ...s,
    timeAgo: getTimeAgo(s.createdAt),
  })));
});

// POST /api/events/suggestions
router.post('/suggestions', requireAuth, async (req: AuthRequest, res: Response) => {
  const { title, category, suggestedDate, description } = req.body;

  if (!title || !category) {
    res.status(400).json({ error: 'title e category são obrigatórios' });
    return;
  }

  const suggestion = await prisma.eventSuggestion.create({
    data: { title, category, suggestedDate, description, authorId: req.userId! },
    include: { author: { select: { id: true, name: true, role: true, school: true, avatar: true } } },
  });

  res.status(201).json({ ...suggestion, timeAgo: 'agora mesmo' });
});

// PUT /api/events/suggestions/:id (admin — aprovar/rejeitar)
router.put('/suggestions/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { status, rejectionMessage } = req.body;

  if (!['aprovada', 'rejeitada'].includes(status)) {
    res.status(400).json({ error: 'status deve ser "aprovada" ou "rejeitada"' });
    return;
  }

  const suggestion = await prisma.eventSuggestion.update({
    where: { id: req.params.id },
    data: { status, rejectionMessage: rejectionMessage || null },
    include: { author: { select: { id: true, name: true, role: true, school: true, avatar: true } } },
  });

  if (status === 'aprovada') {
    await notify({
      userId: suggestion.authorId,
      type: 'event_suggestion_approved',
      title: 'Sua sugestão de evento foi aceita',
      body: `"${suggestion.title}" foi aceita pela equipe. Em breve ela será publicada na agenda de eventos.`,
      linkTo: `/eventos`,
    });
  } else {
    await notify({
      userId: suggestion.authorId,
      type: 'event_suggestion_rejected',
      title: 'Sua sugestão de evento foi recusada',
      body: rejectionMessage
        ? `"${suggestion.title}" foi recusada. Motivo: ${rejectionMessage}`
        : `"${suggestion.title}" foi recusada pelo administrador.`,
      linkTo: null,
    });
  }

  res.json({ ...suggestion, timeAgo: getTimeAgo(suggestion.createdAt) });
});

function getTimeAgo(date: Date | string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

export default router;
