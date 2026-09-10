const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const c = await p.compte.findUnique({
    where: { numero: 'CC-2026-00001' },
    include: { _count: { select: { transactions: true } } },
  });
  if (!c) { console.log('compte de test absent'); return; }
  console.log(`trouve id=${c.id} numero=${c.numero} transactions=${c._count.transactions} solde=${c.solde}`);
  if (c._count.transactions > 0) { console.log('NON SUPPRIME : il porte des transactions'); return; }
  await p.compte.delete({ where: { id: c.id } });
  console.log('supprime');
  console.log('comptes restants :', await p.compte.count());
})().finally(() => p.$disconnect());
