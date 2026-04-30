import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Configuração de níveis (espelhando o frontend)
const levels = [
  { level: 1, name: 'Semente', minXp: 0, maxXp: 100 },
  { level: 2, name: 'Broto', minXp: 100, maxXp: 250 },
  { level: 3, name: 'Muda', minXp: 250, maxXp: 450 },
  { level: 4, name: 'Planta', minXp: 450, maxXp: 700 },
  { level: 5, name: 'Flor', minXp: 700, maxXp: 1000 },
  { level: 6, name: 'Fruto', minXp: 1000, maxXp: 1400 },
  { level: 7, name: 'Árvore', minXp: 1400, maxXp: 99999 },
];

function calculateLevel(xp: number, coletas: number) {
  const byXp = [...levels].reverse().find(l => xp >= l.minXp) || levels[0];
  const byColetas = coletas >= 50 ? levels[6] : coletas >= 30 ? levels[5] : coletas >= 15 ? levels[4] : byXp;
  const current = byColetas.level >= byXp.level ? byColetas : byXp;
  const next = levels.find(l => l.level === current.level + 1);
  const progress = next ? Math.round(((xp - current.minXp) / (next.minXp - current.minXp)) * 100) : 100;
  return { ...current, progress: Math.min(progress, 100), nextLevelXp: next?.minXp };
}

const MEDALS = [
  { id: 'm1', name: 'Primeira Coleta', description: 'Registrou a primeira coleta', icon: '🌱', condition: (u: any) => u.coletas >= 1 },
  { id: 'm2', name: 'Explorador', description: 'Fez 5 coletas', icon: '🔍', condition: (u: any) => u.coletas >= 5 },
  { id: 'm3', name: 'Pesquisador', description: 'Fez 20 coletas', icon: '🔬', condition: (u: any) => u.coletas >= 20 },
  { id: 'm4', name: 'Naturalista', description: 'Fez 50 coletas', icon: '🌿', condition: (u: any) => u.coletas >= 50 },
  { id: 'm5', name: 'Sequência de 3', description: 'Manteve sequência de 3 dias', icon: '🔥', condition: (u: any) => u.streak >= 3 },
  { id: 'm6', name: 'Sequência de 7', description: 'Manteve sequência de 7 dias', icon: '⚡', condition: (u: any) => u.streak >= 7 },
  { id: 'm18', name: 'Nível Broto', description: 'Atingiu o nível Broto', icon: '🌾', condition: (u: any) => u.xp >= 100 },
];

// GET /api/gamification/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: {
      medals: true,
      leafHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

  const level = calculateLevel(user.xp, user.coletas);

  // Verificar e conceder medalhas automaticamente
  const newMedals: string[] = [];
  for (const medal of MEDALS) {
    const alreadyHas = user.medals.some(m => m.medalId === medal.id);
    if (!alreadyHas && medal.condition(user)) {
      await prisma.userMedal.create({ data: { userId: user.id, medalId: medal.id } }).catch(() => {});
      newMedals.push(medal.id);
    }
  }

  const allMedals = await prisma.userMedal.findMany({ where: { userId: req.userId } });
  const medals = MEDALS.map(m => ({
    ...m,
    unlocked: allMedals.some(um => um.medalId === m.id),
    unlockedAt: allMedals.find(um => um.medalId === m.id)?.unlockedAt,
  }));

  // Missões dinâmicas baseadas no progresso do usuário
  const missions = [
    { id: 'ms1', title: 'Registre 3 seres vivos esta semana', reward: 30, current: Math.min(user.coletas % 3, 3), target: 3, completed: user.coletas % 3 === 0 && user.coletas > 0 },
    { id: 'ms2', title: 'Participe de um evento', reward: 30, current: 1, target: 1, completed: user.xp >= 8 },
    { id: 'ms3', title: 'Faça 2 coletas em dias diferentes', reward: 25, current: Math.min(user.coletas, 2), target: 2, completed: user.coletas >= 2 },
    { id: 'ms4', title: 'Responda o formulário alimentar', reward: 25, current: 0, target: 1, completed: false },
  ];

  const leafHistory = user.leafHistory.map(l => ({
    id: l.id,
    action: l.action,
    detail: l.detail,
    amount: l.amount,
    timeAgo: getTimeAgo(l.createdAt),
  }));

  res.json({ xp: user.xp, coletas: user.coletas, streak: user.streak, level, medals, missions, leafHistory, newMedals });
});

// GET /api/gamification/ranking
router.get('/ranking', async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { status: 'ativo' },
    select: { id: true, name: true, school: true, xp: true, coletas: true, streak: true },
    orderBy: { xp: 'desc' },
    take: 20,
  });

  const ranking = users.map(u => ({
    ...u,
    level: calculateLevel(u.xp, u.coletas),
  }));

  res.json(ranking);
});

// POST /api/gamification/food-answers
router.post('/food-answers', requireAuth, async (req: AuthRequest, res: Response) => {
  const { answers } = req.body; // [{ questionId: 1, answer: 3 }, ...]

  if (!Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ error: 'answers deve ser um array' });
    return;
  }

  await prisma.foodAnswer.createMany({
    data: answers.map((a: { questionId: number; answer: number }) => ({
      userId: req.userId!,
      questionId: a.questionId,
      answer: a.answer,
    })),
  });

  // Calcular índice alimentar (média ponderada das respostas, máx 4 por questão → escala 0-100)
  const totalScore = answers.reduce((acc: number, a: any) => acc + a.answer, 0);
  const maxScore = answers.length * 4;
  const foodIndex = Math.round((totalScore / maxScore) * 100);

  await prisma.user.update({ where: { id: req.userId }, data: { foodIndex, xp: { increment: 25 } } });
  await prisma.leafEntry.create({ data: { userId: req.userId!, action: 'Formulário alimentar', detail: 'Papo de Comer Bem', amount: 25 } });

  res.json({ foodIndex, xpEarned: 25 });
});

function getTimeAgo(date: Date | string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

export default router;
