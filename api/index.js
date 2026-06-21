const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require('express');
const { join } = require('path');
const { AppModule } = require('../dist/app.module');

const server = express();
let cachedApp;

async function bootstrapServer() {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
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

module.exports = async (req, res) => {
  const app = await bootstrapServer();
  app(req, res);
};