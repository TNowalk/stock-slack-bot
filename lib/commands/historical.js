'use strict';

const moment = require('moment');
const Command = require('./command');

class Historical extends Command {
  constructor(config) {
    super(config);
    this.name = 'Historical';
    this.triggers = /^\b(historical|h)\b/i;
    this.aliases = ['historical', 'h'];
  }

  help(bot) {
    return new Promise((resolve) => {
      resolve(
        'Provides a formatted table with a row for each date ' +
        'the symbol was traded that includes the date, open and close prices, ' +
        'high and low prices, volume, and the adjusted close price. A chart ' +
        'for the time period will also be included.\n' +
        '_If no arguments are provided, the default length of ' +
        `time is the last ${this.DEFAULT_TIMEFRAME} days._\n` +
        `Triggers: [${this.aliases.join(', ')}]\n` +
        'Example commands:\n' +
        `\`@${bot.name} ${this.aliases[0]} $AAPL\`\n` +
        `\`@${bot.name} ${this.aliases[0]} $AAPL 30 days\`\n` +
        `\`@${bot.name} ${this.aliases[0]} $AAPL 30d\`\n` +
        `\`@${bot.name} ${this.aliases[0]} $AAPL 2016-04-01\`\n` +
        `\`@${bot.name} ${this.aliases[0]} $AAPL 2016-04-01 2016-05-01\`\n`
      );
    });
  }

  run(message) {
    return new Promise((resolve, reject) => {
      const symbols = this.extractSymbols(message.text);

      if (!symbols.length) {
        reject('Sorry, I could not find any symbols');
        return;
      }

      // Find dates in message
      const dates = this.extractDates(message.text);

      this.yahoo.historical({
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
              let maxRangeLength = 5;
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

                if ((row.high - row.low).format(2).length > maxRangeLength) {
                  maxRangeLength = (row.high - row.low).format(2).length;
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
                `${'Range'.rpad(' ', maxRangeLength + 5)}` +
                `${'Volume'.rpad(' ', maxVolumeLength + 5)}` +
                `${'Adj Close'.rpad(' ', maxAdjustedLength + 5)}\n`;

              snapshot.forEach((row) => {
                output += `${row.symbol.rpad(' ', maxSymbolLength + 5)}` +
                  `${moment(row.date).format('YYYY-MM-DD').rpad(' ', maxDateLength + 5)}` +
                  `$${row.open.format(2).rpad(' ', maxOpenLength + 4)}` +
                  `$${row.close.format(2).rpad(' ', maxCloseLength + 4)}` +
                  `$${row.high.format(2).rpad(' ', maxHighLength + 4)}` +
                  `$${row.low.format(2).rpad(' ', maxLowLength + 4)}` +
                  `$${(row.high - row.low).format(2).rpad(' ', maxLowLength + 4)}` +
                  `${row.volume.format(0).rpad(' ', maxVolumeLength + 5)}` +
                  `$${row.adjClose.format(2).rpad(' ', maxAdjustedLength + 4)}\n`;
              });

              // Only include valid symbols
              found = true;
              resolve({
                attachments: [{
                  fallback: `Historical results for ${snapshot.symbol}`,
                  color: this.SYMBOL_NEUTRAL,
                  text: `\`\`\`\n${output}\`\`\``,
                  mrkdwn_in: ['text', 'pretext'],
                  image_url: this.getSymbolChart(symbol, snapshot.length),
                }],
              });
            }
          });

          if (!found) {
            reject('Sorry, I could not find any valid symbols');
          }
        }
      });
    });
  }
}

module.exports = Historical;
