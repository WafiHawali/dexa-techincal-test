import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required to seed accounts`);
  return value;
}

async function main(): Promise<void> {
  const accounts = [
    { email: required('SEED_HRD_EMAIL').trim().toLowerCase(), password: required('SEED_HRD_PASSWORD'), role: UserRole.HRD, employeeNumber: 'SEED-HRD', fullName: 'HRD Administrator' },
    { email: required('SEED_EMPLOYEE_EMAIL').trim().toLowerCase(), password: required('SEED_EMPLOYEE_PASSWORD'), role: UserRole.EMPLOYEE, employeeNumber: 'SEED-EMPLOYEE', fullName: 'Demo Employee' },
  ];
  if (accounts[0].email === accounts[1].email) throw new Error('Seed accounts must have different email addresses');
  for (const account of accounts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) throw new Error('Seed email must be valid');
    if (account.password.length < 12 || Buffer.byteLength(account.password, 'utf8') > 72) {
      throw new Error('Seed passwords must be at least 12 characters and at most 72 UTF-8 bytes');
    }
  }
  // Bootstrap-only ownership exception: one transaction provisions Employee and Auth data.
  // Re-runs reconcile the configured accounts without duplicating employees or users.
  for (const account of accounts) {
    const passwordHash = await hash(account.password, 12);
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.upsert({
        where: { employeeNumber: account.employeeNumber },
        update: { email: account.email },
        create: {
          employeeNumber: account.employeeNumber,
          fullName: account.fullName,
          email: account.email,
          department: account.role === UserRole.HRD ? 'Human Resources' : 'Engineering',
          position: account.role === UserRole.HRD ? 'HRD' : 'Employee',
        },
      });
      await tx.user.upsert({
        where: { employeeId: employee.id },
        update: { passwordHash, role: account.role },
        create: { employeeId: employee.id, passwordHash, role: account.role },
      });
    });
  }
  console.info('Seed accounts provisioned');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
