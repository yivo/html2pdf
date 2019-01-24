var _           = require('lodash');
var express     = require('express');
var app         = express();
var fs          = require('fs');
var temp        = require('temp-write');
var execute     = require('child_process').exec;
var shellescape = require('shell-escape');
var bodyparser  = require('body-parser');

app.use(bodyparser.json({ limit: '128mb' }));
app.use(bodyparser.urlencoded({ limit: '128mb', extended: true }));

app.use(express.json());

app.post('/', function(req, res) {
  function argumentize(name, value) {
    return '--' + name.replace(/_/g, '-') + ' ' + shellescape([_.toString(value)]);
  }

  var options = _.map(_.omit(req.body, 'html', 'url', 'header_html', 'footer_html'), function(value, name) {
    return argumentize(name, value);
  });

  _.each(['header_html', 'footer_html'], function(name) {
    console.log(_.isEmpty(_.trim(req.body[name])));
    if (_.isEmpty(_.trim(req.body[name]))) { return }
    if (_.toString(req.body[name]).match(/^https?:\/\//)) {
      options.push(argumentize(name, req.body[name]));
    } else {
      var path = temp.sync(_.toString(req.body[name]), 'template.html');
      var url  = 'file://' + path;
      setTimeout(function() { fs.unlink(path); }, 10 * 60 * 1000); // 10 minutes.
      options.push(argumentize(name, url));
    }
  });

  if (!_.isEmpty(req.body.url)) {
    var url = req.body.url;
  } else {
    var path = temp.sync(_.toString(req.body.html), 'index.html');
    var url  = 'file://' + path;
    setTimeout(function() { fs.unlink(path); }, 10 * 60 * 1000); // 10 minutes.
  }

  var command = 'wkhtmltopdf ' + options.join(' ') + ' ' + shellescape([url]) + ' - | cat';

  console.log('Executing ' + command);

  execute(command, { encoding: 'buffer', timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 1024 }, function(error, stdout, stderr) {
    stderr = _.trim(stderr.toString('UTF-8'));
    if (!_.isEmpty(stderr)) {
      console.log(stderr)
    }

    if (error != null || _.isEmpty(_.trim(stdout.toString('UTF-8')))) {
      console.log(error);
      return res.sendStatus(500);
    }

    console.log('Generated PDF.');
    res.contentType('application/pdf');
    res.send(stdout);
  });
});

var close = _.once(function() { server.close(); process.exit(); });
_.each(['SIGINT', 'SIGTERM'], function(signal) { process.on(signal, close); });

var port = process.env.APP_PORT || 8080;
var server = app.listen(port, function() {
  console.log('Server is listening on port %s.', port);
});
