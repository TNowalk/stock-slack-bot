'use strict';

const yahooFinance = require('yahoo-finance');

const SYMBOL_NEUTRAL = '#439FE0';
const SYMBOL_POSITIVE = 'good'; // '#36A64F';
const SYMBOL_NEGATIVE = 'danger'; // '#F24646';
const DEFAULT_FIELDS = ['o', 'g', 'h', 'l1', 'c1', 'p2', 'v', 'd1', 'e1', 'n', 'd2', 't1'];

class Command {

  constructor() {
    this.yahoo = yahooFinance;

    this.SYMBOL_NEUTRAL = SYMBOL_NEUTRAL;
    this.SYMBOL_POSITIVE = SYMBOL_POSITIVE;
    this.SYMBOL_NEGATIVE = SYMBOL_NEGATIVE;
    this.DEFAULT_FIELDS = DEFAULT_FIELDS;
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
}

module.exports = Command;
