// UDP 的收发两端

const UDP = require('dgram');
const Net = require('net');
const newShortID = _('Message.newShortID');
const packageMessage = _('Message.packageMessage');
const unpackMessage = _('Message.unpackMessage');

const DefaultConfig = {
	chunkSize: 4000,
	expire: 1000 * 60,
	lifespan: 1000 * 60 * 10,
	poolLimit: 100,
};
const Pipes = {};

const setConfig = cfg => {
	if (!cfg) return;
	if (Number.is(cfg.chunkSize) && cfg.chunkSize > 100) DefaultConfig.chunkSize = cfg.chunkSize;
	if (Number.is(cfg.expire) && cfg.expire > 1000) DefaultConfig.expire = cfg.expire;
	if (Number.is(cfg.lifespan) && cfg.lifespan > 1000) DefaultConfig.lifespan = cfg.lifespan;
	if (Number.is(cfg.poolLimit) && cfg.poolLimit > 0) DefaultConfig.poolLimit = cfg.poolLimit;
};

const onReceiveMessage = (msg, repo, callback) => {
	var now = Date.now();
	for (let id in repo) {
		let item = repo[id];
		if (now - item.stamp > DefaultConfig.expire) {
			delete repo[id];
		}
	}

	msg = unpackMessage(msg);
	repo[msg.id] = repo[msg.id] || {stamp: now, data: []};
	var r = repo[msg.id];
	r.data[msg.index] = msg.data;
	if (r.data.length < msg.count) return;
	if (r.data.filter(d => !!d).length < msg.count) return;

	var len = 0;
	r.data.forEach(d => len += d.byteLength);
	var data = Buffer.alloc(len);
	var offset = 0;
	r.data.forEach(d => {
		d.copy(data, offset);
		offset += d.byteLength;
	});
	delete repo[msg.id];
	callback(data, msg.id);
};

const createServer = (host, port, callback, onMessage, onError) => new Promise(res => {
	var isIPv4 = Net.isIP(host);
	if (!isIPv4) {
		let err = new Errors.ServerError.UnavailableHost('UDP 地址指定错误！');
		if (!!callback) callback(null, err);
		res([null, err]);
		return;
	}
	isIPv4 = Net.isIPv4(host);

	if (!Number.is(port)) {
		let err = new Errors.ServerError.UnavailablePort('UDP 端口指定错误！');
		if (!!callback) callback(null, err);
		res([null, err]);
		return;
	}

	var inited = false;
	var packages = [], repo = {};

	var send = (host, port) => {
		var pack = packages.shift();
		if (!pack) { // 信息已经全部发送完毕
			return;
		}
		server.send(pack, port, host, (err) => {
			if (!!err) {
				if (!!onError) onError(null, err);
				return;
			}
			send(host, port);
		});
	};

	var server = UDP.createSocket(isIPv4 ? 'udp4' : 'udp6');
	server.on('listening', () => {
		if (inited) return;
		inited = true;
		if (!!callback) callback(server, null);
		res([server, null]);
	});
	server.on('message', (data, remote) => {
		var socketID = remote.family + '/' + remote.address + '/' + remote.port;
		repo[socketID] = repo[socketID] || {};
		onReceiveMessage(data, repo[socketID], (data, mid) => {
			var message = data.toString();
			try {
				let temp = JSON.parse(message);
				data = temp;
			}
			catch {
				data = message;
			}
			if (!!onMessage) onMessage(data, remote, reply => {
				if (!packages) return;
				packages.push(...packageMessage(reply, DefaultConfig.chunkSize, mid));
				send(remote.address, remote.port);
			});
		});
	});
	// 绑定监听端口
	try {
		server.bind(port);
	}
	catch (err) {
		if (inited) return;
		inited = true;

		var e = new Errors.ServerError.CreateServerFailed('TCP 服务端创建失败！\n' + err.message);
		if (!!callback) callback(null, e);
		res([null, e]);
	}
});

const createClient = (host, port, message, callback, persist=false) => new Promise(res => {
	var isIPv4 = Net.isIP(host);
	if (!isIPv4) {
		let err = new Errors.ServerError.UnavailableHost('UDP 地址指定错误！');
		if (!!callback) callback(null, err);
		res([null, err]);
		return;
	}
	isIPv4 = Net.isIPv4(host);

	if (!Number.is(port)) {
		let err = new Errors.ServerError.UnavailablePort('UDP 端口指定错误！');
		if (!!callback) callback(null, err);
		res([null, err]);
		return;
	}

	var tag = host + ':' + port, mid = newShortID(), smid = mid.join('-');
	if (!!Pipes[tag]) {
		let pipe = Pipes[tag];
		pipe.cbs[smid] = (msg, err) => {
			if (!!callback) callback(msg, err);
			res([msg, err]);
		};
		pipe.sender(message, mid);
		return;
	}

	var packages = [], repo = {}, done;
	var timeoutter = null;
	var refresh = () => {
		cancel();
		if (persist) return;
		timeoutter = setTimeout(() => {
			suicide();
		}, DefaultConfig.expire);
	};
	var cancel = () => {
		if (!!timeoutter) {
			clearTimeout(timeoutter);
			timeoutter = null;
		}
	};

	var socket = UDP.createSocket(isIPv4 ? 'udp4' : 'udp6');
	socket.on('message', (msg, remote) => {
		var socketID = remote.family + '/' + remote.address + '/' + remote.port;
		repo[socketID] = repo[socketID] || {};
		onReceiveMessage(msg, repo[socketID], (data, mid) => {
			var message = data.toString();
			try {
				let temp = JSON.parse(message);
				data = temp;
			}
			catch {
				data = message;
			}
			if (persist) {
				let item = Pipes[tag];
				if (!!item && item.cbs) {
					let tid = mid.join('-');
					let cb = item.cbs[tid];
					delete item.cbs[tid];
					if (!!cb) cb(data, null);
				}
			}
			else {
				suicide();
				if (!!callback) callback(data, null);
				res([data, null]);
			}
		});
	});

	var suicide = () => {
		cancel();
		packages = null;
		repo = null;
		socket.close();
	};
	var send = () => {
		var pack = packages.shift();
		if (!pack) { // 信息已经全部发送完毕
			return;
		}
		refresh();
		socket.send(pack, port, host, (err) => {
			if (!!err) {
				if (persist) {
					let item = Pipes[tag];
					delete Pipes[tag];
					if (!!item && item.cbs) {
						for (let cb in item.cbs) {
							cb = item.cbs[cb];
							if (!!cb) cb(null, err);
						}
					}
				}
				else {
					if (!!callback) callback(null, err);
					res([null, err]);
				}
				suicide();
				return;
			}
			send();
		});
	};
	var sendData = (message, mid) => {
		var should = (packages.length === 0);
		packages.push(...packageMessage(message, DefaultConfig.chunkSize, mid));
		if (should) send();
	};

	sendData(message, mid);

	if (persist) {
		let item = {
			sender: sendData,
			cbs: {}
		};
		item.cbs[smid] = (msg, err) => {
			if (!!callback) callback(msg, err);
			res([msg, err]);
		};
		Pipes[tag] = item;
	}
});

module.exports = {
	config: setConfig,
	server: createServer,
	client: createClient
};