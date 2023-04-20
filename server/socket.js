const EventEmitter = require('events');
const setStyle = _('CL.SetStyle');
const tcpManager = require('../kernel/tcp');
const udpManager = require('../kernel/udp');
const ResponsorManager = require('./responser');
const Logger = new (_("Utils.Logger"))('SocketManager');

const eventLoop = new EventEmitter();

const init = (config, callback) => {
	var tasks = {}, count = 0, success = 0;
	var cb = (task, ok) => {
		if (tasks[task]) return;
		tasks[task] = true;
		count --;
		if (ok) success ++;
		if (count !== 0) return;
		if (success === 0) {
			callback(new Errors.ConfigError.NoSocketServerAvailable());
		}
		else {
			callback();
		}
	};

	if (Number.is(config.port.tcp)) {
		count ++;
		tasks.tcp = false;

		tcpManager.server('127.0.0.1', config.port.tcp, (svr, err) => {
			if (!!err) {
				Logger.error('Launch TCP-Server Failed.');
				cb('tcp', false);
			}
			else {
				cb('tcp', true);
			}
		}, (msg, socket, resp) => {
			eventLoop.emit('message', 'tcp', socket.remoteAddress, socket.remotePort, msg, socket, resp);
		});
	}
	if (String.is(config.port.pipe)) {
		count ++;
		tasks.pipe = false;

		tcpManager.server(config.port.pipe, null, (svr, err) => {
			if (!!err) {
				Logger.error('Launch Pipe-Server Failed.');
				cb('pipe', false);
			}
			else {
				cb('pipe', true);
			}
		}, (msg, socket, resp) => {
			eventLoop.emit('message', 'pipe', '', 0, msg, socket, resp);
		});
	}
	if (Number.is(config.port.udp4)) {
		count ++;
		tasks.udp4 = false;

		udpManager.server('127.0.0.1', config.port.udp4, (svr, err) => {
			if (!!err) {
				Logger.error('Launch UDPv4-Server Failed.');
				cb('udp4', false);
			}
			else {
				cb('udp4', true);
			}
		}, (msg, socket, resp) => {
			eventLoop.emit('message', 'udp', socket.address, socket.port, msg, socket, resp);
		});
	}
	if (Number.is(config.port.udp6)) {
		count ++;
		tasks.udp6 = false;

		udpManager.server('::1', config.port.udp6, (svr, err) => {
			if (!!err) {
				Logger.error('Launch UDPv6-Server Failed.');
				cb('udp6', false);
			}
			else {
				cb('udp6', true);
			}
		}, (msg, socket, resp) => {
			eventLoop.emit('message', 'udp', socket.address, socket.port, msg, socket, resp);
		});
	}

	if (count === 0) {
		callback(new Errors.ConfigError.NoPorts());
	}
	else {
		eventLoop.on('message', async (protocol, host, port, msg, socket, resp) => {
			if (!msg || !msg.event) {
				resp({
					ok: false,
					code: 500,
					message: "ERROR:NOEVENT"
				});
				return;
			}

			var event = msg.event, data = msg.data, action = msg.action || 'get';
			if (Object.isBasicType(data)) data = {content: data};
			var reg = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
			if (!!reg) host = reg[1];
			var [res, query] = ResponsorManager.match(event, action, protocol);
			if (!!res) {
				let result = null;
				try {
					result = await ResponsorManager.launch(res, data, query, event, socket, action, protocol, host, port);
					resp(result);
				}
				catch (err) {
					Logger.error(err);
					resp({
						ok: false,
						code: err.code || 500,
						message: err.message
					});
				}
			}
			else {
				let err = new Errors.ConfigError.NoResponsor('URL: ' + event);
				Logger.error(err);
				resp({
					ok: false,
					code: err.code,
					message: err.message
				});
			}
		});
	}
};

module.exports = init;