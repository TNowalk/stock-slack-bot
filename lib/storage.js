'use strict';

const FileStore = require('jfs');

class Storage {
  constructor(config = { path: `${process.env.PWD}/data/db` }) {
    this.db = new FileStore(config.path, { type: 'single' });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      this.db.all((err, portfolios) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(portfolios);
      });
    });
  }

  getPortfolio(user) {
    return new Promise((resolve) => {
      this.db.get(user, (err, portfolio = {}) => {
        resolve(portfolio);
      });
    });
  }

  setPortfolio(user, portfolio) {
    return new Promise((resolve, reject) => {
      this.db.save(user, portfolio, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(portfolio);
      });
    });
  }

  addSymbols(user, symbols = []) {
    return new Promise((resolve) => {
      this.getPortfolio(user).then((data) => {
        const portfolio = data;
        symbols.forEach((symbol) => {
          if (!portfolio.hasOwnProperty(symbol)) {
            portfolio[symbol] = {
              alerts: [],
              holdings: [],
            };
          }
        });
        this.db.saveSync(user, portfolio);
        resolve(portfolio);
      });
    });
  }

  removeSymbols(user, symbols = []) {
    return new Promise((resolve) => {
      this.getPortfolio(user).then((data) => {
        const portfolio = data;
        symbols.forEach((symbol) => {
          if (portfolio.hasOwnProperty(symbol)) {
            delete portfolio[symbol];
          }
        });
        this.db.saveSync(user, portfolio);
        resolve(portfolio);
      });
    });
  }
}

module.exports = Storage;
