import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Role } from '@uai/shared';
import * as bcrypt from 'bcrypt';
import { createDataSourceOptionsFromEnv } from './app/database/typeorm.options';
import { UserEntity } from './app/users/user.entity';

async function main() {
  const dataSource = new DataSource(createDataSourceOptionsFromEnv());
  await dataSource.initialize();
  await dataSource.runMigrations();

  const usersRepo = dataSource.getRepository(UserEntity);

  const adminDni = process.env.SEED_ADMIN_DNI ?? '00000000';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const adminFullName = process.env.SEED_ADMIN_FULLNAME ?? 'Administrador UAI';

  let admin = await usersRepo.findOne({ where: { dni: adminDni } });
  if (!admin) {
    admin = usersRepo.create({
      dni: adminDni,
      fullName: adminFullName,
      role: Role.ADMIN,
      codigoAlumno: null,
      passwordHash: await bcrypt.hash(adminPassword, 10),
    });
    await usersRepo.save(admin);
  }

  await dataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
