 npx prisma db push --force-reset --skip-generate
docker exec cecaw_backend npx ts-node prisma/seed.ts