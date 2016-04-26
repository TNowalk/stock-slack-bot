# stock-slack-bot

I will add a more thorough README later

This is kind of a proof of concept at the moment.  It's a Slack bot that wraps around the Yahoo Finance API to display "real time" (Delayed 15 minutes) financial data.  I'll provide screenshots and more explanations after I stub out the rest of the commands that I'd like to add.

If you're interested in running this, know that it's not production ready yet.  I still need to add tests, comments, and clean up the code quite a bit.

To install and run:

1. Clone the project
2. `cd` into the project directory
3. `cp config.default.js config.js`
4. Update `config.slack.token` to the integration token provided by Slack
5. `npm install`
6. `npm start`
