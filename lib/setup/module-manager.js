'use strict';

var ModuleManager = require('../module-manager');

module.exports = function setupModuleManager(cb) {
  var moduleManager = this.moduleManager = new ModuleManager(this.app);

  this.app.set('modules', moduleManager);

  cb();
};
