'use strict';

const redact = require('redact-object');
const express = require('express');
const fs = require('fs');
const marked = require('marked');
const logger = require('./lib/logger')();
const Config = require('./lib/config');
const Bot = require('./lib/bot');

require('./lib/utils');

let config;

/**
 * Load config
 */
const rawConfig = (() => {
  let retVal;
  try {
    retVal = require('./config');
  } catch (exception) {
    retVal = require('./config.default');
  }

  return retVal;
})();

try {
  config = Config.parse(rawConfig);
} catch (error) {
  logger.error('Could not parse config', error);
  process.exit(1);
}

logger.info('Using the following configuration:', redact(config, ['token', 'pass']));

const bot = new Bot(config);
bot.start();

const app = express();

app.use('/assets', express.static(`${__dirname}/assets`));

app.get('/', (req, res) => {
  fs.readFile('./README.md', 'utf8', (err, data) => {
    const html = `
      <!doctype html>
        <html>
          <head>
            <meta charset="utf-8"/>
            <titleSlackbots</title>
            <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.2/css/bootstrap.min.css">
            <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.2/css/bootstrap-theme.min.css">
          </head>
          <body>
            <div class="container">
              ${marked(data)}
            </div>
          </body>
        </html>`;
    res.status(200).send(html);
  });
});

app.listen(config.port);
