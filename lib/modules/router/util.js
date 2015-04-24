'use strict';

var _ = require('lodash');

function getRouteChain(route) {
  var chain = [];
  do {
    chain.unshift(route.getName());
  } while (!_.isUndefined(route = route.parentRoute));

  return chain.join(' → ');
}

exports.getRouteChain = getRouteChain;

function sanitizePattern(pattern) {
  return '/' + _.trim((pattern || '').replace(/\/+/g, '/'), '/');
}

exports.sanitizePattern = sanitizePattern;

function parseControllerConfig(controllerConfig) {
  var parsedController = controllerConfig.split(':');

  return {
    controllerPath: parsedController[0],
    actionName: parsedController[1]
  };
}

exports.parseControllerConfig = parseControllerConfig;

function parsePattern(pattern, options) {
  var params = [],
    paramData = {},
    optionalParams = [],
    mandatoryParams = [];

  var requirements = options.requirements || {},
    defaults = options.defaults || {},
    resetPattern = false;

  var segments = pattern
    .split('/')
    .filter(function (segment) {
      return segment.length > 0;
    })
    .map(function (segment) {
      if (segment.charAt(0) !== ':') {
        // Not a param
        return {
          isParam: false,
          value: segment
        };
      }

      var param = segment.substr(1).replace(/\?$/, ''),
        hasQuestionMark = segment.charAt(segment.length - 1) === '?',
        optional = hasQuestionMark || !!defaults[param];

      if (optional && !hasQuestionMark) {
        resetPattern = true;
        segment += '?';
      }

      if (!/[\?\*\+\(\)]/.test(param)) {
        params.push(param);
        (optional ? optionalParams : mandatoryParams).push(param);

        var regExp = null;
        if (requirements[param]) {
          var regExpStr = requirements[param];

          if (regExpStr.charAt(0) === '/') {
            regExpStr = regExpStr.substring(1, regExpStr.length - 1);
          }

          regExp = new RegExp(regExpStr);
        }

        return paramData[param] = {
          isParam: true,
          value: segment,
          param: param,
          optional: optional,
          regExp: regExp,
          defaultValue: defaults[param]
        };
      }
    });

  if (segments.length === 0) {
    return '/';
  }

  if (resetPattern) {
    pattern = segments.reduce(function (memo, segment) {
      return memo + '/' + segment.value;
    }, '');
  }

  return {
    pattern: pattern,
    segments: segments,
    params: params,
    paramData: paramData,
    optionalParams: optionalParams,
    mandatoryParams: mandatoryParams
  };
}

exports.parsePattern = parsePattern;
