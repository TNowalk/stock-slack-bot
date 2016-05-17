'use strict';

const moment = require('moment');
const Command = require('./command');

/**
 * Price Variance Command - gets the price variance between two dates
 */
class Variance extends Command {
  run(symbols, dates) {
    return new Promise((resolve, reject) => {
      // Grab the historical snapshots between the two dates
      this.yahoo.historical({
        symbols,
        from: dates.from,
        to: dates.to,
      }, (err, snapshots) => {
        if (!err) {
          let found = false;

          // The historical return payload is an object keyed by the symbol.
          // Loop over each symbol to get it's historical snapshots
          symbols.forEach((symbol) => {
            if (snapshots[symbol] !== undefined) {
              const history = snapshots[symbol];

              // Grab the first and last snapshots
              const firstSnapshot = history[0];
              const lastSnapshot = history[history.length - 1];

              // Get the formatted dates for the first/last snapshots
              const firstDate = moment(firstSnapshot.date).format('MMM Do, YYYY');
              const lastDate = moment(lastSnapshot.date).format('MMM Do, YYYY');

              // Get the open and close prices
              const openPrice = firstSnapshot.open;
              const closePrice = lastSnapshot.close;

              // Open close price difference
              const priceDiff = closePrice - openPrice;

              let priceDiffPerc = 0;
              if (openPrice > 0) {
                priceDiffPerc = priceDiff / openPrice * 100;
              }

              // Keep track of the lowest and highest price
              let lowestPrice = null;
              let highestPrice = null;

              // Loop over the historical snapshots to get lowest/highest prices
              history.forEach((snapshot) => {
                // If null or snapshot low price is lower than current lowest
                if (!lowestPrice || snapshot.low < lowestPrice) {
                  lowestPrice = snapshot.low;
                }

                // If null or snapshot high price is lower than current highest
                if (!highestPrice || snapshot.high > highestPrice) {
                  highestPrice = snapshot.high;
                }
              });

              // Difference between the lowest and highest price
              const lowHighDiff = highestPrice - lowestPrice;

              // Start output
              const output = `*${this.getSymbolLink(symbol)}*\n` +
                  `${firstDate} Open Price: $${openPrice.format(2)}\n` +
                  `${lastDate} Close Price: $${closePrice.format(2)}\n` +
                  `Open/Close Variance: $${priceDiff.format(2)} (${priceDiffPerc.format(2)}%)\n` +
                  `Lowest Price: $${lowestPrice.format(2)}\n` +
                  `Highest Price: $${highestPrice.format(2)}\n` +
                  `Low/High Difference: $${lowHighDiff.format(2)}`;

              found = true;

              resolve({
                attachments: [{
                  color: this.getSymbolColor(priceDiff),
                  text: output,
                  mrkdwn_in: ['text', 'pretext'],
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

module.exports = new Variance();
