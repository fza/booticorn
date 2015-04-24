'use strict';

var _ = require('lodash'),
  async = require('async');

module.exports = function setupCustomTasks(cb) {
  var self = this;

  if (_.isArray(self.options.tasks)) {
    async.series(self.options.tasks, function setupCustomTask(customTask, customTaskCb) {
      self.makeTask(customTask)(customTaskCb);
    }, cb);
  }
};
