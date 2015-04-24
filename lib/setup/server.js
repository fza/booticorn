'use strict';

module.exports = function (cb) {
  var server = this.options.server || require('http').createServer(this.app);
  this.app.set('server', server);

  cb();
};
