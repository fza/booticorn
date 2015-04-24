'use strict';

var _ = require('lodash'),
  inherits = require('util').inherits,
  Route = require('./route');

function SegmentRoute(name, pattern, options) {
  Route.apply(this, arguments);
}

inherits(SegmentRoute, Route);
_.extend(SegmentRoute.prototype, {

  invoke: function invokeRouteAction(req, res, next) {
    if (this.parentRoute) {
      try {
        this.parentRoute.handleRequestParams(req);
      } catch (e) {
        next(e);
        return;
      }
    }

    this.expressRouter(req, res, next);
  },

  addSubRoutes: function (routes) {
    var self = this;

    _.each(routes, function (route) {
      route.mount(self);
    });
  }

});

module.exports = SegmentRoute;
