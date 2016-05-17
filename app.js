'use strict';

const redact = require('redact-object');
const express = require('express');
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

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(config.port);
