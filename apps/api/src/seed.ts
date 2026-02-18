import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createDataSourceOptionsFromEnv } from './app/database/typeorm.options';

async function main() {
  const dataSource = new DataSource(createDataSourceOptionsFromEnv());
  await dataSource.initialize();
  await dataSource.runMigrations();

  await dataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
