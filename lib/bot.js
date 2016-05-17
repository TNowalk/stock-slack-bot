'use strict';

const Botkit = require('botkit');
const logger = require('./logger')();
const moment = require('moment');

const STOCK_PATTERN = /\$[a-z]+/gi;

// Require Commands
const Snapshot = require('./commands/snapshot');
const Quote = require('./commands/quote');
const Historical = require('./commands/historical');
const Analysis = require('./commands/analysis');
const Variance = require('./commands/variance');

/**
 * @module Bot
 */
class Bot {
  /**
   * Constructor.
   *
   * @constructor
   * @param {object} config The final configuration for the bot
   */
  constructor(config) {
    this.config = config;

    this.lookup = new Map();

    this.controller = Botkit.slackbot();

    this.snapshotLookups = new Map();
  }

  /**
   * Populates a quick lookup table.
   *
   * @param {object} payload The rtm.start payload
   * @return {Bot} returns itself
   */
  populateLookup(payload) {
    ['users', 'channels', 'groups', 'mpims'].forEach((type) => {
      if (payload && payload[type]) {
        payload[type].forEach((item) => {
          this.lookup.set(item.id, item);
        });
      }
    });
  }

  /**
   * Function to be called on slack open
   *
   * @param {object} payload Connection payload
   * @return {Bot} returns itself
   */
  slackOpen(payload) {
    const channels = [];
    const groups = [];
    const mpims = [];

    logger.info(`Welcome to Slack. You are @${payload.self.name} of ${payload.team.name}`);

    if (payload.channels) {
      payload.channels.forEach((channel) => {
        if (channel.is_member) {
          channels.push(`#${channel.name}`);
        }
      });

      logger.info(`You are in: ${channels.join(', ')}`);
    }

    if (payload.groups) {
      payload.groups.forEach((group) => {
        groups.push(`${group.name}`);
      });

      logger.info(`Groups: ${groups.join(', ')}`);
    }

    if (payload.mpims) {
      payload.mpims.forEach((mpim) => {
        mpims.push(`${mpim.name}`);
      });

      logger.info(`Multi-person IMs: ${mpims.join(', ')}`);
    }

    return this;
  }

  /**
   * Handle an incoming message
   * @param {object} message The incoming message from Slack
   * @return {Bot} returns itself
   */
  handleMessage(message) {
    logger.info('Message', message);

    if (message.type === 'message'
      && !this.getCommand(message)
      && this.containsSymbol(message.text)
    ) {
      const symbols = this.extractSymbols(message.text);

      // Loop through the symbols and remove any that have
      // been looked up in the last 5 minutes
      for (let i = symbols.length - 1; i >= 0; i--) {
        if (this.snapshotLookups.has(symbols[i])) {
          const pastLookup = this.snapshotLookups.get(symbols[i]);
          if (pastLookup.time < moment().subtract(5, 'minutes').format('X')) {
            // Wasn't looked up recently, reset the time and increment the count
            this.snapshotLookups.set(symbols[i], {
              symbol: symbols[i],
              time: moment().format('X'),
              count: pastLookup.count + 1,
            });
          } else {
            // Was a recent lookup, remove it from the list of symbols
            symbols.splice(i, 1);
          }
        } else {
          this.snapshotLookups.set(symbols[i], {
            symbol: symbols[i],
            time: moment().format('X'),
            count: 1,
          });
        }
      }

      // Only act if there were some symbols found
      if (symbols.length) {
        logger.info(`Found the following symbols: ${symbols.join(', ')}`);

        Snapshot.run(symbols).then((res) => {
          res.forEach((response) => {
            this.bot.reply(message, response);
          });
        }, (err) => {
          this.bot.reply(message, err);
        });
      }
    } else if (this.getCommand(message)) {
      // No stocks found, let's  see if it's a command
      // http://chart.finance.yahoo.com/z?s=cldx&t=1d&q=l&l=on&z=s

      // http://blog.hao909.com/how-to-add-stock-chart-and-quote-from-yahoo/
      // http://chart.finance.yahoo.com/c/3m/ibm#sthash.LcycZFal.dpuf

      switch (this.getCommand(message)) {
        case 'quote':
        case 'q':
          logger.info('Detected Quote Command');
          this.getQuote(message);
          break;
        case 'historical':
        case 'h':
          logger.info('Detected Historical Command');
          this.getHistorical(message);
          break;
        case 'analyze':
        case 'a':
          logger.info('Detected Analyze Command');
          this.getAnalysis(message);
          break;
        case 'variance':
        case 'v':
          logger.info('Detected Variance Command');
          this.getVariance(message);
          break;
        default:
          this.bot.reply(message, `Unknown command (${this.getCommand(message)})`);
          break;
      }
    }

    return this;
  }

