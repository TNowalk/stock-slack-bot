'use strict';

const moment = require('moment');
const Command = require('./command');

class Analysis extends Command {
  run(symbols) {
    return new Promise((resolve, reject) => {
      // Grab snapshots for the stocks
      this.yahoo.snapshot({
        symbols,
      }, (err, snapshots) => {
        if (!err) {
          // Need to load the historical for each stock
          this.yahoo.historical({
            symbols,
            from: moment().subtract('180', 'days').format('YYYY-MM-DD'),
            to: moment().format('YYYY-MM-DD'),
          }, (hErr, history) => {
            // The history contains an object of `symbol` => historical snapshots
            if (!hErr) {
              let found = false;

              const responses = [];

              snapshots.forEach((snapshot) => {
                // Only include valid symbols
                if (snapshot.name !== null) {
                  found = true;
                }

                let change = 0;

                const low = snapshot.daysLow ? `$${snapshot.daysLow.format(2)}` : '';
                const high = snapshot.daysHigh ? `$${snapshot.daysHigh.format(2)}` : '';
                const open = snapshot.open ? `$${snapshot.open.format(2)}` : '';

                if (snapshot.change) {
                  change = snapshot.change;
                }

                let closeDiff = 0;
                let closeDiffText = 'flat';

                if (snapshot.previousClose && snapshot.lastTradePriceOnly) {
                  closeDiff = (snapshot.lastTradePriceOnly - snapshot.previousClose);
                  closeDiff = (closeDiff / snapshot.previousClose);
                }

                const closeDiffPoints = closeDiff * 100;

                if (closeDiffPoints < -2 && closeDiffPoints >= -4) {
                  closeDiffText = 'down';
                } else if (closeDiffPoints < -4 && closeDiffPoints >= -9) {
                  closeDiffText = 'strong down';
                } else if (closeDiffPoints < -9) {
                  closeDiffText = 'extreme down';
                } else if (closeDiffPoints > 2 && closeDiffPoints <= -4) {
                  closeDiffText = 'up';
                } else if (closeDiffPoints > 4 && closeDiffPoints <= 9) {
                  closeDiffText = 'strong up';
                } else if (closeDiffPoints > 9) {
                  closeDiffText = 'extreme up';
                }

                const lowHighDiffs = [];
                const volumes = [];

                // If historicals were found, loop through them
                if (history[snapshot.symbol]) {
                  history[snapshot.symbol].forEach((row) => {
                    lowHighDiffs.push(Math.abs(row.high - row.low));
                    volumes.push(row.volume);
                  });
                }

                let lowHighDiffsAvg = '';
                let lowHighDiffsSum = '';
                // const lowHighDiffMode = this.mode(lowHighDiffs);

                if (lowHighDiffs.length) {
                  lowHighDiffsSum = lowHighDiffs.reduce((a, b) => a + b);
                  lowHighDiffsAvg = lowHighDiffsSum / lowHighDiffs.length;
                }

                const typicalRange = {
                  low: null,
                  high: null,
                };

                const extremeRange = {
                  low: null,
                  high: null,
                };

                if (snapshot.previousClose) {
                  typicalRange.low = (snapshot.previousClose - (lowHighDiffsAvg / 2)).format(2);
                  typicalRange.high = (snapshot.previousClose + (lowHighDiffsAvg / 2)).format(2);
                  typicalRange.percent = (lowHighDiffsAvg / 2) / snapshot.previousClose * 100;

                  extremeRange.low = (snapshot.previousClose - (lowHighDiffsAvg)).format(2);
                  extremeRange.high = (snapshot.previousClose + (lowHighDiffsAvg)).format(2);
                  extremeRange.percent = (lowHighDiffsAvg) / snapshot.previousClose * 100;
                }

                let volumeSum = '';
                // Default to the 3m average in case historicals weren't found
                let volumeAvg = snapshot.averageDailyVolume;

                if (volumes.length) {
                  volumeSum = volumes.reduce((a, b) => a + b);
                  volumeAvg = volumeSum / volumes.length;
                }

                let volumeDiff = 0;

                if (snapshot.volume && volumeAvg) {
                  volumeDiff = volumeAvg - snapshot.volume;
                  volumeDiff /= volumeAvg;
                  volumeDiff *= -100;
                }

                let output = `*${snapshot.name} (${this.getSymbolLink(snapshot.symbol)})*\n\n`;

                output += '*Price &amp; Volume*\n\n' +
                  'Price\n' +
                  `    *$${snapshot.lastTradePriceOnly.format(2)}* ${change.format(2)} ` +
                      `(${(snapshot.changeInPercent * 100).format(2)}%)\n` +
                  `    ${closeDiffPoints.format(0)} - *${closeDiffText}* from yesterday's close ` +
                      `(${snapshot.previousClose})\n` +
                  `    Today: L: ${low}  O: ${open}  H: ${high}\n` +
                  `        Average Price Range: *${typicalRange.low}* to *${typicalRange.high}*` +
                      ` : ± ${(lowHighDiffsAvg / 2).format(2)} pts, ` +
                      `± ${typicalRange.percent.format(2)}%\n` +
                  `        Extreme Price Range: *${extremeRange.low}* to *${extremeRange.high}*` +
                      ` : ± ${lowHighDiffsAvg.format(2)} pts, ` +
                      `± ${extremeRange.percent.format(2)}%\n\n` +
                  'Volume\n' +
                  `    *${snapshot.volume.format()}* shares, *${volumeDiff.format(2)}%* compared ` +
                      'to typical daily volume\n' +
                  `    Typical daily volume is *${volumeAvg.format()}* shares\n\n`;
                  /*
                  'Rallies/Pullbacks\n' +
                  '    Typical: 1.86 pts (45.7%) occurs 25% of the time\n' +
                  '    Extreme: 2.42 pts (59.5%) occurs 5% of the time\n'
                  */

                // Only include valid symbols
                found = true;
                responses.push({
                  attachments: [{
                    color: this.SYMBOL_NEUTRAL,
                    text: output,
                    mrkdwn_in: ['text', 'pretext'],
                    // image_url: this.getSymbolChart(symbol, snapshot.length),
                  }],
                });
              });

              if (!found) {
                reject('Sorry, I could not find any valid symbols');
              } else {
                resolve(responses);
              }
            }
          });
        }
      });
    });
  }

  mode(arr) {
    return arr.sort((a, b) =>
      arr.filter(v => v === a.format(2)).length - arr.filter(v => v === b.format(2)).length
    ).pop();
  }
}

module.exports = new Analysis();
