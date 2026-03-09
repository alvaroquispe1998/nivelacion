import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/api/src/app/app.module';
import { WorkshopsService } from './apps/api/src/app/workshops/workshops.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const service = app.get(WorkshopsService);
    try {
        const res = await service.regenerateGroups('8f1a1c72-e64d-4e3b-9c4e-aa4822e73c17');
        console.log('Success!', res);
    } catch (e) {
        console.error('Error in regenerateGroups:', e);
    }
    await app.close();
}
bootstrap();
