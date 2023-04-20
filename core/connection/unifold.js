// Author:  LostAbaddon
// Version: 0.1
// Date:    2019.07.02
//
// 监听线程管理平台，用于在监听线程中对数据进行收发，并将结果传给主线程中的接口
// 每个监听线程中只能有一个Unifold，不同的协议-端口绑定在不同线程上，彼此不通信

require('../index');
const Thread = require('worker_threads').Worker;
const Parent = require('worker_threads').parentPort;
const Data = require('worker_threads').workerData;
global.config = Data.config; // 先后顺序不能换
const UDP = require('dgram');
const Net = require('net');

const postMsg = (type, data) => {
	Parent.postMessage({ type, data });
};
Parent.on('message', (msg) => {
	var socket = msg.remote.protocol + ':' + msg.remote.address + ':' + msg.remote.port;
	socket = responsors[socket];
	if (!socket) return;
	socket.write(msg.msg);
});

var Status = Symbol.set('IDLE', 'WAITING', 'WORKING', 'TERMINATED');
var Current = Status.IDLE;

var socket, responsors = {};
if (Data.protocol === 'tcp') {
	let handler = remote => {
		var address = remote.remoteAddress;
		var ip4 = address.match(/\d+\.\d+\.\d+\.\d+/);
		if (!!ip4) address = ip4[0];
		var port = remote.remotePort;
		var contentMap = {};
		var id = 'tcp:' + address + ':' + port;
		responsors[id] = remote;

		remote.on('data', msg => {
			if (Current === Status.TERMINATED) {
				remote.destroy();
				return;
			}

			// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)+DATA
			var fid = [msg[0], msg[1]];
			var sig = msg[2];
			if (sig !== 3) return;
			var tid = msg.subarray(3, 18);
			var mid = tid.toString('base64');
			var info = contentMap[mid];
			if (!info) {
				info = { start: Date.now(), content: [] };
				contentMap[mid] = info;
			}
			var content = info.content;
			var count = bytes2uint(msg.subarray(18, 22));
			var index = bytes2uint(msg.subarray(22, 26));
			var context = msg.subarray(26, msg.length);
			content[index] = context;

			// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)
			var reply = array2buffer([fid[0], fid[1], 4, ...tid]);
			reply = reply.concat(uint2bytes(count, 4));
			reply = reply.concat(uint2bytes(index, 4));
			remote.write(reply);

			if (index < count - 1) return; // 如果没有传送完

			let data = content[0];
			let miss = !data;
			if (!miss) for (let i = 1; i < count; i ++) {
				let c = content[i];
				if (!c) {
					miss = true;
					break;
				}
				data = data.concat(c);
			}

			// 如果中间有数据缺失
			if (miss) {
				// 块结构：FID(2)+SIG(1)+MID(15)
				reply = array2buffer([fid[0], fid[1], 5, ...tid]);
				remote.write(reply);
				return;
			}

			postMsg('message', {
				sender: {
					address: address,
					port: port,
					protocol: Data.protocol
				},
				message: data,
				timestamp: {
					start: info.start,
					finish: Date.now()
				}
			});
			content = null;
			delete contentMap[mid];
		});
		remote.on('error', err => {
			console.error(err);
			remote.end();
		});
		remote.on('close', () => {
			delete responsors[id];
		});
	};
	let onInit = () => {
		inited = true;
		if (Current === Status.TERMINATED) return;
		Current = Status.IDLE;
		Data.port = socket.address().port;
		if (!Data.title) Data.title = Data.protocol + '-' + Data.port;
		postMsg('init', {
			port: Data.port,
			title: Data.title
		});
	};

	let inited = false;
	socket = Net.createServer(handler);
	socket.on('error', err => {
		if (inited) return;
		inited = true;
		console.error(err);
		postMsg('init', {
			port: 0,
			title: '',
			err: err.message
		});
	});
	// 绑定监听端口
	socket.listen(Data.port, onInit);
} else {
	socket = UDP.createSocket(Data.protocol);
	socket.on('listening', () => {
		if (Current === Status.TERMINATED) return;
		Current = Status.IDLE;
		Data.port = socket.address().port;
		if (!Data.title) Data.title = Data.protocol + '-' + Data.port;
		postMsg('init', {
			port: Data.port,
			title: Data.title
		});
	});
	socket.on('message', (msg, remote) => {
		if (Current === Status.TERMINATED) return;

		// 判断是否是握手信息
		if (msg.length !== 3) return;
		msg = Uint8Array.fromBuffer(msg);
		if (msg[2] !== 1) return;
		msg = [msg[0], msg[1]];

		new Listener(msg, remote);
	});
	// 绑定监听端口
	socket.bind(Data.port);
}

