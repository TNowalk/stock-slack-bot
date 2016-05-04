'use strict';

const Botkit = require('botkit');
const logger = require('./logger')();
const yahooFinance = require('yahoo-finance');
const moment = require('moment');

const STOCK_PATTERN = /\$[a-z]+/gi;
const SYMBOL_NEUTRAL = '#439FE0';
const SYMBOL_POSITIVE = 'good'; // '#36A64F';
const SYMBOL_NEGATIVE = 'danger'; // '#F24646';
const DEFAULT_FIELDS = ['o', 'g', 'h', 'l1', 'c1', 'p2', 'v', 'd1', 'e1', 'n', 'd2', 't1'];

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
  }

  /**
   * Populates a quick lookup table.
   *
   * @param {object} payload The rtm.start payload
   * @return {Bot} returns itself
   */
  populateLookup(payload) {
    ['users', 'channels', 'groups', 'mpims'].forEach((type) => {
      if (payload[type]) {
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

      logger.info(`Found the following symbols: ${symbols.join(', ')}`);

      // Grab snapshots for the stocks
      yahooFinance.snapshot({
        symbols,
        fields: DEFAULT_FIELDS,
      }, (err, snapshots) => {
        if (!err) {
          snapshots.forEach((snapshot) => {
            // Only include valid symbols
            if (snapshot.name !== null) {
              const low = snapshot.daysLow ? `$${snapshot.daysLow.format(2)}` : '';
              const high = snapshot.daysHigh ? `$${snapshot.daysHigh.format(2)}` : '';
              let range = '';
              let volume = '';

              if (snapshot.daysLow && snapshot.daysHigh) {
                range = `Days Range: ${low}- ${high}\n`;
              }

              if (snapshot.volume) {
                volume = `Volume: ${snapshot.volume.format()}`;
              }

              let change = 0;

              if (snapshot.change) {
                change = snapshot.change;
              }

              this.bot.reply(message, {
                attachments: [{
                  color: this.getSymbolColor(change),
                  text: `${this.getSymbolTrend(change)}` +
                    ` *${snapshot.name} (${this.getSymbolLink(snapshot.symbol)})*\n` +
                    `$${snapshot.lastTradePriceOnly.format(2)} ${change}` +
                    ` (${snapshot.changeInPercent * 100}%)` +
                    ` - ${moment(snapshot.lastTradeDate).format('MMM Do')},` +
                    ` ${snapshot.lastTradeTime}\n${range}${volume}`,
                  mrkdwn_in: ['text', 'pretext'],
                }],
              });
            }
          });
        }
      });
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

    const matches = message.text.match(/(quote|q|historical|h|analyze|a)/i);

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

  getSymbolLink(symbol) {
    return `<http://finance.yahoo.com/q?s=${symbol}|${symbol}>`;
  }

  getSymbolChart(symbol, duration) {
    return `http://chart.finance.yahoo.com/z?s=${symbol}&t=${duration}d&q=l&l=on&z=s&p=m50,m200,b,v`;
  }

  getSymbolColor(amt) {
    if (amt === 0) {
      return SYMBOL_NEUTRAL;
    } else if (amt > 0) {
      return SYMBOL_POSITIVE;
    }

    return SYMBOL_NEGATIVE;
  }

  getSymbolTrend(amt) {
    if (amt === 0) {
      return '';
    } else if (amt > 0) {
      return ':chart_with_upwards_trend:';
    }

    return ':chart_with_downwards_trend:';
  }

  getQuote(message) {
    const symbols = this.extractSymbols(message.text);

    if (!symbols.length) {
      this.bot.reply(message, 'Sorry, I could not find any symbols');
      return;
    }

    // Grab snapshots for the stocks
    yahooFinance.snapshot({
      symbols,
      fields: DEFAULT_FIELDS,
    }, (err, snapshots) => {
      if (!err) {
        let found = false;

        snapshots.forEach((snapshot) => {
          // Only include valid symbols
          if (snapshot.name !== null) {
            found = true;

            const low = snapshot.daysLow ? `$${snapshot.daysLow.format(2)}` : '';
            const high = snapshot.daysHigh ? `$${snapshot.daysHigh.format(2)}` : '';
            let range = '';
            let volume = '';

            if (snapshot.daysLow && snapshot.daysHigh) {
              range = `Days Range: ${low}- ${high}\n`;
            }

            if (snapshot.volume) {
              volume = `Volume: ${snapshot.volume.format()}`;
            }

            let change = 0;

            if (snapshot.change) {
              change = snapshot.change;
            }

            this.bot.reply(message, {
              attachments: [{
                color: this.getSymbolColor(change),
                text: `${this.getSymbolTrend(change)}` +
                  ` *${snapshot.name} (${this.getSymbolLink(snapshot.symbol)})*\n` +
                  `$${snapshot.lastTradePriceOnly.format(2)} ${change}` +
                  ` (${snapshot.changeInPercent * 100}%)` +
                  ` - ${moment(snapshot.lastTradeDate).format('MMM Do')},` +
                  ` ${snapshot.lastTradeTime}\n${range}${volume}`,
                mrkdwn_in: ['text', 'pretext'],
                image_url: this.getSymbolChart(snapshot.symbol, 1),
              }],
            });
          }
        });

        if (!found) {
          this.bot.reply(message, 'Sorry, I could not find any valid symbols');
        }
      }
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

    yahooFinance.historical({
      symbols,
      from: dates.from,
      to: dates.to,
    }, (err, snapshots) => {
      if (!err) {
        let found = false;

        symbols.forEach((symbol) => {
          if (snapshots[symbol] !== undefined) {
            const snapshot = snapshots[symbol];

            let output = '';

            const maxDateLength = 10;

            let maxSymbolLength = 6;
            let maxOpenLength = 4;
            let maxCloseLength = 5;
            let maxHighLength = 4;
            let maxLowLength = 3;
            let maxVolumeLength = 6;
            let maxAdjustedLength = 9;

            snapshot.forEach((row) => {
              if (row.symbol.length > maxSymbolLength) {
                maxSymbolLength = row.symbol.length;
              }

              if (row.open.format(2).length > maxOpenLength) {
                maxOpenLength = row.open.format(2).length;
              }

              if (row.close.format(2).length > maxCloseLength) {
                maxCloseLength = row.close.format(2).length;
              }

              if (row.high.format(2).length > maxHighLength) {
                maxHighLength = row.high.format(2).length;
              }

              if (row.low.format(2).length > maxLowLength) {
                maxLowLength = row.low.format(2).length;
              }

              if (row.volume.format().length > maxVolumeLength) {
                maxVolumeLength = row.volume.format().length;
              }

              if (row.adjClose.format(2).length > maxAdjustedLength) {
                maxAdjustedLength = row.adjClose.format(2).length;
              }
            });

            output += `${'Symbol'.rpad(' ', maxSymbolLength + 5)}` +
              `${'Date'.rpad(' ', maxDateLength + 5)}` +
              `${'Open'.rpad(' ', maxOpenLength + 5)}` +
              `${'Close'.rpad(' ', maxCloseLength + 5)}` +
              `${'High'.rpad(' ', maxHighLength + 5)}` +
              `${'Low'.rpad(' ', maxLowLength + 5)}` +
              `${'Volume'.rpad(' ', maxVolumeLength + 5)}` +
              `${'Adj Close'.rpad(' ', maxAdjustedLength + 5)}\n`;

            snapshot.forEach((row) => {
              output += `${row.symbol.rpad(' ', maxSymbolLength + 5)}` +
                `${moment(row.date).format('YYYY-MM-DD').rpad(' ', maxDateLength + 5)}` +
                `$${row.open.format(2).rpad(' ', maxOpenLength + 4)}` +
                `$${row.close.format(2).rpad(' ', maxCloseLength + 4)}` +
                `$${row.high.format(2).rpad(' ', maxHighLength + 4)}` +
                `$${row.low.format(2).rpad(' ', maxLowLength + 4)}` +
                `${row.volume.format(0).rpad(' ', maxVolumeLength + 5)}` +
                `$${row.adjClose.format(2).rpad(' ', maxAdjustedLength + 4)}\n`;
            });

            // Only include valid symbols
            found = true;
            this.bot.reply(message, {
              attachments: [{
                color: SYMBOL_NEUTRAL,
                text: `\`\`\`\n${output}\`\`\``,
                mrkdwn_in: ['text', 'pretext'],
                image_url: this.getSymbolChart(symbol, snapshot.length),
              }],
            });
          }
        });

        if (!found) {
          this.bot.reply(message, 'Sorry, I could not find any valid symbols');
        }
      }
    });
  }

  getAnalysis(message) {
    const symbols = this.extractSymbols(message.text);

    if (!symbols.length) {
      this.bot.reply(message, 'Sorry, I could not find any symbols');
      return;
    }

    // Grab snapshots for the stocks
    yahooFinance.snapshot({
      symbols,
    }, (err, snapshots) => {
      if (!err) {
        let found = false;

        snapshots.forEach((snapshot) => {
          // Only include valid symbols
          if (snapshot.name !== null) {
            found = true;
          }

          let change = 0;
          let closeDiff = 0;
          let volumeDiff = 0;

          if (snapshot.change) {
            change = snapshot.change;
          }

          if (snapshot.previousClose && snapshot.open) {
            closeDiff = (snapshot.open - snapshot.previousClose).format(2);
          }

          if (snapshot.volume && snapshot.averageDailyVolume) {
            volumeDiff = snapshot.averageDailyVolume - snapshot.volume;
            volumeDiff /= snapshot.averageDailyVolume;
            volumeDiff *= -100;
          }

          let output = `*${snapshot.name} (${this.getSymbolLink(snapshot.symbol)})*\n\n`;

          output += '*Price &amp; Volume*\n\n' +
            'Price\n' +
            `    $${snapshot.lastTradePriceOnly.format(2)} ${change} ` +
                `(${(snapshot.changeInPercent * 100).format(2)}%)\n` +
            `    ${closeDiff} - flat from yesterday's close\n` +
            `    Today: L: $${snapshot.daysLow.format(2)}  ` +
                `O: $${snapshot.open.format(2)}  ` +
                `H: $${snapshot.daysHigh.format(2)}\n` +
            '        Typical Price Range: 3.84 to 4.46 : ± 0.31 pts, ± 7.5%\n' +
            '        Extreme price range (85% of time) 3.54 to 4.76 : ± 0.61 pts, ± 15%\n\n' +
            'Volume\n' +
            `    ${snapshot.volume.format()} shares, ${volumeDiff.format(2)}% compared ` +
                'to typical daily volume\n' +
            `    Typical daily volume is ${snapshot.averageDailyVolume.format()} shares\n\n` +
            'Rallies/Pullbacks\n' +
            '    Typical: 1.86 pts (45.7%) occurs 25% of the time\n' +
            '    Extreme: 2.42 pts (59.5%) occurs 5% of the time\n';

          // Only include valid symbols
          found = true;
          this.bot.reply(message, {
            attachments: [{
              color: SYMBOL_NEUTRAL,
              text: output,
              mrkdwn_in: ['text', 'pretext'],
              // image_url: this.getSymbolChart(symbol, snapshot.length),
            }],
          });
        });

        if (!found) {
          this.bot.reply(message, 'Sorry, I could not find any valid symbols');
        }
      }
    });

    // const to = moment().format('YYYY-MM-DD');
    // const from = moment().subtract('365', 'days').format('YYYY-MM-DD');

    // yahooFinance.historical({
    //   symbols,
    //   from,
    //   to,
    // }, (err, snapshots) => {
    //   logger.info(snapshots);
    // });
  }
}

module.exports = Bot;
