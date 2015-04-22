'use strict';

var _ = require('lodash');

function generateRuleMatcherFn(matcher) {
  switch (true) {
    case _.isFunction(matcher):
      if (_.isFunction(matcher) && (matcher.length < 1 || matcher.length > 2)) {
        throw new Error('Wrong signature of firewall rule matcher callback.');
      }

      return matcher;

    case _.isRegExp(matcher):
      return function (req) {
        return matcher.test(req.url);
      };

    case _.isString(matcher):
      matcher = matcher.toLowerCase();

      return function (req) {
        return req.url.toLowerCase() === matcher;
      };

    default:
      throw new Error('Unknown firewall rule matcher.');
  }
}

/**
 * Simple priority-rule based HTTP application firewall
 * @constructor
 */
function HttpServerFirewall(logger) {
  this.logger = logger;
  this.server = null;
  this.enabled = false;
  this.rules = {};
  this.ruleLength = 0;
  this.priorities = [];
}

_.extend(HttpServerFirewall.prototype, {

  /**
   * Enable the firewall in the context of a http.Server instance
   * @param server
   */
  enable: function (server) {
    var self = this;

    if (self.server !== null) {
      throw new Error('Cannot enable HTTP application firewall twice on a different server.');
    }

    if (server === self.server) {
      return;
    }

    self.server = server;
    self.originalListeners = server.listeners('request');

    self.priorities.sort();

    server.removeAllListeners('request');
    server.on('request', self._requestListener.bind(self));

    var originalOn = server.on;
    server.on = function (event, listener) {
      if (event === 'request') {
        self.originalListeners.push(listener);
      } else {
        originalOn.apply(server, arguments);
      }
    };

    self.server = server;
    self.enabled = true;
  },

  /**
   * Add a firewall rule
   *
   * The check and action callbacks receive a `context` argument which is a plain object in which
   * rule checkers can store memo/context data.
   *
   * @param {string} ruleDesc Informational rule description for logging
   * @param {number} priority Priority of this rule
   * @param {function|RegExp|string} matcher Rule matcher, if function: `check(req, context)`
   * @param {function} actionCb Rule action callback: `actionCb(req, res, context)`
   */
  addRule: function (ruleDesc, priority, matcher, actionCb) {
    if (!this.rules[priority]) {
      this.rules[priority] = [];
      this.priorities.push(priority);

      // @todo Deny adding rules when firewall is live?
      if (this.enabled) {
        this.priorities.sort();
      }
    }

    if (_.isFunction(actionCb) && (actionCb.length < 2 || actionCb.length > 3)) {
      throw new Error('Wrong signature of firewall rule action callback.');
    }

    this.rules[priority].push({
      desc: ruleDesc,
      matcher: generateRuleMatcherFn(matcher),
      fire: actionCb
    });

    this.ruleLength++;
  },

  /**
   * Request listener intercepting all requests
   * @param req
   * @param res
   * @private
   */
  _requestListener: function (req, res) {
    var self = this;

    if (self.ruleLength > 0) {
      var context = {},
        matchingRule;

      self.priorities.some(function (priority) {
        return self.rules[priority].some(function (rule) {
          if (rule.matcher(req, context)) {
            matchingRule = rule;
            return true;
          }
        });
      });

      if (matchingRule) {
        // @todo Add a bit more log information
        self.logger.warn('Request matched firewall rule: ' + matchingRule.desc);
        matchingRule.fire(req, res, context);
        return;
      }
    }

    self.originalListeners.forEach(function (fn) {
      fn(req, res);
    });
  }

});

module.exports = HttpServerFirewall;
