// WebSocket 事件的处理分两部分：
// 一部分是 Responsor 中注册的处理回调
// 另一部分是通过 Regiester 机制注册的监听者

const EventEmitter = require('events');
const IO = require('socket.io');
const ResponsorManager = require('./responser');
const Logger = new (_("Utils.Logger"))('WebSocket');

var io;
var eventLoop = new EventEmitter();
var sockets = [];

const init = (server) => {
	io = new IO(server);

	io.on('connection', socket => {
		sockets.push(socket);
		socket.on('disconnect', () => {
			var idx = sockets.indexOf(socket);
			if (idx >= 0) sockets.splice(idx, 1);
			eventLoop.emit('disconnected', null, socket);
		});
		socket.on('__message__', async msg => {
			var event = msg.event, data = msg.data, action = msg.action || 'get';
			if (Object.isBasicType(data)) data = {content: data};
			var tid = -1;
			if (!!msg.id) tid = msg.id;
			var [res, query] = ResponsorManager.match(event, action, 'socket');
			if (!!res) {
				let result = null;
				try {
					let remoteIP = socket.request.connection.remoteAddress;
					if (!!remoteIP.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/)) remoteIP = remoteIP.replace('::ffff:', '');
					result = await ResponsorManager.launch(res, data, query, event, socket, action, 'socket', remoteIP, 0);
					socket.send(tid, event, result);
				}
				catch (err) {
					socket.send(tid, event, {
						ok: false,
						code: err.code || 500,
						message: err.message
					});
					Logger.error(err);
				}
			}

			if (!!eventLoop.eventNames().includes(event)) {
				eventLoop.emit(event, data, socket, msg);
			}
			else if (!res) {
				socket.send(tid, event, null, 'Non-Listener Request');
			}
		});
		socket.send = (id, event, data, err) => {
			socket.emit('__message__', { id, event, data, err });
		};
		eventLoop.emit('connected', null, socket);
	});
};

const register = (event, responser) => {
	eventLoop.on(event, responser);
};
const unregister = (event, responser) => {
	eventLoop.off(event, responser);
};
const broadcast = (event, data) => {
	sockets.forEach(socket => {
		if (!socket) return;
		socket.send(-1, event, data);
	});
};

module.exports = {
	init,
	register,
	unregister,
	broadcast,
	get io () {
		return io
	}
};