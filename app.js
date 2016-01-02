// "use strict";

var gui = require('nw.gui');
var CustomTrayMenu = require('./bin/custom_tray_menu');

var fs = require('fs');


// var io = require('socket.io')(8080);
var serialport = require('serialport');
var SerialPort = serialport.SerialPort; // localize object constructor

// Extend application menu for Mac OS
if (process.platform == "darwin") {
    var menu = new gui.Menu({
        type: "menubar"
    });
    menu.createMacBuiltin && menu.createMacBuiltin(window.document.title);
    gui.Window.get().menu = menu;
}

var customTray;

document.addEventListener('DOMContentLoaded', function() {
    // $('#add-tray').addEventListener('click', function () {
    if (!customTray) {
        customTray = new CustomTrayMenu('./assets/views/custom-tray-menu.html', './assets/images/tray.png', {
            width: 185,
            height: 143
        });
    }
    // });

    // $('#remove-tray').addEventListener('click', function () {
    //   if (customTray) {
    //     customTray.remove();
    //     customTray = undefined;
    //   }
    // });

    // bring window to front when open via terminal
    gui.Window.get().focus();

    // for nw-notify frameless windows
    gui.Window.get().on('close', function() {
        gui.App.quit();
    });
});

var writeLog = function(msg, type) {
    var logElement = $("#output");
    logElement.html(`<span class=${type}>${msg}</span><br>` + logElement.html());
    logElement.scrollTop = logElement.scrollHeight;
};

process.on('log', function(message) {
    writeLog(message);
});

// print error message in log window
process.on("uncaughtException", function(exception) {
    var stack = exception.stack.split("\n");
    stack.forEach(function(line) {
        writeLog(line, 'error');
        process.stdout.write(String(line) + "\n");
    });
});


