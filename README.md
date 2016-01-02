# nodeTerm
nodeTerm is a terminal for communication with hardware connected to serial ports based on nw.js &amp; node-serialport

# environment
```
node.js@0.12.3
npm@3.5.2
```

# install dependencies
```
Enter working directory, execute command

$ sudo npm install nw-gyp -g
$ sudo npm install node-pre-gyp -g

$ npm install
$ cd node_modules/serialport/
$ node-pre-gyp rebuild --runtime=node-webkit --target=0.12.3
```

# run
```
npm start
```

# how to package
[How-to-package-and-distribute-your-apps](https://github.com/nwjs/nw.js/wiki/How-to-package-and-distribute-your-apps)