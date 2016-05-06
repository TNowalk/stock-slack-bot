'use strict';

const moment = require('moment');
const Command = require('./command');

class Historical extends Command {
  run(symbols, dates) {
    return new Promise((resolve, reject) => {
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

module.exports = new Historical();
