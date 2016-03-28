var datastore = require('nedb')
  , path = require('path').resolve(__dirname, 'influx_1.db')
  , bufferdb = new datastore({ filename: path, autoload: true });


for (i=0; i<999; i++) {
  bufferdb.insert({value: i, quality: 0}, function (err, newDoc) {});
}

