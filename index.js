var _       = require('lodash');
var express = require('express');
var app     = express();
var fs      = require('fs');
var temp    = require('temp-write');
var execute = require('child_process').exec;
var quote   = require('shell-quote').quote;

app.use(express.json());

app.post('/', function(req, res) {
  var options = _.map(_.omit(req.body, 'html'), function(value, name) {
    return '--' + name.replace(/_/g, '-') + ' ' + quote([_.toString(value)]);
  }).join(' ');

  var path = temp.sync(_.toString(req.body.html), 'index.html');
  setTimeout(function() { fs.unlink(path); }, 1000 * 60 * 60); // One hour.

  var command = 'wkhtmltopdf ' + options + ' file://' + path + ' -';

  console.log('Executing ' + command);

  execute(command, function(error, stdout, stderr) {
    if (error !== null) {
      console.error(error);
      return res.status(500);
    } else {
      res.send(stdout);
    }
  });
});

var close = _.once(function() { server.close(); });
_.each(['SIGINT', 'SIGTERM'], function(signal) { process.on(signal, close); });

var port = process.env.APP_PORT || 8080;
var server = app.listen(port, function() {
  console.log('Server is listening on port %s.', port);
});
