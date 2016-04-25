'use strict';

const Botkit = require('botkit');
const logger = require('./logger')();

/**
 * @module Bot
 */
class Bot {
  /**
   * Constructor.
   *
   * @constructor
   * @param {object} config The final configuration for the bot
   */
  constructor(config) {
    this.config = config;

    this.lookup = new Map();

    this.controller = Botkit.slackbot();
  }

  /**
   * Populates a quick lookup table.
   *
   * @param {object} payload The rtm.start payload
   * @return {Bot} returns itself
   */
  populateLookup(payload) {
    ['users', 'channels', 'groups', 'mpims'].forEach((type) => {
      if (payload[type]) {
        payload[type].forEach((item) => {
          this.lookup.set(item.id, item);
        });
      }
    });
  }

  /**
   * Function to be called on slack open
   *
   * @param {object} payload Connection payload
   * @return {Bot} returns itself
   */
  slackOpen(payload) {
    const channels = [];
    const groups = [];
    const mpims = [];

    logger.info(`Welcome to Slack. You are @${payload.self.name} of ${payload.team.name}`);

    if (payload.channels) {
      payload.channels.forEach((channel) => {
        if (channel.is_member) {
          channels.push(`#${channel.name}`);
        }
      });

      logger.info(`You are in: ${channels.join(', ')}`);
    }

    if (payload.groups) {
      payload.groups.forEach((group) => {
        groups.push(`${group.name}`);
      });

      logger.info(`Groups: ${groups.join(', ')}`);
    }

    if (payload.mpims) {
      payload.mpims.forEach((mpim) => {
        mpims.push(`${mpim.name}`);
      });

      logger.info(`Multi-person IMs: ${mpims.join(', ')}`);
    }

    return this;
  }

  /**
   * Handle an incoming message
   * @param {object} message The incoming message from Slack
   * @return {Bot} returns itself
   */
  handleMessage(message) {
    logger.info(message);
    return this;
  }

  /**
   * Start the bot
   *
   * @return {Bot} returns itself
   */
  start() {
    this.controller.on(
      'direct_mention,mention,ambient,direct_message,reaction_added,reaction_removed',
      (bot, message) => {
        this.handleMessage(message);
      }
    );

    this.controller.on('team_join,user_change,group_joined,channel_joined', (bot, message) => {
      if (message.user && message.user.id) {
        logger.info(`Saw new user: ${message.user.name}`);
        this.lookup.set(message.user.id, message.user);
      } else if (message.channel && message.channel.id) {
        logger.info(`Saw new channel: ${message.channel.name}`);
        this.lookup.set(message.channel.id, message.channel);
      }
    });

    this.controller.on('rtm_close', () => {
      logger.info('The RTM api just closed');

      if (this.config.slack.autoReconnect) {
        this.connect();
      }
    });

    this.connect();

    return this;
  }

  /**
   * Connect to the RTM
   * @return {Bot} this
   */
  connect() {
    this.bot = this.controller.spawn({
      token: this.config.slack.token,
      retry: this.config.slack.autoReconnect ? Infinity : 0,
    }).startRTM((err, bot, payload) => {
      if (err) {
        logger.error('Error starting bot!', err);
      }

      this.payload = payload;
      this.populateLookup(payload);
      this.slackOpen(payload);
    });

    return this;
  }
}

module.exports = Bot;