const array2buffer = arr => Buffer.from(new Uint8Array(arr));
const bytes2uint = bytes => {
	var num = 0, len = bytes.length;
	for (let i = 0; i < len; i ++) {
		num = num * 256 + bytes[i];
	}
	return num;
}
const uint2bytes = (num, len) => {
	var bytes = [];
	for (let i = 0; i < len; i ++) {
		bytes[len - 1 - i] = num & 255;
		num >>= 8;
	}
	return array2buffer(bytes);
};

class Listener {
	#status = Status.IDLE;
	#socket;
	#address;
	#port;
	#taskID;
	#blockCount;
	#contentSize;
	#contents = [];
	#timer = null;
	#start = 0;
	#finish = 0;
	constructor (mid, remote, isTCP = false) {
		Listener.Bundle.add(this);

		this.#address = remote.address;
		this.#port = remote.port;
		this.#start = Date.now();

		this.#socket = UDP.createSocket(Data.protocol);
		this.#socket.on('message', (msg, remote) => {
			this.onMessage(msg, remote);
		});
		var msg = [...mid, 2];
		msg = new Uint8Array(msg);
		msg = msg.toBuffer();
		this.#socket.send(msg, this.#port, this.#address);
		this.#status = Status.WORKING;
		this.keepAlive();
	}
	keepAlive () {
		if (!!this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#status = Status.TERMINATED;
			// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)
			if (!!this.#socket) {
				let order = array2buffer([0, 0, 255]);
				this.#socket.send(order, this.#port, this.#address, () => {
					this.#socket.close();
					this.#socket = null;
					Listener.Bundle.delete(this);
				});
			} else {
				Listener.Bundle.delete(this);
			}
		}, config.timeout);
	}
	suicide () {
		if (this.#status === Status.TERMINATED) return;
		this.#status = Status.TERMINATED;
		try {
			this.#socket.close();
		} catch {}
		this.#socket = null;
		this.#taskID = null;
		this.#contents = null;
	}
	onMessage (msg, remote) {
		if (this.#status === Status.TERMINATED) {
			this.keepAlive();
			return;
		}
		this.#status = Status.WORKING;

		// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)+DATA
		var fid = [msg[0], msg[1]];
		var sig = msg[2];
		if (sig !== 3) return;
		var mid = [...Uint8Array.fromBuffer(msg.subarray(3, 18))];
		if (!this.#taskID) {
			this.#taskID = mid.copy();
			this.#contents = [];
		} else if (!this.#taskID.equal(mid)) {
			return;
		}
		var count = bytes2uint(msg.subarray(18, 22));
		var index = bytes2uint(msg.subarray(22, 26));
		var content = msg.subarray(26, msg.length);

		this.keepAlive();
		this.#contents[index] = content;

		// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)
		var reply = array2buffer([fid[0], fid[1], 4, ...this.#taskID]);
		reply = reply.concat(uint2bytes(count, 4));
		reply = reply.concat(uint2bytes(index, 4));
		this.#socket.send(reply, this.#port, this.#address);

		// 如果所有块都已接受
		if (index + 1 === count) {
			this.#finish = Date.now();
			let data = this.#contents[0];
			let miss = !data;
			if (!miss) for (let i = 1; i < count; i ++) {
				let c = this.#contents[i];
				if (!c) {
					miss = true;
					break;
				}
				data = data.concat(c);
			}
			// 如果有数据丢失
			if (miss) {
				// 块结构：FID(2)+SIG(1)+MID(15)
				reply = array2buffer([fid[0], fid[1], 5, ...this.#taskID]);
				this.#socket.send(reply, this.#port, this.#address);
				return;
			}

			postMsg('message', {
				sender: {
					address: remote.address,
					port: remote.port,
					protocol: Data.protocol
				},
				message: data,
				timestamp: {
					start: this.#start,
					finish: this.#finish
				}
			});
			this.#taskID = null;
			this.#contents = null;
			this.#status = Status.WAITING;
		}
	}
}
Listener.Bundle = new Set(); // 所有活跃连接
Listener.Status = Status;