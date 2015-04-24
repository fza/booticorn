'use strict';

module.exports = function setupModules(cb) {
  var self = this;

  var modulesPath = self.options.modulesPath;
  if (modulesPath) {
    self.moduleManager.load(modulesPath, function (error) {
      if (error) {
        cb(error);
        return;
      }

      self.logger.info('Successfully loaded modules');
      cb();
    });
  } else {
    cb();
  }
};
