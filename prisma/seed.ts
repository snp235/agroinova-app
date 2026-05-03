import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Lista de e-mails demo criados em uma versão anterior do seed e que devem
// ser removidos (junto com seus posts/eventos/sugestões) para que apenas
// dados reais permaneçam em produção.
const DEMO_EMAILS = [
  'camila@escola.com',
  'iara@escola.com',
  'joao@aluno.com',
  'ana@escola.com',
  'guilherme@aluno.com',
  'pedro@comunidade.com',
];

const DEMO_GARDEN_NAMES = [
  'Horta da Escola Patativa',
  'Horta do Mondubim',
  'Horta Comunitária Orquídeas',
];

async function cleanupLegacyDemoData() {
  const demoUsers = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { id: true, email: true },
  });

  if (demoUsers.length === 0) return;

  const demoUserIds = demoUsers.map(u => u.id);
  console.log(`🧹 Removendo ${demoUsers.length} usuário(s) demo legados...`);

  // Posts (e likes/saves cascateiam pelo onDelete: Cascade)
  await prisma.post.deleteMany({ where: { authorId: { in: demoUserIds } } });
  // Sugestões de evento
  await prisma.eventSuggestion.deleteMany({ where: { authorId: { in: demoUserIds } } });
  // Eventos organizados por demo users
  await prisma.event.deleteMany({ where: { organizerId: { in: demoUserIds } } });
  // Por fim, os usuários
  await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });

  // Hortas demo (zero registros, criadas pelo seed antigo)
  const demoGardens = await prisma.garden.findMany({
    where: { name: { in: DEMO_GARDEN_NAMES } },
    select: { id: true },
  });
  if (demoGardens.length > 0) {
    console.log(`🧹 Removendo ${demoGardens.length} horta(s) demo legada(s)...`);
    await prisma.garden.deleteMany({ where: { id: { in: demoGardens.map(g => g.id) } } });
  }
}

async function main() {
  console.log('🌱 Garantindo usuário admin...');

  const passwordHash = await bcrypt.hash('Teste@123', 10);

  await prisma.user.upsert({
    where: { email: 'admin.teste@agroinova.com' },
    update: { isAdmin: true, role: 'professor' },
    create: {
      name: 'Admin',
      email: 'admin.teste@agroinova.com',
      passwordHash,
      role: 'professor',
      school: 'AgroInova',
      isAdmin: true,
    },
  });

  await cleanupLegacyDemoData();

  console.log('✅ Admin pronto: admin.teste@agroinova.com / Teste@123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