$(document).ready(function() {

    function setDynamicOptions(selector, options, a, dropdown) {
        var att = "data-dynamic-opt";
        // var att = "";
        $(selector).find('[' + att + ']').remove();
        var html = $(selector + ' .menu').html();
        for (var key in options) {
            if (a) {
                html += '<a class="item" data-value="' + options[key] + '" ' + att + '>' + options[key] + '</a>';
            } else {
                html += '<div class="item" data-value="' + options[key] + '" ' + att + '>' + options[key] + '</div>';
            }
        }
        $(selector + ' .menu').html(html);
        if (dropdown) {
            $(selector).dropdown();
        }
    };

    var comNames = [],
        device = null,
        baudrate = [9600, 57600, 115200, 230400],
        protocols = [],
        receivedCount = 0;


    // protocols
    var requestProtocols = function() {

        fs.readFile('./config/protocols.json', function(error, data) {
            if (error) {
                writeLog(error, 'error');
            } else {
                protocols = JSON.parse(data);
                console.log(protocols);

                var _protocol = protocols.protocols,
                    _dynamic = [];
                for (var key in _protocol) {
                    if (_protocol.hasOwnProperty(key)) {
                        _dynamic.push(key);
                    };
                }

                setDynamicOptions('#protocol-list', _dynamic, true, true);
            };
        });
    };

    String.prototype.prefix = function(str) {
        return this.substring(0, str.length) == str;
    }

    var _selected = null;

    var selectProtocol = function(_protoName) {
        _selected = protocols.protocols[_protoName];

        var updateInterface = function(key, value, selector) {
            if (value !== false) {
                selector.children('.button').addClass('blue').next('.label').addClass('blue').html(value);
            } else {
                selector.children('.button').removeClass('blue').next('.label').removeClass('blue').html("null");
            };

        }

        $('#protocol-prefix-list').html('<div class="ui teal label">Prefix</div>');
        _selected.prefix.forEach(function(element) {
            $('#protocol-prefix-list').append($('<div class="ui teal basic label"></div>').html(element.comment));
            // updateInterface(element, _selected[element], $('#protocol-' + element));
        });

        var _operands = [];
        for (var key in _selected.operands) {
            if (_selected.operands.hasOwnProperty(key)) {
                _operands.push(key);
            }
        }

        setDynamicOptions('#operands-list', _operands, true, false);
    }

    $('#protocol-list').on('click', 'a', function() {
        var _obj = $($(this)[0]),
            _protoName = _obj.data('value');
        // if (_obj.data('value').prefix('Proto')) {
        // _protocol = protocols.protocol_specs.protocol;
        selectProtocol(_protoName);

    });

    var _operand = null;

    $('#operands-list').on('click', 'a', function() {
        if (_selected === null) {
            writeLog('something wrong happened', 'error');
            return;
        };

        var _obj = $($(this)[0]),
            _operandName = _obj.data('value');
        _operand = _selected.operands[_operandName];

        // console.log(_operand)

        var _html = '<div class="small ui teal button">Enums</div>';
        _html += '<div class="small ui teal basic button">' + _operandName + '</div>';
        for (var i = 0; i < _operand.enums.length; i++) {
            _html += '<div class="small ui labeled input enum" data-key="' + i + '"><div class="ui label">' + _operand.enums[i].comment + '</div><input type="text" width="20"></div>'
        }
        $('#enums-list').html(_html);
    });

    requestProtocols();

    var sendData = function(data) {
        if (data.hex.length == 0) {
            writeLog('no data', 'error');
            return;
        };
        if (data.hex.length % 2 != 0) {
            data.hex += '0';
        }
        data.buf = new Buffer(data.hex.length / 2);
        for (var i = 0; i < data.hex.length; i += 2) {
            data.buf.writeUInt8(parseInt(data.hex[i] + data.hex[i + 1], 16), i / 2);
        };
        if (device !== null && device.isOpen()) {
            device.write(data.buf, function(error) {
                if (error) {
                    writeLog(error, 'error');
                }
            });
        } else {
            writeLog('serial port do not open', 'error');
        };
    };


    var generatePackage = function(_selected, _operand) {
        var hex = _operand.value;

        // console.log(_selected, _operand);

        var extractEnums = function() {
            // console.log("extracting enums");
            var hex = "";
            for (var i = 0; i < _operand.enums.length; i++) {
                var _str = $('#enums-list .enum[data-key="' + i + '"] input').val();

                // TODO: verify _str

                hex += _str;
            }
            return hex;
        };

        var applyPrefix = function(_hex) {
            var hex = _hex;
            // TODO:apply prefix

            for (var i = 0; i < _selected.prefix.length; i++) {
                var _fx = (eval('(function(){return ' + _selected.prefix[i].todo + ';})()'));
                hex = _fx(hex);
                // console.log('[' + _selected.prefix[i].comment + '] ' + hex);
            }

            return hex;
        };

        // TODO: handle error

        hex += extractEnums();

        hex = applyPrefix(hex);

        input = hex;
        refreshInput();

        if ($('#auto-send-button').hasClass('teal')) {
            sendData({
                hex: $('#input-hex').val().replace(/\s+/g, ""),
            });
        };
    };

    $('#operation-list').on('click', "#generate-button", function() {
            if (_selected == null) {
                writeLog('select a protocol first', 'error');
                return;
            }
            if (_operand == null) {
                writeLog('select a operand first', 'error');
                return;
            }
            generatePackage(_selected, _operand);
        })
        .on('click', "#send-button", function() {
            // $('#send-button').click(function() {
            var data = {
                hex: $('#input-hex').val().replace(/\s+/g, ""),
            };
            sendData(data);
        });

    $('#auto-send-button').click(function() {
        if ($(this).hasClass('basic')) {
            $(this).addClass('teal').removeClass('basic');
        } else {
            $(this).addClass('basic').removeClass('teal');

        }
    })

    // ports
    function refreshPortList() {
        writeLog('refresh port list');
        comNames = [];


        serialport.list(function(err, ports) {
            if (err) {
                writeLog(err, 'error');
            } else {
                ports.forEach(function(port) {
                    comNames.push(port.comName);
                    setDynamicOptions('#port-list', comNames, false, true);
                    // $('#port-list .menu').append($('div').addClass('item').html(port.comName));
                    // $('#port-list').dropdown();
                    // writeLog(port.comName);
                    // comNames.push(port.comName);
                });
            };
        });
    };

    $('#refresh-port-button').click(function() {
        refreshPortList();
    });

    refreshPortList();

    // $('.ui.dropdown').dropdown();
    // $('.ui.radio.checkbox').checkbox();
    // $('.ui.checkbox').checkbox();

    $('#baudrate-list').dropdown();

    $('#device-list').dropdown();

    $('#open-inspector-button').click(function() {
        var win = gui.Window.get();
        win.showDevTools();
    });

    var connectSerialPort = function(config, close) {

        if (device !== null && device.isOpen()) {
            writeLog('Closing Serial Port [ ' + device.path + ' ]');
            device.close(function() {

                $('#connect-button').removeClass('positive').html('Connect');

                writeLog('Closed Serial Port [ ' + device.path + ' ]');
                device = null;
            });

        };
        if (close == true) {
            return;
        };

        device = new SerialPort(config.port, {
            baudRate: config.baudRate,
        }, false);

        device.open(function(error) {
            if (error) {
                writeLog('failed to open [ ' + error + ' ]', 'error');
            } else {

                $('#connect-button').addClass('positive').html('Disconnect');

                writeLog('Opened Serial Port [ ' + device.path + ' ]');
                // socket.emit('serialPortOpen', device.path);
                device.on('data', function(data) {
                    receivedCount += data.length || 0;
                    for (var i = 0; i < data.length; i++) {
                        var _hex = data.readUInt8(i).toString(16).toUpperCase();
                        if (_hex.length == 1) {
                            _hex = '0' + _hex;
                        }
                        pushHex(_hex);
                    }
                });

            }
        });
    };

    $('#connect-button').click(function() {

        if (device !== null && device.isOpen()) {
            connectSerialPort(config, true);

        }

        if (typeof $('#port-list').dropdown('get value') == 'object' || typeof $('#baudrate-list').dropdown('get value') == 'object') {
            writeLog('serial port error', 'error');
            return;
        }

        var config = {
            port: String($('#port-list').dropdown('get value')),
            baudRate: Number($('#baudrate-list').dropdown('get value')),
        }

        writeLog('connect [ ' + config.port + ' ] at [ ' + config.baudRate + ' ]');

        connectSerialPort(config, true);

    });



    $('.ui.dropdown').dropdown();

    var flow = [];

    var pushHex = function(hex) {
        var chr = String.fromCharCode(parseInt(hex, 16));
        flow.push({
            hex: hex,
            chr: chr,
        });
        $('#flow-hex').append($('<div></div>').html(hex).attr('id', 'hex_' + String(flow.length)).addClass('item').addClass('hex'));
        $('#flow-hex').scrollTop($('#flow-hex')[0].scrollHeight);

        $('#flow-ascii').append($('<div></div>').html(chr).attr('id', 'ascii_' + String(flow.length)).addClass('item').addClass('ascii'));
        $('#flow-ascii').scrollTop($('#flow-ascii')[0].scrollHeight);
    };

    var input = "",
        refreshInput = function() {
            var _hex = "",
                _ascii = "",
                _count = 0;
            for (var i = 0; i < input.length; i++) {
                if ((input[i] >= 0 && input[i] <= 9) || (input[i] >= 'A' && input[i] <= 'F')) {
                    _hex += input[i];
                    _count++;
                    if (_count % 2 == 0) {
                        var chr = String.fromCharCode(parseInt(_hex.substring(_hex.length - 2, _hex.length), 16));
                        _ascii += chr;
                        _hex += ' ';
                    }
                }
            }
            $('#input-hex').val(_hex);
            $('#input-ascii').val(_ascii);
        };

    $('.data-flow').on('keydown', '#input-hex', function(event) {
        switch (event.keyCode) {
            case 8:
                {
                    input = input.substring(0, input.length - 1);
                    refreshInput();
                    break;
                };
            case 13:
                {
                    $('#send-button').click();
                    break;
                };
            default:
                break;
        };
    });

    $('#input-hex').bind('input propertychange', function() {
        input = $('#input-hex').val().toUpperCase().replace(/\s+/g, "");
        refreshInput();
    });

    $('#input-ascii').bind('input propertychange', function() {
        var _val = $('#input-ascii').val();
        input = "";
        for (var i = 0; i < _val.length; i++) {
            input += _val.charCodeAt(i).toString(16).toUpperCase();
        }
        refreshInput();
    });

    $('#auto-detect-button').click(function() {

        var connectTimeout = 20;

        connectSerialPort(null, true);

        writeLog('start auto detect program', 'blue');
        refreshPortList();

        if ($('#auto-send-button').hasClass('basic')) {
            $('#auto-send-button').addClass('teal').removeClass('basic');
        }

        var _ap = [],
            _al = [],
            temp = 0,
            config = null;

        var copyPortsList = function() {
            // _ap = comNames;

            setTimeout(function() {
                findAvailablePorts(0)
            }, 1);
        }

        var findAvailablePorts = function(i) {
            if (device !== null && device.isOpen()) {
                _ap.push(comNames[i - 1]);
            };

            if (i < comNames.length) {

                config = {
                    port: comNames[i],
                    baudRate: 9600,
                }
                connectSerialPort(config, false);

                setTimeout(
                    function(k) {
                        return function() {
                            findAvailablePorts(k)
                        };
                    }(i + 1),
                    10
                );
            } else {
                connectSerialPort(config, true);
                generate();
            };
        };

        var generate = function() {
            // generate attempt list
            for (var i = 0; i < _ap.length; i++) {
                for (var j = 0; j < baudrate.length; j++) {
                    for (var k in protocols.protocols) {
                        if (protocols.protocols.hasOwnProperty(k)) {
                            _al.push({
                                port: _ap[i],
                                baudRate: baudrate[j],
                                protocol: k,
                                selected: protocols.protocols[k],
                                operand: protocols.protocols[k].operands[protocols.protocols[k]['auto-detect'].operand]
                            });
                        };
                    };
                };
            };

            setTimeout(function() {
                attempt(0)
            }, connectTimeout);
        };

        var probe = function(i) {
            if (receivedCount != temp) {
                writeLog('detected [ ' + config.port + ' : ' + config.baudRate + ' ] as [ ' + config.protocol + ' ]', 'blue');
                selectProtocol(config.protocol);

            } else {
                // if received
                writeLog('failed', 'blue');
                connectSerialPort(null, true);

                setTimeout(
                    function(k) {
                        return function() {
                            attempt(k)
                        };
                    }(i),
                    10
                );
            }
        }

        var attempt = function(i) {

            if (device !== null && device.isOpen()) {
                writeLog('attempt to probe', 'blue');
                // send probe package
                temp = receivedCount;
                generatePackage(config.selected, config.operand);
                generatePackage(config.selected, config.operand);
                generatePackage(config.selected, config.operand);
                setTimeout(
                    function(k) {
                        return function() {
                            probe(k)
                        };
                    }(i),
                    connectTimeout
                );
            } else {
                if (i < _al.length) {
                    config = _al[i];

                    writeLog('attempt to connect [ ' + config.port + ' : ' + config.baudRate + ' ]', 'blue');

                    connectSerialPort(config, false);

                    setTimeout(
                        function(k) {
                            return function() {
                                attempt(k)
                            };
                        }(i + 1),
                        connectTimeout
                    );
                } else {
                    writeLog('auto-detect failed', 'error');
                };
            };
        };

        setTimeout(function() {
            copyPortsList()
        }, 100);

    });

});
