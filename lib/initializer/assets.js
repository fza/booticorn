'use strict';

var _ = require('lodash'),
  fs = require('fs'),
  path = require('path'),
  util = require('../util');

function generateAssetLink(app, type, assetPath, absolute, isDynamic, protoRelative) {
  var config = app.get('config');

  var fullPath = path.join(config['assets' + _.capitalize(type) + 'Path'], assetPath);

  if (!isDynamic && !fs.existsSync(path.join(config.assetsMountPath, fullPath))) {
    throw new Error('Asset "' + assetPath + '" could not be found');
  }

  if (fullPath.charAt(0) !== '/') {
    fullPath = '/' + fullPath;
  }

  var result = absolute ? util.generateUrlFromPath(app, fullPath, protoRelative) : fullPath;

  if (config.envDev) {
    result += '?' + parseInt(Date.now() / 1000, 10);
  }

  return result.toLowerCase();
}

/**
 * Init template helpers for assets
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function initAssetsHelper(app, config, options, logger, cb) {

  _.extend(app.locals, {

    /**
     * JavaScript asset helper
     * @param assetPath
     * @param absolute
     * @param isDynamic
     */
    js: function javascriptAssetHelper(assetPath, absolute, isDynamic, protoRelative) {
      if (!/\.js$/.test(assetPath)) {
        assetPath += '.js';
      }

      return generateAssetLink(app, 'js', assetPath, absolute, isDynamic, protoRelative);
    },

    /**
     * Stylesheet asset helper
     * @param assetPath
     * @param absolute
     * @param isDynamic
     */
    css: function stylesheetAssetHelper(assetPath, absolute, isDynamic, protoRelative) {
      if (!/\.css$/.test(assetPath)) {
        assetPath += '.css';
      }

      return generateAssetLink(app, 'css', assetPath, absolute, isDynamic, protoRelative);
    },

    /**
     * Image asset helper
     * @param assetPath
     * @param absolute
     * @param isDynamic
     */
    image: function imageAssetHelper(assetPath, absolute, isDynamic, protoRelative) {
      return generateAssetLink(app, 'images', assetPath, absolute, isDynamic, protoRelative);
    }

  });

  cb();

};
