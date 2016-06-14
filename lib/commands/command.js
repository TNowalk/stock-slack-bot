'use strict';

const yahooFinance = require('yahoo-finance');
const moment = require('moment');

const SYMBOL_NEUTRAL = '#439FE0';
const SYMBOL_POSITIVE = 'good'; // '#36A64F';
const SYMBOL_NEGATIVE = 'danger'; // '#F24646';
const DEFAULT_FIELDS = ['o', 'g', 'h', 'l1', 'c1', 'p2', 'v', 'd1', 'e1', 'n', 'd2', 't1'];
const STOCK_PATTERN = /\$[a-z]+/gi;

class Command {

  constructor(config, storage) {
    this.config = config;
    this.storage = storage;

    this.yahoo = yahooFinance;

    this.SYMBOL_NEUTRAL = SYMBOL_NEUTRAL;
    this.SYMBOL_POSITIVE = SYMBOL_POSITIVE;
    this.SYMBOL_NEGATIVE = SYMBOL_NEGATIVE;
    this.DEFAULT_FIELDS = DEFAULT_FIELDS;

    this.DEFAULT_TIMEFRAME = 5; // Default 5 days
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
    let from = moment().subtract(this.DEFAULT_TIMEFRAME, 'days');

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
}

module.exports = Command;
