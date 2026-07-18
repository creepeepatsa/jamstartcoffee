import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma.js';

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@jamstartcoffee.com' },
    update: {},
    create: {
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@jamstartcoffee.com',
      password: hashedPassword,
      role: 'Admin',
      isActive: true,
    },
  });

  console.log('Seeded admin user:', admin.email);
}

main()
  .catch((error) => {
    console.error('Seed error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });