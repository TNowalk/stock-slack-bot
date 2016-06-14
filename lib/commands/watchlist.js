'use strict';

const Command = require('./command');

class Watchlist extends Command {
  constructor(config, storage) {
    super(config, storage);
    this.name = 'Watchlist';
    this.triggers = /^\b(watchlist|wl|w)\b/i;
    this.aliases = ['watchlist', 'wl', 'w'];
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
          let fallback = 'Not currently watching any symbols';
          let text = fallback;
          if (links.length) {
            fallback = `Currently watching: ${Object.keys(portfolio).sort().join(', ')}`;
            text = `Currently watching: ${links.sort().join(', ')}`;
          }
          resolve({
            attachments: [{
              fallback,
              text,
            }],
          });
        } else if (action === 'remove') {
          this.storage.removeSymbols(message.user, symbols).then((updated) => {
            const links = [];
            Object.keys(updated).forEach((symbol) => {
              links.push(this.getSymbolLink(symbol));
            });
            let text = 'Not currently watching any symbols';
            if (links.length) {
              text = `Currently watching: ${links.sort().join(', ')}`;
            }
            resolve({
              attachments: [{
                fallback: 'Symbols removed from watchlist',
                text,
              }],
            });
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
                  resolve({
                    attachments: [{
                      fallback: 'Symbols added to watchlist',
                      text: `Currently watching: ${links.sort().join(', ')}`,
                    }],
                  });
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
}

module.exports = Watchlist;
