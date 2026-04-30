import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Criando usuário admin...');

  const passwordHash = await bcrypt.hash('Teste@123', 10);

  await prisma.user.upsert({
    where: { email: 'admin.teste@agroinova.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin.teste@agroinova.com',
      passwordHash,
      role: 'professor',
      school: 'AgroInova',
      isAdmin: true,
    },
  });

  console.log('✅ Admin criado: admin.teste@agroinova.com / Teste@123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
