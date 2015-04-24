'use strict';

var async = require('async'),
  readOptions = require('./options'),
  ConfigReader = require('./config-reader');

/**
 * Booticorn: App-booting unicorn. Gives your express app super powers.
 * @param {object} options Options
 * @param {function} cb `callback(error, app)`
 */
module.exports = function Booticorn(options, cb) {
  var aborted = false;

  if (!cb) {
    cb = function (error) {
      if (error) {
        throw error;
      }
    };
  }

  var timeout = setTimeout(function () {
    aborted = true;
    cb(new Error('Timeout while initializing app.'));
  }, options.bootTimeout);

  var configReader = new ConfigReader();

  var taskContext = {};

  function makeTask(fn) {
    return function (taskCb) {
      if (aborted) {
        taskCb();
        return;
      }

      try {
        fn.call(taskContext, taskCb);
      } catch (error) {
        taskCb(error);
      }
    };
  }

  taskContext.options = options;
  taskContext.configReader = configReader;
  taskContext.makeTask = makeTask;

  /*
   * "The little unicorn" …
   */
  var tasks = [];

  /*
   * Chapter 1.
   * And the developer said, Let there be light. But wait. No light without some adjustable options.
   * Wouldn't it be super cool to change the colour?
   */
  tasks.push(makeTask(readOptions));

  /*
   * Chapter 2.
   * And then. Suddenly. In the middle of the universe. A new unicorn is born.
   */
  tasks.push(makeTask(require('./setup/app')));

  /*
   * Chapter 3.
   * Her parents will keep good care of her and observe all the steps she take.
   */
  tasks.push(makeTask(require('./setup/server')));

  /*
   * Chaper 4.
   * As our unicorn grows, she writes everything that happens in her life, her feelings and
   * activities, into her very own, colourfully decorated diary.
   */
  tasks.push(makeTask(require('./setup/logger')));

  /*
   * Chaper 5.
   * In the world of unicorns, there is no anarchy. There are laws and regulations. And sometimes,
   * our litle unicorn needs to lookup what she may do or not. At least her parents tell her so.
   */
  tasks.push(makeTask(configReader.readConfig));

  /*
   * Chapter 6.
   * Our unicorn has many friends. Of course she invites them all to her birthday party.
   */
  tasks.push(makeTask(require('./setup/services')));

  /*
   * Chapter 7.
   * Unicorns like templates, yep, they love 'em! So delicious!
   */
  tasks.push(makeTask(require('./setup/templating')));

  /*
   * Chapter 8.
   * Unicorns are born with excellent embellishments. They can swing the silverware.
   */
  tasks.push(makeTask(require('./setup/asset-helpers')));

  /*
   * Chapter 9.
   * Our little unicorn loves to collect all sorts of stuff. She always carries a huge bag where she
   * stores all the wonderful things she finds. Once, she found a bag of coffee. Of course she
   * picked it up and tasted it. It smell wonderful, but its taste was terrible. The next day her
   * belly ached so much she knew that coffee was bad for her. From that time, whenever she saw
   * coffee, she took it and threw it in the next wastebin she found, so that nobody else would
   * experience what she did.
   */
  tasks.push(makeTask(require('./setup/module-manager')));

  /*
   * Chapter 10.
   * A unicorn doesn't like to be involved in conflicts. But sometimes it just happens. But no
   * worries, she uses her superpowers to maintain an invisible shield around her keeping her safe
   * from all the harmful in the world.
   */
  tasks.push(makeTask(require('./setup/firewall')));

  /*
   * Chapter 11.
   * Despite templates, middleware and crunchy modules are what unicorns eat for breakfast!
   */
  tasks.push(makeTask(require('./setup/modules')));

  /*
   * Chapter 12.
   * Unicorns need to know the paths that keep them far away from all the witches. Our unicorn
   * always has some maps with her so she can lookup the fastest and safest routes.
   */
  tasks.push(makeTask(require('./setup/routing')));

  /*
   * Chapter 13.
   * But even when witches are around, our young unicorn knows how to defend herself. At least, she
   * was born with superpowers. Rainbows to the rescue! They always help.
   */
  tasks.push(makeTask(require('./setup/custom-tasks')));

  /*
   * Chapter 14.
   * Finally, there comes the time when our tiny unicorn wants to explore the world. And as she
   * goes away, all her friends cried. But our unicorn didn't cry. She was so curious about what she
   * would see that nobody could stop her. By the way, didn't you know that our unicorn owns a
   * mobile phone that can act as a HTTP server, too? Just visit her website and read her stories!
   */
  tasks.push(makeTask(require('./setup/start-server')));

  async.series(tasks, function (error) {
    if (aborted) {
      return;
    }

    if (error) {
      cb(error);
      return;
    }

    clearTimeout(timeout);
    cb(null, taskContext.app);
  });
};
