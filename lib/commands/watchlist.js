'use strict';

const Command = require('./command');
const moment = require('moment');

class Watchlist extends Command {
  constructor(lookup, bot, storage) {
    super(lookup, bot, storage);

    const self = this;

    this.name = 'Watchlist';
    this.triggers = /^\b(watchlist|wl|w)\b/i;
    this.aliases = ['watchlist', 'wl', 'w'];

    // Poor man cron to run alert script every 5 minutes
    this.interval = setInterval(() => {
      // Have to use self in here so update will have access to the correct context
      self.update();
    }, 300000);

    this.notifications = {};
  }

  help(bot) {
    return new Promise((resolve) => {
      resolve(
        'Provides a way to keep a list of symbols to monitor.  Symbols can ' +
        'be added or removed symbols.\n' +
        `Triggers: [${this.aliases.join(', ')}]\n` +
        'Example commands:\n' +
        `\`@${bot.name} ${this.aliases[0]}\`\n` +
        `\`@${bot.name} ${this.aliases[0]} add $AAPL\`\n` +
        `\`@${bot.name} ${this.aliases[0]} remove $AAPL\`\n`
      );
    });
  }

  run(message) {
    return new Promise((resolve, reject) => {
      const symbols = this.extractSymbols(message.text);

      let action = 'list';

      if (/\b(add|create|start)\b/i.test(message.text)) {
        action = 'add';
      } else if (/\b(remove|delete|stop)\b/i.test(message.text)) {
        action = 'remove';
      }

      // Load the user's watchlist
      this.storage.getPortfolio(message.user).then((portfolio) => {
        if (action === 'list') {
          const links = [];
          Object.keys(portfolio).forEach((symbol) => {
            links.push(this.getSymbolLink(symbol));
          });
          const saluations = `Hello ${this.lookup.get(message.user).profile.first_name}`;
          let text = `${saluations}, you're not currently watching any symbols`;
          if (links.length) {
            text = `${saluations}, you're currently watching: ${links.sort().join(', ')}`;
          }
          resolve({
            text,
            attachments: {},
          });
        } else if (action === 'remove') {
          this.storage.removeSymbols(message.user, symbols).then((updated) => {
            const links = [];
            Object.keys(updated).forEach((symbol) => {
              links.push(this.getSymbolLink(symbol));
            });
            let text = 'you\'re currently not watching any symbols';
            if (links.length) {
              text = `you're currently watching: ${links.sort().join(', ')}`;
            }
            // resolve({
            //   attachments: [{
            //     fallback: 'Symbols removed from watchlist',
            //     text,
            //   }],
            // });

            this.sendDirectMessage(message.user, {
              text: `Symbols removed, ${text}`,
              attachments: {},
            });

            resolve();
          });
        } else if (action === 'add') {
          // Check that the symbols exist
          this.yahoo.snapshot({
            symbols,
            fields: ['o'],
          }, (err, snapshots) => {
            if (!err) {
              let found = false;
              const validSymbols = [];

              snapshots.forEach((snapshot) => {
                // Only include valid symbols
                if (snapshot.symbol !== null) {
                  found = true;
                  validSymbols.push(snapshot.symbol);
                }
              });

              if (!found) {
                reject('Sorry, I could not find any valid symbols');
              } else {
                this.storage.addSymbols(message.user, validSymbols).then((updated) => {
                  const links = [];
                  Object.keys(updated).forEach((symbol) => {
                    links.push(this.getSymbolLink(symbol));
                  });

                  this.sendDirectMessage(message.user, {
                    text: `Symbols added, currently watching: ${links.sort().join(', ')}`,
                    attachments: {},
                  });

                  resolve();
                });
              }
            }
          });
        } else {
          reject('Sorry, I could not figure out what you are trying to do');
        }
      });
    });
  }

  update() {
    this.logger.info('Running Update for Watchlist');

    // Load all the portfolios
    this.storage.getAll().then((portfolios) => {
      const symbols = [];

      for (const idx of Object.keys(portfolios)) {
        // Add users symbols
        symbols.push(...Object.keys(portfolios[idx]));
      }

      // Only want to know unique symbols
      const uniqueSymbols = symbols.filter((v, i, s) => s.indexOf(v) === i);

      // Look up the latest snapshot for the symbols
      if (uniqueSymbols.length) {
        this.yahoo.snapshot({
          symbols: uniqueSymbols,
          fields: this.DEFAULT_FIELDS,
        }, (err, snapshots) => {
          if (!err) {
            const alertSymbols = new Map();

            // Loop through the snapshots
            snapshots.forEach((snapshot) => {
              if (snapshot.changeInPercent > 0.05 || snapshot.changeInPercent < -0.05) {
                // Gain/Loss greater than 5%, add this to alert queue
                alertSymbols.set(snapshot.symbol, snapshot);
              }
            });

            // Loop through the alert symbols
            for (const [symbol, snapshot] of alertSymbols) {
              const price = snapshot.lastTradePriceOnly;
              const change = snapshot.changeInPercent * 100;
              const direction = change > 5 ? 'up' : 'down';

              // Loop through the portfolios and find the users who have
              // this symbol in their portfolio
              for (const userId of Object.keys(portfolios)) {
                if (portfolios[userId].hasOwnProperty(symbol)) {
                  // Check if we have notified this user for this alert
                  if (portfolios[userId][symbol].alerts.price[direction] !== null) {
                    // Check if the notification was sent today
                    const lastAlert = moment(portfolios[userId][symbol].alerts.price[direction]);

                    if (lastAlert.format('YYYY-MM-DD') !== moment().format('YYYY-MM-DD')) {
                      this.sendPriceAlert(userId, symbol, price, change, direction);
                    }
                  } else {
                    // No notifications sent, send DM to user
                    this.sendPriceAlert(userId, symbol, price, change, direction);
                  }
                }
              }
            }
          } else {
            this.logger.error(err);
          }
        });
      }
    });
  }

  sendPriceAlert(user, symbol, price, change, direction) {
    const text = `Hey ${this.lookup.get(user).profile.first_name}, just wanted ` +
      `to let you know that ${this.getSymbolLink(symbol)} is ${direction} ` +
      `${change.format(2)}% to $${price.format(2)} today.`;
    const response = {
      text,
      attachments: {},
    };

    this.sendDirectMessage(user, response).then(() => {
      // Update user's portfolio with alert
      const portfolio = this.storage.getPortfolioSync(user);

      // Reset the both directions.  For example, if this loses 5% user
      // will get an alarm, if it then gains 5% user will get another alarm.
      // If the stock dips back to a loss of 5% user should get another alarm.
      portfolio[symbol].alerts.price.down = null;
      portfolio[symbol].alerts.price.up = null;

      portfolio[symbol].alerts.price[direction] = moment();

      this.storage.setPortfolioSync(user, portfolio);
    });

    // this.bot.startPrivateConversation({
    //   user,
    // }, (dmErr, convo) => {
    //   if (!dmErr) {
    //     convo.say(response);
    //     // Update user's portfolio with alert
    //     const portfolio = this.storage.getPortfolioSync(user);
    //
    //     // Reset the both directions.  For example, if this loses 5% user
    //     // will get an alarm, if it then gains 5% user will get another alarm.
    //     // If the stock dips back to a loss of 5% user should get another alarm.
    //     portfolio[symbol].alerts.price.down = null;
    //     portfolio[symbol].alerts.price.up = null;
    //
    //     portfolio[symbol].alerts.price[direction] = moment();
    //
    //     this.storage.setPortfolioSync(user, portfolio);
    //   }
    // });
  }
}

module.exports = Watchlist;
