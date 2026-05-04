import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { notify } from '../lib/notify';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  const [totalUsers, activeUsers, admins, inactiveUsers, gardens, postsThisWeek, postsToday, pendingCurations, pendingSuggestions, reportedPostsCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ativo' } }),
    prisma.user.count({ where: { isAdmin: true } }),
    prisma.user.count({ where: { status: 'inativo' } }),
    prisma.garden.findMany({ select: { status: true } }),
    prisma.post.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) }, status: 'ativo' } }),
    prisma.post.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: 'ativo' } }),
    prisma.post.count({ where: { type: 'coleta', sciVerified: false, status: 'ativo' } }),
    prisma.eventSuggestion.count({ where: { status: 'pendente' } }),
    prisma.report.count({ where: { resolution: 'aberta' } }),
  ]);

  const activeGardens = gardens.filter(g => g.status === 'ativa').length;
  const gardensInProgress = gardens.filter(g => g.status === 'implantacao').length;
  const engagementRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

  res.json({
    totalUsers, activeUsers, admins, inactiveUsers,
    postsThisWeek, postsToday, activeGardens, gardensInProgress,
    engagementRate, pendingCurations, pendingEventSuggestions: pendingSuggestions,
    reportedPostsCount,
  });
});

// GET /api/admin/users
router.get('/users', async (req: AuthRequest, res: Response) => {
  const { status, role, search } = req.query;
  const where: any = {};
  if (status) where.status = status;
  if (role) where.role = role;
  if (search) where.OR = [
    { name: { contains: String(search) } },
    { email: { contains: String(search) } },
  ];

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, role: true, isAdmin: true,
      school: true, avatar: true, status: true, xp: true, coletas: true,
      createdAt: true, lastActive: true,
      medals: { select: { id: true } },
      posts: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const levels = [
    { level: 1, name: 'Semente', minXp: 0 },
    { level: 2, name: 'Broto', minXp: 100 },
    { level: 3, name: 'Muda', minXp: 250 },
    { level: 4, name: 'Planta', minXp: 450 },
    { level: 5, name: 'Flor', minXp: 700 },
    { level: 6, name: 'Fruto', minXp: 1000 },
    { level: 7, name: 'Árvore', minXp: 1400 },
  ];

  function getUserLevel(xp: number) {
    return [...levels].reverse().find(l => xp >= l.minXp) || levels[0];
  }

  res.json(users.map(u => {
    const lv = getUserLevel(u.xp);
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, isAdmin: u.isAdmin,
      school: u.school, avatar: u.avatar, status: u.status, xp: u.xp, coletas: u.coletas,
      level: lv.level, levelName: lv.name,
      medals: u.medals.length,
      totalPosts: u.posts.length,
      createdAt: u.createdAt,
      lastActive: u.lastActive,
    };
  }));
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      posts: { where: { status: 'ativo' }, orderBy: { createdAt: 'desc' }, take: 10 },
      medals: true,
      leafHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
      gardenMemberships: { include: { garden: { select: { id: true, name: true } } } },
    },
  });
  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
  res.json(user);
});

// PUT /api/admin/users/:id (editar status, role, isAdmin)
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  const { status, role, isAdmin, name, school, email } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(status && { status }),
      ...(role && { role }),
      ...(isAdmin !== undefined && { isAdmin }),
      ...(name && { name }),
      ...(school && { school }),
      ...(email && { email }),
    },
  });
  res.json(user);
});

// POST /api/admin/users (criar usuário manualmente)
router.post('/users', async (req: AuthRequest, res: Response) => {
  const { name, email, role, school, password, isAdmin } = req.body;

  if (!name || !email || !role) {
    res.status(400).json({ error: 'name, email e role são obrigatórios' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'E-mail já cadastrado', existingId: existing.id });
    return;
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const user = await prisma.user.create({
    data: {
      name, email, role,
      school: school || 'A definir',
      passwordHash,
      isAdmin: !!isAdmin,
    },
  });

  res.status(201).json(user);
});

// DELETE /api/admin/users/:id (excluir permanentemente — só desativadas)
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

  if (user.status !== 'desativado') {
    res.status(400).json({ error: 'Para excluir permanentemente, primeiro desative a conta.' });
    return;
  }

  // FK Post.authorId é RESTRICT por padrão. Deletamos posts e relações do
  // usuário em transação antes de remover o usuário.
  await prisma.$transaction([
    prisma.post.deleteMany({ where: { authorId: req.params.id } }),
    prisma.event.deleteMany({ where: { organizerId: req.params.id } }),
    prisma.eventSuggestion.deleteMany({ where: { authorId: req.params.id } }),
    prisma.user.delete({ where: { id: req.params.id } }),
  ]);

  res.json({ ok: true });
});

