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

  var result = absolute
    ? util.generateUrlFromPath(app, fullPath, protoRelative, this.req.secure)
    : fullPath;

  if (config.envDev) {
    result += '?' + parseInt(Date.now() / 1000, 10);
  }

  return result.toLowerCase();
}

/**
 * Setup template helpers for assets
 * @param {function} cb `callback(error)`
 */
module.exports = function setupAssetsHelpers(cb) {
  var app = this.app;

  var assetHelpers = {

    /**
     * JavaScript asset helper
     * @param assetPath
     * @param absolute
     * @param isDynamic
     * @param protoRelative
     */
    js: function javascriptAssetHelper(assetPath, absolute, isDynamic, protoRelative) {
      if (!/\.js$/.test(assetPath)) {
        assetPath += '.js';
      }

      return generateAssetLink.call(this, app, 'js', assetPath, absolute, isDynamic, protoRelative);
    },

    /**
     * Stylesheet asset helper
     * @param assetPath
     * @param absolute
     * @param isDynamic
     * @param protoRelative
     */
    css: function stylesheetAssetHelper(assetPath, absolute, isDynamic, protoRelative) {
      if (!/\.css$/.test(assetPath)) {
        assetPath += '.css';
      }

      return generateAssetLink.call(this, app, 'css', assetPath, absolute, isDynamic, protoRelative);
    },

    /**
     * Image asset helper
     * @param assetPath
     * @param absolute
     * @param isDynamic
     * @param protoRelative
     */
    image: function imageAssetHelper(assetPath, absolute, isDynamic, protoRelative) {
      return generateAssetLink.call(this, app, 'images', assetPath, absolute, isDynamic, protoRelative);
    }

  };

  // Setup an early  middleware which wraps `res.render()` so that the following params are
  // always available in the template context: req, res, app, config (=`app.get('config')`)
  app.use(function (req, res, next) {
    var origRender = res.render;

    res.render = function (view, renderOptions, fn) {
      var self = this;

      if (_.isFunction(renderOptions)) {
        fn = renderOptions;
        renderOptions = {};
      }

      var context = {
        req: self.req,
        res: self,
        app: app,
        config: app.get('config')
      };

      renderOptions = _.extend(renderOptions || {}, context);

      // Wrap our asset helpers so that they have access to these params, too.
      // This is especially necessary when generating absolute urls with protocol scheme,
      // where the scheme should always match the request protocol.
      _.each(assetHelpers, function (helperFn, helperName) {
        res.locals[helperName] = function () {
          return helperFn.apply(context, arguments);
        };
      });

      return origRender.call(this, view, renderOptions, fn);
    };

    next();
  });

  cb();
};
