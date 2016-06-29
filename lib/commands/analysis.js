'use strict';

const moment = require('moment');
const Command = require('./command');

class Analysis extends Command {
  constructor(lookup) {
    super(lookup);
    this.name = 'Analysis';
    this.triggers = /^\b(analysis|a)\b/i;
    this.aliases = ['analysis', 'a'];
  }

  help(bot) {
    return new Promise((resolve) => {
      resolve(
        'Provides a wide array of data from current price, EPS, market capital, ' +
        'current volume vs average volume, support and resistance levels, trending, ' +
        'returns, simple averages, and other data points used to provide a quick ' +
        'heads up analysis of a stock.\n' +
        `Triggers: [${this.aliases.join(', ')}]\n` +
        `To run command, type: \`@${bot.name} ${this.aliases[0]} $AAPL\`\n`
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

                let stockHistory = null;

                if (history[snapshot.symbol]) {
                  stockHistory = history[snapshot.symbol];
                }

                let yesterday = null;

                // Need yesterday's snapshot
                if (stockHistory[stockHistory.length - 1]) {
                  yesterday = stockHistory[stockHistory.length - 1];
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

                // Try to get the last index for last year
                let lastTradeOfPrevYearIdx = null;
                let ninetyDaysIdx = null;

                // If historicals were found, loop through them
                if (stockHistory) {
                  const lastYear = moment().subtract(1, 'year').format('YYYY');
                  const ninetyDays = moment().subtract(90, 'days').format('X');

                  stockHistory.forEach((row, idx) => {
                    lowHighDiffs.push(Math.abs(row.high - row.low));
                    volumes.push(row.volume);

                    const rowDate = moment(row.date);

                    if (rowDate.format('YYYY') === lastYear) {
                      lastTradeOfPrevYearIdx = idx;
                    }

                    if (rowDate.format('X') < ninetyDays) {
                      ninetyDaysIdx = idx;
                    }
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

                let pivotPoint = null;
                const resistance = {
                  1: {
                    value: null,
                    count: 0,
                    text: null,
                  },
                  2: {
                    value: null,
                    count: 0,
                    text: null,
                  },
                  3: {
                    value: null,
                    count: 0,
                    text: null,
                  },
                };
                const support = {
                  1: {
                    value: null,
                    count: 0,
                    text: null,
                  },
                  2: {
                    value: null,
                    count: 0,
                    text: null,
                  },
                  3: {
                    value: null,
                    count: 0,
                    text: null,
                  },
                };

                if (yesterday) {
                  pivotPoint = (yesterday.high + yesterday.close + yesterday.low) / 3;
                  resistance[1].value = 2 * pivotPoint - yesterday.low;
                  support[1].value = 2 * pivotPoint - yesterday.high;

                  resistance[2].value = pivotPoint + (resistance[1].value - support[1].value);
                  support[2].value = pivotPoint - (resistance[1].value - support[1].value);

                  resistance[3].value = yesterday.high + 2 * (pivotPoint - yesterday.low);
                  support[3].value = yesterday.low - 2 * (yesterday.high - pivotPoint);
                }

                const priceAdj = snapshot.open ? snapshot.open * 0.01 : 0.05;

                // Loop through the historicals again to see how many times they
                // hit the resistances
                if (stockHistory) {
                  stockHistory.forEach((row) => {
                    if (row.high >= resistance[1].value - priceAdj
                      && row.high < resistance[1].value + priceAdj
                    ) {
                      resistance[1].count++;
                    } else if (row.high >= resistance[2].value - priceAdj
                      && row.high < resistance[2].value + priceAdj
                    ) {
                      resistance[2].count++;
                    } else if (row.high >= resistance[3].value - priceAdj
                      && row.high < resistance[3].value + priceAdj
                    ) {
                      resistance[3].count++;
                    }

                    if (row.low >= support[1].value - priceAdj
                      && row.low < support[1].value + priceAdj
                    ) {
                      support[1].count++;
                    } else if (row.low >= support[2].value - priceAdj
                      && row.low < support[2].value + priceAdj
                    ) {
                      support[2].count++;
                    } else if (row.low >= support[3].value - priceAdj
                      && row.low < support[3].value + priceAdj
                    ) {
                      support[3].count++;
                    }
                  });
                }

                resistance[1].text = this.getLevelText(resistance[1].count);
                resistance[2].text = this.getLevelText(resistance[2].count);
                resistance[3].text = this.getLevelText(resistance[3].count);

                support[1].text = this.getLevelText(support[1].count);
                support[2].text = this.getLevelText(support[2].count);
                support[3].text = this.getLevelText(support[3].count);

                // Simple Moving Averages
                const sma50 = snapshot['50DayMovingAverage'] || 0.00;
                const sma200 = snapshot['200DayMovingAverage'] || 0.00;

                const sma50Change = snapshot.changeFrom50DayMovingAverage || 0.00;
                const sma200Change = snapshot.changeFrom200DayMovingAverage || 0.00;

                const sma50ChangePerc = snapshot.percentChangeFrom50DayMovingAverage || 0.00;
                const sma200ChangePerc = snapshot.percentChangeFrom200DayMovingAverage || 0.00;

                const yearHigh = snapshot['52WeekHigh'] || 0.00;
                const yearLow = snapshot['52WeekLow'] || 0.00;

                const yearHighChange = snapshot.changeFrom52WeekHigh || 0.00;
                const yearLowChange = snapshot.changeFrom52WeekLow || 0.00;

                // There is a mispelling in the returned payload for percent
                const yearHighChangePerc = snapshot.percebtChangeFrom52WeekHigh || 0.00;
                const yearLowChangePerc = snapshot.percentChangeFrom52WeekLow || 0.00;

                // Start calculating returns
                let todaysReturns = null;
                let todaysReturnsPerc = null;

                if (yesterday && snapshot.lastTradePriceOnly) {
                  todaysReturns = snapshot.lastTradePriceOnly - yesterday.close;
                  todaysReturnsPerc = todaysReturns / yesterday.close;
                }

                let ninetyDaysReturn = null;
                let ninetyDaysReturnsPerc = null;

                if (stockHistory[ninetyDaysIdx] && snapshot.lastTradePriceOnly) {
                  const tradeSnapshot = stockHistory[ninetyDaysIdx];
                  ninetyDaysReturn = snapshot.lastTradePriceOnly - tradeSnapshot.close;
                  ninetyDaysReturnsPerc = ninetyDaysReturn / tradeSnapshot.close;
                }

                let ytdReturns = null;
                let ytdReturnsPerc = null;

                if (stockHistory[lastTradeOfPrevYearIdx] && snapshot.lastTradePriceOnly) {
                  const lastTradeSnapshot = stockHistory[lastTradeOfPrevYearIdx];
                  ytdReturns = snapshot.lastTradePriceOnly - lastTradeSnapshot.close;
                  ytdReturnsPerc = ytdReturns / lastTradeSnapshot.close;
                }

                let yrTargetPrice = null;

                if (snapshot['1YrTargetPrice']) {
                  yrTargetPrice = snapshot['1YrTargetPrice'];
                }

                let output = `*${snapshot.name} (${this.getSymbolLink(snapshot.symbol)})*\n`;

                output += '*Price &amp; Volume*\n' +
                  '    Price\n' +
                  `        *$${snapshot.lastTradePriceOnly.format(2)}* ${change.format(2)} ` +
                          `(${(snapshot.changeInPercent * 100).format(2)}%)\n` +
                  `        ${closeDiffPoints.format(0)} *${closeDiffText}*` +
                           ' from yesterday\'s close ' +
                          `(${snapshot.previousClose})\n` +
                  '        Today\n' +
                  `            L: ${low}  O: ${open}  H: ${high}\n` +
                  `            Average Price Range: *${typicalRange.low}* ` +
                              `to *${typicalRange.high}*` +
                          ` : ± ${(lowHighDiffsAvg / 2).format(2)} pts, ` +
                          `± ${typicalRange.percent.format(2)}%\n` +
                  `            Extreme Price Range: *${extremeRange.low}* ` +
                              `to *${extremeRange.high}*` +
                          ` : ± ${lowHighDiffsAvg.format(2)} pts, ` +
                          `± ${extremeRange.percent.format(2)}%\n` +
                  '        52 Week\n' +
                  `            Low: *${yearLow.format(2)}* ${yearLowChange.format(2)} ` +
                               `(${(yearHighChangePerc * 100).format(2)}%)\n` +
                  `            High: *${yearHigh.format(2)}* ${yearHighChange.format(2)} ` +
                               `(${(yearLowChangePerc * 100).format(2)}%)\n` +
                  `        1 Year Target: *${yrTargetPrice ? yrTargetPrice.format(2) : 'N/A'}*\n` +
                  `        EPS: ${snapshot.earningsPerShare.format(2)}\n` +
                  `        Market Cap: ${snapshot.marketCapitalization}\n` +
                  '    Volume\n' +
                  `        *${snapshot.volume.format()}* shares, ` +
                          `*${volumeDiff.format(2)}%* compared ` +
                          'to typical daily volume\n' +
                  `        Typical daily volume is *${volumeAvg.format()}* shares\n` +
                  '    Averages\n' +
                  `        SMA50: *${sma50.format(2)}* ${sma50Change.format(2)} ` +
                          `(${(sma50ChangePerc * 100).format(2)}%) ` +
                          `SMA200: *${sma200.format(2)}* ${sma200Change.format(2)} ` +
                          `(${(sma200ChangePerc * 100).format(2)}%)\n` +
                  '    Returns\n' +
                  `        1d: *${todaysReturns.format(2)}* ` +
                          `(${(todaysReturnsPerc * 100).format(2)}%) ` +
                          `90d: *${ninetyDaysReturn.format(2)}* ` +
                          `(${(ninetyDaysReturnsPerc * 100).format(2)}%) ` +
                          `YTD: *${ytdReturns ? ytdReturns.format(2) : 'N/A'}* ` +
                          `(${(ytdReturnsPerc * 100).format(2)}%)\n`;

                if (pivotPoint) {
                  output += '*Support &amp; Resistance Levels*\n' +
                    '    Resistance Above\n' +
                    `       L3: ${resistance[3].value.format(2)} type *${resistance[3].text}*\n` +
                    `       L2: ${resistance[2].value.format(2)} type *${resistance[2].text}*\n` +
                    `       L1: ${resistance[1].value.format(2)} type *${resistance[1].text}*\n` +
                    `    *Pivot Point:* ${pivotPoint.format(2)}\n` +
                    '    Support Below\n' +
                    `       L1: ${support[1].value.format(2)} type *${support[1].text}*\n` +
                    `       L2: ${support[2].value.format(2)} type *${support[2].text}*\n` +
                    `       L3: ${support[3].value.format(2)} type *${support[3].text}*\n`;
                }

                // Only include valid symbols
                found = true;
                responses.push({
                  attachments: [{
                    fallback: `Analysis for ${snapshot.symbol}`,
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

  getLevelText(count) {
    if (count === 2) {
      return 'double';
    } else if (count === 3) {
      return 'triple';
    } else if (count > 3) {
      return 'triple+';
    }

    return 'single';
  }
}

module.exports = Analysis;
