# Slack Stock bot

### Preface

This is a proof of concept at the moment. It's a Slack bot that wraps around the Yahoo Finance API to display "real time" (Delayed 15 minutes) financial data.  This project should not be considered production ready, it's a little rough around the edges.  If you find any bugs, please [file an issue](https://github.com/TNowalk/stock-slack-bot/issues/new).

### Install

Clone this repository

```
git clone https://github.com/TNowalk/stock-slack-bot.git && cd $_
```

Install node modules

```
npm install
```

Copy the default configuration file

```
cp config.default.js config.js
```

Update with your configuration, it should look similar to this

```
'use strict';

const config = {
  slack: {
    token: 'xoxb-your-token-goes-here',
    autoReconnect: true,
  },
};

module.exports = config;
```

The `autoReconnect` configuration is a boolean that indicates whether the bot should automatically reconnect if the websocket drops.

Alternatively, you can use environmental variables.  The bot will use environment variables first and will fall back to the `config.js` file if no variables were found.  The following environmental variables can be set:

```
SLACK_TOKEN=xoxb-your-token-goes-here
SLACK_AUTO_RECONNECT=true
```

Finally, run the app

```
npm run
```

### Things to Do

* Add help command
* Add more commands
* Annotate the codebase
* Add tests and coverage reports (badges)
* See [issues list](https://github.com/TNowalk/stock-slack-bot/issues)

Have an idea?  [Submit an issue](https://github.com/TNowalk/stock-slack-bot/issues/new).

### Commands

As time goes on, the plan is to add more commands to try and make this tool as helpful as possible.  Below is a list of commands that the bot currently supports.

All commands can be run in any channel that the bot has been invited to, or in a direct message with the bot.  When running a command in a public channel, or in a multi-person direct messages it must be directed towards the bot.

```
@stockbot quote $AAPL
```

If in a direct message with the bot, the command does not need to be directed towards the bot.

```
quote $AAPL
```

Most commands support multiple symbols and will return a formatted message for each matched symbol found.

> **Note:** Symbol names are case insensitive, so $aapl will also match for all commands

#### Help

Not implemented yet

#### Snapshot (Passive)

The bot will passively listen to any Slack channel it has been invited to.  It checks every message into the channel for a pattern of $ followed by a string of letters (e.g. $AAPL).  If it detects this pattern, it attempts to query the Yahoo! Finance API to get the snapshot for the found symbol(s) and returns information about the matched symbol including current price (15 minute delayed), last trade time, daily range, and current volume.  The bot can match multiple symbols and will respond with multiple snapshots.

Example usage

```
Hey, you should check out $AAPL!
```

!["Snapshot Screenshot"](./assets/snapshot-screenshot.png)

Example usage for multiple symbols

```
I sure did, but did you see $YHOO and $GOOG?
```

!["Multiple Snapshot Screenshot"](./assets/multiple-snapshot-screenshot.png)

#### Quote

The Quote command can be triggered by sending a message with the word `quote` or `q` and the symbol(s) in a channel the bot is in or in a direct message.  The quote is nearly identical to a snapshot but also includes a graph of the current day's trading activity.

**Triggers:** `quote`, `q`  
**Multiple:** Yes

Example usage

```
quote $AAPL
```

!["Quote Screenshot"](./assets/quote-screenshot.png)

#### Historical

The Historical command is triggered by sending a message to the bot with `historical` or `h` along with the symbol and optionally a number of days, a single date, or a range of dates.  The response will include a formatted table with a row for each date the symbol was traded that includes the date, open and close prices, high and low prices, volume, and the adjusted close price.  A chart for the time period will also be included.  By default, if no arguments are passed in the default length of time is the last 5 days.  Note that the number of days provided won't necessarily return the same number of rows, for example if it is Monday and you run the command without any arguments it will return results for the last 5 days.  Because Saturday and Sunday are not trading days, only 3 or 4 rows will be included.  If it's after market close, today's row will be returned and you'll have 4 rows, if the market is still open then only 3 rows will be returned.

**Triggers:**`historical`, `h`  
**Multiple:** No  
**Options:**  
* `30d` or `30 days` - Last 30 days
* `<date>` - Results from date until today
* `<date> <date>` - Results from first date to second date

Example usage

```
historical $AAPL 30 days
```

!["Historical Screenshot"](./assets/historical-screenshot.png)

Other examples

```
historical $AAPL 45d
historical $AAPL 2016-04-01
historical $AAPL 2016-04-01 2016-05-01
```

#### Analysis

The Analysis can be called using `analyze` or `a` and the symbol(s) to look up.  The goal is to keep this command as non opinionated as possible, but there are certain thresholds that had to be defined.  At some point, these thresholds may be moved to a config file and you can define your own thresholds to customize this to your own trading preferences.  The return payload for this function will provide a wide array of data from current price, eps, market capital, current volume vs average volume, support and resistance levels, trending, returns, simple averages, and other data points used to provide a quick heads up analysis of a stock.

**Triggers:** `analyze`, `a`  
**Multiple:** Yes

Example usage

```
analyze $AAPL
```

!["Analyze Screenshot"](./assets/analyze-screenshot.png)

### Acknowledgements

I'd like to take a few moments to shout out to the various people and tools that provided inspiration for this bot.

* [Shaun Burdick's Slack Game Bot](https://github.com/shaunburdick/gamebot) for providing the boilerplate code for setting up a Slack RTM bot
* [Quotr](https://github.com/andrerpena/quotr) for providing the base inspiration for the bot
* [Botkit](https://github.com/howdyai/botkit) for providing the base lib for working with the Slack RTM API
* [Slack](https://slack.com/) for providing an incredibly awesome and easy to use API