// GET /api/admin/curadoria — coletas pendentes de identificação
router.get('/curadoria', async (_req: AuthRequest, res: Response) => {
  const posts = await prisma.post.findMany({
    where: { type: 'coleta', sciVerified: false, status: 'ativo' },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(posts.map(p => ({
    id: p.id,
    title: p.title,
    author: p.author.name,
    authorId: p.author.id,
    category: p.category,
    location: p.location,
    time: new Date(p.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    timeAgo: getTimeAgo(p.createdAt),
    image: p.image,
    identified: p.sciVerified ?? false,
    identification: p.sciVerifiedBy ? {
      popularName: p.sciPopularName,
      scientificName: p.sciScientificName,
      family: p.sciFamily,
      ecologicalInfo: p.sciEcologicalInfo,
      verifiedBy: p.sciVerifiedBy,
    } : undefined,
  })));
});

// PUT /api/admin/curadoria/:id — identificar/verificar coleta
router.put('/curadoria/:id', async (req: AuthRequest, res: Response) => {
  const { popularName, scientificName, family, ecologicalInfo, classification } = req.body;

  const adminUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });

  const post = await prisma.post.update({
    where: { id: req.params.id },
    data: {
      sciVerified: true,
      sciVerifiedBy: adminUser?.name || 'Admin',
      sciPopularName: popularName,
      sciScientificName: scientificName,
      sciFamily: family,
      sciEcologicalInfo: ecologicalInfo,
    },
  });

  // Conceder XP ao autor da coleta (bônus de identificação)
  await prisma.user.update({ where: { id: post.authorId }, data: { xp: { increment: 15 } } });
  await prisma.leafEntry.create({
    data: { userId: post.authorId, action: 'Coleta identificada (bônus)', detail: `${popularName} identificada`, amount: 15 },
  });

  await notify({
    userId: post.authorId,
    type: 'post_identified',
    title: 'Sua coleta foi identificada',
    body: `Um professor identificou "${post.title}" como ${popularName}. Você ganhou +15 folhas!`,
    linkTo: `/publicacao/${post.id}`,
  });

  res.json({ ok: true, post });
});

// GET /api/admin/map-points — todas coletas e hortas com coordenadas
router.get('/map-points', async (_req: AuthRequest, res: Response) => {
  const [posts, gardens] = await Promise.all([
    prisma.post.findMany({
      where: {
        type: 'coleta',
        status: 'ativo',
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true, title: true, category: true, image: true,
        latitude: true, longitude: true, createdAt: true, location: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.garden.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true, name: true, type: true, status: true, image: true,
        latitude: true, longitude: true, school: true, territory: true,
      },
    }),
  ]);

  res.json({
    posts: posts.map(p => ({
      id: p.id,
      title: p.title,
      category: p.category,
      image: p.image,
      latitude: p.latitude,
      longitude: p.longitude,
      location: p.location,
      createdAt: p.createdAt,
      author: p.author,
    })),
    gardens,
  });
});

// GET /api/admin/reports?period=week|month|semester|year
router.get('/reports', async (req: AuthRequest, res: Response) => {
  const period = (req.query.period as string) || 'semester';
  const now = new Date();

  function periodStart(p: string, end: Date): Date {
    const d = new Date(end);
    if (p === 'week') d.setDate(d.getDate() - 7);
    else if (p === 'month') d.setMonth(d.getMonth() - 1);
    else if (p === 'year') d.setFullYear(d.getFullYear() - 1);
    else d.setMonth(d.getMonth() - 6); // semester (default)
    return d;
  }

  const start = periodStart(period, now);
  const previousStart = periodStart(period, start);

  // Serializa em 3 batches pequenos para não estourar o pool do Postgres no Railway.
  // Antes era um Promise.all com 24 queries — gerava muitos resets de conexão.
  const [
    totalUsersCurrent, totalUsersPrev,
    activeUsersCurrent, activeUsersPrev,
    publicationsCurrent, publicationsPrev,
    sciCollectsCurrent, sciCollectsPrev,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { lte: now } } }),
    prisma.user.count({ where: { createdAt: { lte: start } } }),
    prisma.user.count({ where: { lastActive: { gte: start, lte: now } } }),
    prisma.user.count({ where: { lastActive: { gte: previousStart, lt: start } } }),
    prisma.post.count({ where: { createdAt: { gte: start, lte: now }, status: 'ativo' } }),
    prisma.post.count({ where: { createdAt: { gte: previousStart, lt: start }, status: 'ativo' } }),
    prisma.post.count({ where: { type: 'coleta', createdAt: { gte: start, lte: now }, status: 'ativo' } }),
    prisma.post.count({ where: { type: 'coleta', createdAt: { gte: previousStart, lt: start }, status: 'ativo' } }),
  ]);

  const [
    eventsRealizedCurrent,
    studentsInvolved,
    studentsResponded,
    schoolsCount,
    schoolsWithPosts,
    activeGardens,
    biodIdentifiedCount,
    biodUniqueSpeciesRaw,
  ] = await Promise.all([
    prisma.event.count({ where: { createdAt: { gte: start, lte: now }, status: { not: 'cancelado' } } }),
    prisma.user.count({ where: { role: 'aluno', status: { not: 'desativado' } } }),
    prisma.user.count({ where: { role: 'aluno', foodIndex: { not: null }, status: { not: 'desativado' } } }),
    prisma.user.findMany({ where: { school: { not: 'A definir' } }, select: { school: true }, distinct: ['school'] }),
    prisma.user.findMany({
      where: { school: { not: 'A definir' }, posts: { some: { createdAt: { gte: start } } } },
      select: { school: true }, distinct: ['school'],
    }),
    prisma.garden.count({ where: { status: 'ativa' } }),
    prisma.post.count({ where: { type: 'coleta', sciVerified: true, createdAt: { gte: start, lte: now }, status: 'ativo' } }),
    prisma.post.findMany({
      where: { type: 'coleta', sciVerified: true, sciScientificName: { not: null }, createdAt: { gte: start, lte: now } },
      select: { sciScientificName: true }, distinct: ['sciScientificName'],
    }),
  ]);

  const [
    foodResponses,
    foodIndexUsers,
    activePosts,
    activeStudentsLog,
  ] = await Promise.all([
    prisma.foodAnswer.count({ where: { createdAt: { gte: start, lte: now } } }),
    prisma.user.findMany({ where: { foodIndex: { not: null } }, select: { foodIndex: true } }),
    prisma.post.findMany({ where: { type: 'coleta', createdAt: { gte: start, lte: now }, status: 'ativo' }, select: { createdAt: true, category: true } }),
    prisma.user.findMany({ where: { lastActive: { gte: start, lte: now }, role: 'aluno' }, select: { lastActive: true } }),
  ]);

  const biodTotalCollects = sciCollectsCurrent;
  const studentsTotal = studentsInvolved;
  const organizations = schoolsCount;

  // Buckets semanais (até 12 semanas dentro do período)
  const totalDays = Math.max(7, Math.round((now.getTime() - start.getTime()) / 86400000));
  const numBuckets = Math.min(12, Math.max(4, Math.round(totalDays / 7)));
  const bucketMs = (now.getTime() - start.getTime()) / numBuckets;
  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
    week: `Sem ${i + 1}`,
    from: new Date(start.getTime() + i * bucketMs),
    to: new Date(start.getTime() + (i + 1) * bucketMs),
  }));

  const weeklyActiveStudents = buckets.map(b => ({
    week: b.week,
    value: activeStudentsLog.filter(u => u.lastActive >= b.from && u.lastActive < b.to).length,
  }));

  const weeklyCollects = buckets.map(b => {
    const inBucket = activePosts.filter(p => p.createdAt >= b.from && p.createdAt < b.to);
    return {
      week: b.week,
      serVivo: inBucket.filter(p => p.category === 'ser-vivo').length,
      impacto: inBucket.filter(p => p.category === 'impacto-ambiental').length,
    };
  });

  const engagementCurrent = totalUsersCurrent > 0 ? Math.round((activeUsersCurrent / totalUsersCurrent) * 100) : 0;
  const engagementPrev = totalUsersPrev > 0 ? Math.round((activeUsersPrev / totalUsersPrev) * 100) : 0;

  const foodIndices = foodIndexUsers.map(u => u.foodIndex!).filter((n): n is number => typeof n === 'number');
  const averageIndex = foodIndices.length > 0
    ? Math.round(foodIndices.reduce((a, b) => a + b, 0) / foodIndices.length)
    : 0;

  function bucketFood(min: number, max: number, label: string, color: string) {
    const list = foodIndexUsers.filter(u => u.foodIndex! >= min && u.foodIndex! <= max);
    return { faixa: label, percent: foodIndices.length > 0 ? Math.round((list.length / foodIndices.length) * 100) : 0, count: list.length, color };
  }

  const foodIndexDistribution = foodIndices.length === 0 ? [] : [
    bucketFood(81, 100, 'Ótimo (81-100)', '#15803d'),
    bucketFood(61, 80, 'Bom (61-80)', '#22c55e'),
    bucketFood(41, 60, 'Regular (41-60)', '#eab308'),
    bucketFood(21, 40, 'Ruim (21-40)', '#ef4444'),
    bucketFood(0, 20, 'Muito ruim (0-20)', '#dc2626'),
  ];

  res.json({
    period,
    kpis: {
      activeUsers: { current: activeUsersCurrent, previous: activeUsersPrev },
      publications: { current: publicationsCurrent, previous: publicationsPrev },
      scientificCollects: { current: sciCollectsCurrent, previous: sciCollectsPrev },
      engagementRate: { current: engagementCurrent, previous: engagementPrev },
    },
    education: {
      studentsInvolved,
      eventsRealized: eventsRealizedCurrent,
      schoolParticipation: schoolsCount.length > 0
        ? Math.round((schoolsWithPosts.length / schoolsCount.length) * 100)
        : 0,
      weeklyActiveStudents,
    },
    biodiversity: {
      totalCollects: biodTotalCollects,
      uniqueSpecies: biodUniqueSpeciesRaw.length,
      identifiedPercent: biodTotalCollects > 0 ? Math.round((biodIdentifiedCount / biodTotalCollects) * 100) : 0,
      weeklyCollects,
    },
    food: {
      totalResponses: foodResponses,
      averageIndex,
      studentsResponded: studentsTotal > 0 ? Math.round((studentsResponded / studentsTotal) * 100) : 0,
      foodIndexDistribution,
    },
    mecGoals: [
      { id: 'hortas', title: 'Hortas implantadas', icon: 'Sprout', goal: 4, done: activeGardens },
      { id: 'students', title: 'Estudantes envolvidos', icon: 'Users', goal: 200, done: studentsInvolved },
      { id: 'orgs', title: 'Organizações parceiras ativas', icon: 'Building2', goal: 15, done: organizations.length },
    ],
  });
});

