'use strict';

const Command = require('./command');

class Analysis extends Command {
  run(symbols) {
    return new Promise((resolve, reject) => {
      // Grab snapshots for the stocks
      this.yahoo.snapshot({
        symbols,
      }, (err, snapshots) => {
        if (!err) {
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

            let volumeDiff = 0;

            if (snapshot.volume && snapshot.averageDailyVolume) {
              volumeDiff = snapshot.averageDailyVolume - snapshot.volume;
              volumeDiff /= snapshot.averageDailyVolume;
              volumeDiff *= -100;
            }

            let output = `*${snapshot.name} (${this.getSymbolLink(snapshot.symbol)})*\n\n`;

            output += '*Price &amp; Volume*\n\n' +
              'Price\n' +
              `    $${snapshot.lastTradePriceOnly.format(2)} ${change.format(2)} ` +
                  `(${(snapshot.changeInPercent * 100).format(2)}%)\n` +
              `    ${closeDiffPoints.format(0)} - *${closeDiffText}* from yesterday's close\n` +
              `    Today: L: ${low}  O: ${open}  H: ${high}\n` +
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
    });
  }
}

module.exports = new Analysis();
