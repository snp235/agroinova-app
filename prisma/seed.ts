import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser(data: {
  email: string;
  name: string;
  password?: string;
  role: string;
  school: string;
  isAdmin?: boolean;
  xp?: number;
  coletas?: number;
}) {
  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;
  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      name: data.name,
      role: data.role,
      school: data.school,
      isAdmin: data.isAdmin ?? false,
      ...(passwordHash && { passwordHash }),
      ...(data.xp !== undefined && { xp: data.xp }),
      ...(data.coletas !== undefined && { coletas: data.coletas }),
    },
    create: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      school: data.school,
      isAdmin: data.isAdmin ?? false,
      xp: data.xp ?? 0,
      coletas: data.coletas ?? 0,
    },
  });
}

async function main() {
  console.log('🌱 Seeding database...');

  // ===== Users =====
  const admin = await upsertUser({
    email: 'admin.teste@agroinova.com',
    name: 'Admin',
    password: 'Teste@123',
    role: 'professor',
    school: 'AgroInova',
    isAdmin: true,
    xp: 1200,
  });

  const camila = await upsertUser({
    email: 'camila@escola.com',
    name: 'Prof. Camila',
    password: '123456',
    role: 'professor',
    school: 'Escola Patativa do Assaré',
    isAdmin: true,
    xp: 1200,
  });

  const iara = await upsertUser({
    email: 'iara@escola.com',
    name: 'Prof. Iara',
    password: '123456',
    role: 'professor',
    school: 'Escola Mondubim',
    isAdmin: true,
    xp: 980,
  });

  const joao = await upsertUser({
    email: 'joao@aluno.com',
    name: 'João Alves',
    password: '123456',
    role: 'aluno',
    school: 'Escola Patativa do Assaré',
    xp: 890,
    coletas: 48,
  });

  const ana = await upsertUser({
    email: 'ana@escola.com',
    name: 'Ana Lima',
    password: '123456',
    role: 'aluno',
    school: 'Escola Mondubim',
    xp: 650,
    coletas: 35,
  });

  const guilherme = await upsertUser({
    email: 'guilherme@aluno.com',
    name: 'Guilherme Costa',
    password: '123456',
    role: 'aluno',
    school: 'Escola Patativa do Assaré',
    xp: 580,
    coletas: 30,
  });

  const pedro = await upsertUser({
    email: 'pedro@comunidade.com',
    name: 'Pedro Souza',
    password: '123456',
    role: 'comunidade',
    school: 'Mondubim',
    xp: 0,
    coletas: 0,
  });

  console.log('✅ Users:', admin.email, camila.email, iara.email, joao.email, ana.email, guilherme.email, pedro.email);

  // ===== Gardens =====
  // Idempotência: usar nome+escola como chave lógica via findFirst+update/create
  async function upsertGarden(data: {
    name: string;
    type: string;
    status: string;
    school: string;
    territory: string;
    image: string;
    description: string;
    responsible: string;
  }) {
    const existing = await prisma.garden.findFirst({
      where: { name: data.name, school: data.school },
    });
    if (existing) {
      return prisma.garden.update({ where: { id: existing.id }, data });
    }
    return prisma.garden.create({ data });
  }

  const hortaPatativa = await upsertGarden({
    name: 'Horta da Escola Patativa',
    type: 'escolar',
    status: 'ativa',
    school: 'Escola Patativa do Assaré',
    territory: 'Grande Bom Jardim',
    image: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=800',
    description: 'Horta escolar pioneira no Grande Bom Jardim, com 28 registros de coletas e canteiros de hortaliças, plantas medicinais e PANCs.',
    responsible: camila.name,
  });

  const hortaMondubim = await upsertGarden({
    name: 'Horta do Mondubim',
    type: 'comunitaria',
    status: 'ativa',
    school: 'Escola Mondubim',
    territory: 'Mondubim',
    image: 'https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=800',
    description: 'Horta comunitária do Mondubim, com participação de alunos e moradores. Foco em segurança alimentar.',
    responsible: iara.name,
  });

  const hortaOrquideas = await upsertGarden({
    name: 'Horta Comunitária Orquídeas',
    type: 'comunitaria',
    status: 'implantacao',
    school: 'Comunidade Orquídeas',
    territory: 'Grande Bom Jardim',
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800',
    description: 'Horta em fase de implantação na comunidade Orquídeas, no GBJ.',
    responsible: pedro.name,
  });

  console.log('✅ Gardens:', hortaPatativa.name, hortaMondubim.name, hortaOrquideas.name);

  // ===== Posts (coletas + informativos) =====
  async function upsertPost(data: {
    title: string;
    type: string;
    description: string;
    authorId: string;
    image?: string;
    category?: string;
    location?: string;
    garden?: string;
    sciVerified?: boolean;
    sciPopularName?: string;
    sciScientificName?: string;
    sciFamily?: string;
  }) {
    const existing = await prisma.post.findFirst({
      where: { title: data.title, authorId: data.authorId },
    });
    if (existing) {
      return prisma.post.update({ where: { id: existing.id }, data });
    }
    return prisma.post.create({ data });
  }

  await upsertPost({
    title: 'Ora-pro-nóbis no quintal da Dona Maria',
    type: 'coleta',
    description: 'Encontramos uma bela amostra de Ora-pro-nóbis crescendo naturalmente no quintal da Dona Maria, no Bom Jardim. A planta está em excelente estado e já é usada na alimentação da família.',
    authorId: joao.id,
    image: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=800',
    category: 'ser-vivo',
    location: 'Bom Jardim, Fortaleza — CE',
    garden: hortaPatativa.name,
    sciVerified: true,
    sciPopularName: 'Ora-pro-nóbis',
    sciScientificName: 'Pereskia aculeata',
    sciFamily: 'Cactaceae',
  });

  await upsertPost({
    title: 'Mutirão de preparo do solo acontece nesta sexta!',
    type: 'informativo',
    description: 'Convidamos toda a comunidade para o mutirão de preparo do solo na Horta Patativa. Vamos plantar feijão, milho e abóbora juntos. Traga sua enxada e disposição!',
    authorId: camila.id,
    image: 'https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=800',
    garden: hortaPatativa.name,
  });

  await upsertPost({
    title: 'Planta no muro da escola',
    type: 'coleta',
    description: 'Identificamos uma planta crescendo entre as pedras do muro. Não sabemos o nome popular, esperando identificação científica.',
    authorId: joao.id,
    image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
    category: 'ser-vivo',
    location: 'Grande Bom Jardim',
    garden: hortaPatativa.name,
    sciVerified: false,
  });

  await upsertPost({
    title: 'Lagarta no tomateiro',
    type: 'coleta',
    description: 'Encontramos várias lagartas atacando os tomateiros do canteiro 3. Precisamos de ajuda para identificar e saber se é praga ou inseto benéfico.',
    authorId: ana.id,
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800',
    category: 'impacto-ambiental',
    location: 'Mondubim',
    garden: hortaMondubim.name,
    sciVerified: false,
  });

  await upsertPost({
    title: 'Guilherme conquista bolsa de R$ 15.000 para cultivo de cogumelos',
    type: 'informativo',
    description: 'Nosso aluno Guilherme Costa conquistou bolsa para projeto de cultivo de cogumelos comestíveis em escolas do GBJ. Parabéns!',
    authorId: iara.id,
    image: 'https://images.unsplash.com/photo-1565626424178-c699f6601021?w=800',
    garden: hortaPatativa.name,
  });

  await upsertPost({
    title: 'Fungo no tronco caído',
    type: 'coleta',
    description: 'Fungo identificado no tronco caído próximo ao canteiro principal. Coloração alaranjada, formato de orelha.',
    authorId: ana.id,
    image: 'https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=800',
    category: 'ser-vivo',
    location: 'Mondubim',
    garden: hortaMondubim.name,
    sciVerified: false,
  });

  console.log('✅ Posts inseridos/atualizados');

  // ===== Events =====
  async function upsertEvent(data: {
    title: string;
    date: string;
    time: string;
    location: string;
    type: string;
    category: string;
    description: string;
    organizerId: string;
    gardenId?: string;
  }) {
    const existing = await prisma.event.findFirst({
      where: { title: data.title, date: data.date },
    });
    if (existing) {
      return prisma.event.update({ where: { id: existing.id }, data });
    }
    return prisma.event.create({ data });
  }

  await upsertEvent({
    title: 'Mutirão de Semeadura',
    date: '2026-04-20',
    time: '14:00',
    location: 'Horta da Escola Patativa',
    type: 'interno',
    category: 'mutirao',
    description: 'Mutirão de semeadura coletiva na Horta Patativa. Vamos plantar feijão, milho e abóbora.',
    organizerId: camila.id,
    gardenId: hortaPatativa.id,
  });

  await upsertEvent({
    title: 'Oficina de Canva com as Bolsistas UFC',
    date: '2026-04-25',
    time: '09:00',
    location: 'Sala 5 — Escola Patativa',
    type: 'aberto',
    category: 'oficina',
    description: 'Oficina aberta à comunidade sobre como usar Canva para divulgação de iniciativas locais.',
    organizerId: iara.id,
    gardenId: hortaPatativa.id,
  });

  await upsertEvent({
    title: 'Semana de Educação Ambiental',
    date: '2026-05-15',
    time: '08:00',
    location: 'Praça do Mondubim',
    type: 'aberto',
    category: 'ambiental',
    description: 'Semana inteira de atividades sobre educação ambiental no Mondubim.',
    organizerId: iara.id,
    gardenId: hortaMondubim.id,
  });

  await upsertEvent({
    title: 'Roda de Conversa sobre PANCs',
    date: '2026-03-07',
    time: '16:00',
    location: 'Horta Mondubim',
    type: 'aberto',
    category: 'comunitario',
    description: 'Roda de conversa sobre Plantas Alimentícias Não Convencionais com participação de moradores.',
    organizerId: iara.id,
    gardenId: hortaMondubim.id,
  });

  console.log('✅ Events inseridos/atualizados');

  // ===== Event Suggestions =====
  async function upsertSuggestion(data: {
    title: string;
    category: string;
    suggestedDate?: string;
    description?: string;
    authorId: string;
  }) {
    const existing = await prisma.eventSuggestion.findFirst({
      where: { title: data.title, authorId: data.authorId },
    });
    if (existing) return existing;
    return prisma.eventSuggestion.create({ data });
  }

  await upsertSuggestion({
    title: 'Festival de culinária com as plantas da horta',
    category: 'comunitario',
    description: 'Podia ser uma festa onde a gente cozinha junto com o que plantamos.',
    authorId: ana.id,
  });

  await upsertSuggestion({
    title: 'Visita à Rede de Cozinhas Comunitárias',
    category: 'outros',
    suggestedDate: '2026-05-10',
    description: 'Visita guiada às cozinhas comunitárias do GBJ.',
    authorId: joao.id,
  });

  console.log('✅ Sugestões de eventos inseridas');

  console.log('🎉 Seed concluído!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
