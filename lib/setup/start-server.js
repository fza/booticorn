'use strict';

module.exports = function startServer(cb) {
  var app = this.app,
    server = app.get('server');

  server.listen(this.config.port, this.config.address);

  server.once('listening', function () {
    var address = server.address();
    app.get('logger').info('Server listening at http://%s:%s', address.address, address.port);

    cb();
  });
};
