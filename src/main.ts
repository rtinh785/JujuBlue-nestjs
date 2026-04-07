import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Nest ơi, nếu trình duyệt xin file CSS, ảnh, JS... thì tìm trong thư mục public
  app.useStaticAssets(join(__dirname, '..', 'public'));
  // Nest ơi, nếu cần render trang .ejs thì tìm trong thư mục views
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');
  app.enableCors({
    origin: ['http://localhost:3000'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