// GET /api/admin/activity — log de atividades recentes
router.get('/activity', async (_req: AuthRequest, res: Response) => {
  const [recentPosts, recentUsers, recentLeaves] = await Promise.all([
    prisma.post.findMany({
      where: { status: 'ativo' },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, name: true, school: true, createdAt: true },
    }),
    prisma.leafEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const activities = [
    ...recentPosts.map(p => ({
      id: `post-${p.id}`,
      userId: p.author.id,
      userName: p.author.name,
      action: p.type === 'coleta' ? 'fez uma coleta' : 'publicou informativo',
      detail: p.title,
      icon: p.type === 'coleta' ? '🌱' : '📢',
      timeAgo: getTimeAgo(p.createdAt),
      linkTo: `/publicacao/${p.id}`,
    })),
    ...recentUsers.map(u => ({
      id: `user-${u.id}`,
      userId: u.id,
      userName: u.name,
      action: 'se cadastrou',
      detail: `Novo usuário · ${u.school}`,
      icon: '👤',
      timeAgo: getTimeAgo(u.createdAt),
    })),
  ].sort((a, b) => a.timeAgo.localeCompare(b.timeAgo)).slice(0, 10);

  res.json(activities);
});

// GET /api/admin/school-summaries
router.get('/school-summaries', async (_req: AuthRequest, res: Response) => {
  const schools = await prisma.user.groupBy({
    by: ['school'],
    _count: { id: true },
    where: { status: 'ativo' },
  });

  const summaries = await Promise.all(schools.map(async s => {
    const [postsThisWeek, gardens] = await Promise.all([
      prisma.post.count({
        where: {
          status: 'ativo',
          createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          author: { school: s.school },
        },
      }),
      prisma.garden.count({ where: { school: { contains: s.school } } }),
    ]);

    return {
      name: s.school,
      students: s._count.id,
      postsThisWeek,
      events: gardens,
      collectsGoal: 50,
      collectsDone: 0,
    };
  }));

  res.json(summaries);
});

function getTimeAgo(date: Date | string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

export default router;
