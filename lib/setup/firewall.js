'use strict';

module.exports = function (cb) {
  if (this.options.useHttpFirewall) {
    var HttpFirewall = require('../modules/http-firewall');

    var firewall = new HttpFirewall(this.logger);
    firewall.addServer(this.app.get('server'));

    this.moduleManager.set('firewall', firewall);

    this.logger.info('Successfully setup HTTP firewall');
  }

  cb();
};