  /**
   * Start the bot
   *
   * @return {Bot} returns itself
   */
  start() {
    this.controller.on(
      'direct_mention,mention,ambient,direct_message,reaction_added,reaction_removed',
      (bot, message) => {
        this.handleMessage(message);
      }
    );

    this.controller.on('team_join,user_change,group_joined,channel_joined', (bot, message) => {
      if (message.user && message.user.id) {
        logger.info(`Saw new user: ${message.user.name}`);
        this.lookup.set(message.user.id, message.user);
      } else if (message.channel && message.channel.id) {
        logger.info(`Saw new channel: ${message.channel.name}`);
        this.lookup.set(message.channel.id, message.channel);
      }
    });

    this.controller.on('rtm_close', () => {
      logger.info('The RTM api just closed');

      if (this.config.slack.autoReconnect) {
        this.connect();
      }
    });

    this.connect();

    return this;
  }

  /**
   * Connect to the RTM
   * @return {Bot} this
   */
  connect() {
    this.bot = this.controller.spawn({
      token: this.config.slack.token,
      retry: this.config.slack.autoReconnect ? Infinity : 0,
    }).startRTM((err, bot, payload) => {
      if (err) {
        logger.error('Error starting bot!', err);
        return;
      }

      this.payload = payload;
      this.populateLookup(payload);
      this.slackOpen(payload);
    });

    return this;
  }

  getCommand(message) {
    if (['direct_mention', 'direct_message'].indexOf(message.event) === -1) {
      return null;
    }

    const matches = message.text.match(/^\b(quote|q|historical|h|analyze|a|variance|v)\b/i);

    return matches ? matches[0] : null;
  }

  containsSymbol(message) {
    return message.search(STOCK_PATTERN) !== -1;
  }

  extractSymbols(message) {
    // Find the symbols
    const matches = message.match(STOCK_PATTERN);

    if (!matches) {
      return [];
    }

    // Normalize by uppercasing the symbols and remove $
    return matches.map((m) => m.toUpperCase().replace(/\$/, ''));
  }

  extractDates(message) {
    let to = moment();
    let from = moment().subtract('5', 'days');

    // Try to find things like 30d or 1m
    let matches = message.match(/[0-9]+(d)/i);

    if (matches) {
      const count = matches[0].replace(/\D/g, '');

      from = moment().subtract(count, 'days');
    }

    // Try to find things like 30 days or 1 month
    matches = message.match(/[0-9]+ (day)/i);

    if (matches) {
      // Strip out the day(s)
      const count = matches[0].replace(/\D/g, '');

      from = moment().subtract(count, 'days');
    }

    // What an ugly regex
    matches = message.match(/\d{4}-\d{1,2}-\d{1,2}/g);

    if (matches) {
      if (matches.length === 1) {
        from = moment(matches[0]);
      } else if (matches.length === 2) {
        to = moment(matches[1]);
        from = moment(matches[0]);
      }
    }

    return {
      to: to.format('YYYY-MM-DD'),
      from: from.format('YYYY-MM-DD'),
      days: Math.abs(to.diff(from, 'days')),
    };
  }

  getQuote(message) {
    const symbols = this.extractSymbols(message.text);

    if (!symbols.length) {
      this.bot.reply(message, 'Sorry, I could not find any symbols');
      return;
    }

    Quote.run(symbols).then((res) => {
      res.forEach((response) => {
        this.bot.reply(message, response);
      });
    }, (err) => {
      this.bot.reply(message, err);
    });
  }

  getHistorical(message) {
    const symbols = this.extractSymbols(message.text);

    if (!symbols.length) {
      this.bot.reply(message, 'Sorry, I could not find any symbols');
      return;
    }

    // Find dates in message
    const dates = this.extractDates(message.text);

    Historical.run(symbols, dates).then((res) => {
      this.bot.reply(message, res);
    }, (err) => {
      this.bot.reply(message, err);
    });
  }

  getAnalysis(message) {
    const symbols = this.extractSymbols(message.text);

    if (!symbols.length) {
      this.bot.reply(message, 'Sorry, I could not find any symbols');
      return;
    }

    Analysis.run(symbols).then((res) => {
      res.forEach((response) => {
        this.bot.reply(message, response);
      });
    }, (err) => {
      this.bot.reply(message, err);
    });
  }

  getVariance(message) {
    const symbols = this.extractSymbols(message.text);

    if (!symbols.length) {
      this.bot.reply(message, 'Sorry, I could not find any symbols');
      return;
    }

    // Find dates in message
    const dates = this.extractDates(message.text);

    Variance.run(symbols, dates).then((res) => {
      this.bot.reply(message, res);
    }, (err) => {
      this.bot.reply(message, err);
    });
  }
}

module.exports = Bot;
