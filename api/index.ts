import { NestFactory } from '@nestjs/core';
import {
  NestExpressApplication,
  ExpressAdapter,
} from '@nestjs/platform-express';
import express, { Express, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from '../src/app.module';

const server: Express = express();
let cachedApp: Express | null = null;

async function bootstrapServer(): Promise<Express> {
  if (!cachedApp) {
    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
    );
    app.useStaticAssets(join(__dirname, '..', 'public'));
    app.setBaseViewsDir(join(__dirname, '..', 'views'));
    app.setViewEngine('ejs');
    app.enableCors({
      origin: ['http://localhost:3000', 'https://juju-blue-nextjs.vercel.app'],
      credentials: true,
    });
    await app.init();
    cachedApp = server;
  }
  return cachedApp;
}

export default async (req: Request, res: Response): Promise<void> => {
  const app = await bootstrapServer();
  app(req, res);
};
