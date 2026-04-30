import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

const gardenInclude = {
  cultivoList: { select: { cultivo: true } },
  canteiros: {
    include: { cultivoList: { select: { cultivo: true } } },
  },
  participants: {
    include: { user: { select: { id: true, name: true, role: true, school: true, avatar: true } } },
  },
};

function formatGarden(g: any) {
  return {
    id: g.id,
    name: g.name,
    type: g.type,
    status: g.status,
    school: g.school,
    territory: g.territory,
    image: g.image,
    description: g.description,
    responsible: g.responsible,
    area: g.area,
    address: g.address,
    access: g.access,
    featured: g.featured,
    createdAt: g.createdAt,
    registros: g._count?.posts ?? 0,
    participants: g.participants?.length ?? 0,
    cultivos: g.cultivoList?.map((c: any) => c.cultivo) ?? [],
    canteiros: g.canteiros?.map((c: any) => ({
      id: c.id,
      name: c.name,
      fase: c.fase,
      area: c.area,
      lastIrrigation: c.lastIrrigation,
      observations: c.observations,
      cultivos: c.cultivoList?.map((cv: any) => cv.cultivo) ?? [],
    })) ?? [],
    team: g.participants?.map((p: any) => ({
      user: p.user,
      role: p.role,
    })) ?? [],
  };
}

// GET /api/gardens
router.get('/', async (req: AuthRequest, res: Response) => {
  const { type, status, search, territory } = req.query;
  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (territory) where.territory = { contains: String(territory) };
  if (search) where.name = { contains: String(search) };

  const gardens = await prisma.garden.findMany({
    where,
    include: { ...gardenInclude, _count: { select: { participants: true } } },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
  });

  res.json(gardens.map(formatGarden));
});

// GET /api/gardens/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const garden = await prisma.garden.findUnique({
    where: { id: req.params.id },
    include: gardenInclude,
  });
  if (!garden) { res.status(404).json({ error: 'Horta não encontrada' }); return; }
  res.json(formatGarden(garden));
});

// POST /api/gardens (admin)
router.post('/', requireAuth, requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  const { name, type, status, school, territory, description, responsible, area, address, access, featured, cultivos } = req.body;

  if (!name || !type || !school || !territory || !description || !responsible) {
    res.status(400).json({ error: 'Campos obrigatórios faltando' });
    return;
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || '';

  const garden = await prisma.garden.create({
    data: {
      name, type, status: status || 'ativa', school, territory, description,
      responsible, area, address, access, featured: featured === 'true',
      image: imageUrl,
      cultivoList: cultivos ? {
        create: JSON.parse(cultivos).map((c: string) => ({ cultivo: c })),
      } : undefined,
    },
    include: gardenInclude,
  });

  // Adicionar responsável como participante
  const responsibleUser = await prisma.user.findFirst({ where: { name: responsible } });
  if (responsibleUser) {
    await prisma.gardenParticipant.create({
      data: { gardenId: garden.id, userId: responsibleUser.id, role: 'responsavel' },
    }).catch(() => {});
  }

  res.status(201).json(formatGarden(garden));
});

// PUT /api/gardens/:id (admin)
router.put('/:id', requireAuth, requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  const { name, type, status, school, territory, description, responsible, area, address, access, featured, cultivos } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl;

  const garden = await prisma.garden.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }), ...(type && { type }), ...(status && { status }),
      ...(school && { school }), ...(territory && { territory }),
      ...(description && { description }), ...(responsible && { responsible }),
      ...(area !== undefined && { area }), ...(address !== undefined && { address }),
      ...(access !== undefined && { access }), ...(featured !== undefined && { featured: featured === 'true' }),
      ...(imageUrl && { image: imageUrl }),
      ...(cultivos && {
        cultivoList: {
          deleteMany: {},
          create: JSON.parse(cultivos).map((c: string) => ({ cultivo: c })),
        },
      }),
    },
    include: gardenInclude,
  });

  res.json(formatGarden(garden));
});

// POST /api/gardens/:id/canteiros (admin)
router.post('/:id/canteiros', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, fase, area, lastIrrigation, observations, cultivos } = req.body;

  const canteiro = await prisma.canteiro.create({
    data: {
      gardenId: req.params.id, name, fase, area, lastIrrigation, observations,
      cultivoList: cultivos ? { create: cultivos.map((c: string) => ({ cultivo: c })) } : undefined,
    },
    include: { cultivoList: true },
  });

  res.status(201).json({
    ...canteiro,
    cultivos: canteiro.cultivoList.map(c => c.cultivo),
  });
});

// POST /api/gardens/:id/participants
router.post('/:id/participants', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.body;
  await prisma.gardenParticipant.upsert({
    where: { gardenId_userId: { gardenId: req.params.id, userId } },
    create: { gardenId: req.params.id, userId, role },
    update: { role },
  });
  res.json({ ok: true });
});

export default router;
