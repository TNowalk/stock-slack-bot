'use strict';

const Botkit = require('botkit');
const logger = require('./logger')();
const moment = require('moment');
const fs = require('fs');

const STOCK_PATTERN = /\$[a-z]+/gi;

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

    this.commands = new Map();

    const commands = fs.readdirSync(`${__dirname}/commands`);

    for (const commandFile of commands) {
      try {
        if (commandFile !== 'command.js') {
          const command = require(`${__dirname}/commands/${commandFile}`);
          if (command.name && command.triggers) {
            this.commands.set(command.name.toLowerCase(), command);
            logger.info(`Loaded ${command.name} from /commands/${commandFile}`);
          } else {
            throw new Error('Unexpected object format');
          }
        }
      } catch (error) {
        logger.error(`Unable to load: ${commandFile}`, error);
      }
    }

    // The snapshot command must be present
    if (!this.commands.get('snapshot')) {
      throw new Error('Could not find Snapshot command');
    }
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

    if (!message.text) {
      return this;
    }

    const foundCommand = this.getCommand(message);

    if (/^help$/i.test(message.text)) {
      // Looking for bot help

      const commandList = [];

      this.commands.forEach((command) => {
        if (command.aliases.length) {
          commandList.push(
            `    *${command.name}*: Triggers ` +
            `[${command.aliases.join(', ')}] ` +
            `Usage \`@${this.payload.self.name} ${command.aliases[0]} $AAPL\``
          );
        }
      });

      this.bot.reply(message,
          'The stock bot answers to a number of commands.\n' +
          `To run a command, type @${this.payload.self.name} <command> <symbol>\n` +
          `    _Example: @${this.payload.self.name} quote $AAPL_\n` +
          `To get help for a command, type @${this.payload.self.name} help <command>\n` +
          `Available Commands\n${commandList.join('\n')}`
      );
    } else if (/^help/i.test(message.text)) {
      // Looking for help for a specific command, find which command
      let runCommand = false;

      this.commands.forEach((command) => {
        if (!runCommand && command.aliases.indexOf(foundCommand) !== -1) {
          runCommand = true;
          if (command.help) {
            try {
              command.help(this.payload.self).then((res) => {
                if (!Array.isArray(res)) {
                  this.bot.reply(message, res);
                } else {
                  res.forEach((response) => {
                    this.bot.reply(message, response);
                  });
                }
              }, (err) => {
                this.bot.reply(message, err);
              });
            } catch (error) {
              logger.error(`Unable to run: ${command.name}`, error);
            }
          } else {
            this.bot.reply(message, `No help found for ${foundCommand} command`);
          }
        }
      });

      if (!runCommand) {
        // Couldn't find a matching command
        this.bot.reply(message, `Could not find a matching command for _${foundCommand}_`);
      }
    } else if (message.type === 'message'
      && !foundCommand
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

        this.commands.get('snapshot').run(message).then((res) => {
          res.forEach((response) => {
            this.bot.reply(message, response);
          });
        }, (err) => {
          this.bot.reply(message, err);
        });
      }
    } else if (foundCommand) {
      let runCommand = false;
      // No stocks found, let's  see if it's a command
      this.commands.forEach((command) => {
        if (!runCommand && command.aliases.indexOf(foundCommand) !== -1) {
          try {
            command.run(message).then((res) => {
              if (!Array.isArray(res)) {
                this.bot.reply(message, res);
              } else {
                res.forEach((response) => {
                  this.bot.reply(message, response);
                });
              }
            }, (err) => {
              this.bot.reply(message, err);
            });
            runCommand = true;
          } catch (error) {
            logger.error(`Unable to run: ${command.name}`, error);
          }
        }
      });
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

    let text = message.text;

    // Check if looking for help
    if (/^help/i.test(message.text)) {
      // Remove the help so the command can be matched
      text = message.text.replace('help', '').trim();
    }

    let matches = null;

    this.commands.forEach((command) => {
      if (!matches) {
        matches = text.match(command.triggers);
      }
    });

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
}

module.exports = Bot;
