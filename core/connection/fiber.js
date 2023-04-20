// Author:  LostAbaddon
// Version: 0.1
// Date:    2019.07.02
//
// 发送数据模块

const UDP = require('dgram');
const Net = require('net');

const AvailableProtocols = ['tcp', 'udp4', 'udp6'];
const Errors = {
	UnavailableProtocol: new Error('Unavailable Protocol'),
	ShakeHandTimeout: new Error('ShakeHand Timeout'),
	SendDataTimeout: new Error('Send Data Timeout'),
	RemoteClosed: new Error('Remote Closed'),
	Unexpected: new Error('Unexpected Error')
};
const Status = Symbol.set('IDLE', 'CONNECTING', 'WORKING', 'TERMINATED');
const PrintError = false;

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

var FiberID = [Math.floor(Math.range(256)), Math.floor(Math.range(256))];
const newFID = () => {
	var id = [...FiberID];
	FiberID[1] ++;
	if (FiberID[1] === 256) {
		FiberID[1] = 0;
		FiberID[0] ++;
		if (FiberID[0] === 256) FiberID[0] = 0;
	}
	return id;
};

class Fiber {
	#status = Status.IDLE;
	#address = '';
	#port = 0;
	#respPort = 0;
	#protocol = '';
	#name = '';
	#mid;
	#fid;
	#blocks = [];
	#bindex = 0;
	#socket = null;
	#timer = null;
	#update = Date.now();
	#retried = 0;
	#callback = null;
	#isTCP = false;
	get status () {
		return this.#status;
	}
	get name () {
		return this.#name;
	}
	get address () {
		return this.#address;
	}
	get port () {
		return this.#port;
	}
	get protocol () {
		return this.#protocol;
	}
	get timestamp () {
		return this.#update;
	}
	keepAlive () {
		if (!this.#timer) return;
		clearTimeout(this.#timer);
	}
	suicide () {
		return new Promise(async res => {
			if (this.#status === Status.TERMINATED) return res();
			await this.close();
			if (!!this.#socket && !this.#isTCP) this.#socket.close();
			this.#socket = null;
			this.#blocks = null;
			this.#mid = null;
			this.#fid = null;
			this.#update = Date.now();
			this.#callback = null;
			this.#status = Status.TERMINATED;
			res();
		});
	}
	setup () {
		return new Promise(res => {
			this.#status = Status.CONNECTING;
			if (this.#isTCP) {
				this.#retried = 0;
				this.keepAlive();
				let closer = async () => {
					var callback = this.#callback;
					await this.suicide();
					if (!!callback) callback(false, Errors.SendDataTimeout);
					if (PrintError) console.error("Send Data Timeout");
				};
				let delay = config.timeout.last;
				let closeDelay = delay * (1 + config.retry) / 2;
				this.#timer = setTimeout(closer, closeDelay);

				this.#socket = Net.createConnection({ host: this.#address, port: this.#port })
				.on('close', async hadError => {
					if (this.#status === Status.TERMINATED) {
						this.keepAlive();
						return;
					}
					let callback = this.#callback;
					await this.suicide();
					if (!!callback) callback(false, Errors.RemoteClosed);
				})
				.on('error', async err => {
					if (this.#status === Status.TERMINATED) {
						this.keepAlive();
						return;
					}
					// 建立连接失败，重新尝试连接
					if (err.code === 'ECONNREFUSED') { // 建立通讯失败
						this.#retried ++;
						if (this.#retried === config.retry) {
							await this.suicide();
							res(Errors.ShakeHandTimeout);
						} else {
							this.#socket.connect(this.#port, this.#address);
						}
					} else if (err.code === 'ERR_STREAM_DESTROYED') { // 如果信道被接收端关闭
						let callback = this.#callback;
						await this.suicide();
						if (!!callback) callback(false, Errors.RemoteClosed);
					} else { // 发送数据失败
						this.#retried ++;
						if (this.#retried === config.retry) {
							let callback = this.#callback;
							await this.suicide();
							if (!!callback) callback(false, Errors.SendDataTimeout);
							if (PrintError) console.error("Error (" + err.code + ") while send data: " + err.message);
						} else if (this.#status === Status.CONNECTING) {
							let callback = this.#callback;
							await this.suicide();
							if (!!callback) callback(false, Errors.ShakeHandTimeout);
							if (PrintError) console.error("TCP Shakehand Timeout");
						} else if (this.#status === Status.WORKING) {
							this.sendData();
						} else {
							let callback = this.#callback;
							await this.suicide();
							if (!!callback) callback(false, Errors.Unexpected);
							if (PrintError) console.error("Unexpected Error");
						}
					}
				})
				.on('connect', () => {
					this.keepAlive();
					this.#timer = setTimeout(closer, closeDelay);
					res(null);
				})
				.on('data', msg => {
					if (this.#status === Status.TERMINATED) return;

					// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)
					var fid = [];
					fid = msg.subarray(0, 2);
					fid = [...fid];
					// 收到接收端主动发来的回复，FID 为空，但信息依然需要接受处理
					if (!!this.#fid && (fid[0] !== this.#fid[0] || fid[1] !== this.#fid[1])) return;
					var sig = msg[2];
					if (sig !== 4) return;
					var mid = msg.subarray(3, 18).toString('base64');
					if (mid !== this.#mid) return;
					var count = bytes2uint(msg.subarray(18, 22));
					var total = this.#blocks.length;
					if (count !== total) return;
					var index = bytes2uint(msg.subarray(22, 26));
					if (index !== this.#bindex) return;

					this.keepAlive();
					this.#bindex ++;
					if (this.#bindex === total) {
						this.#status = Status.IDLE;
						this.#fid = null;
						this.#blocks = [];
						this.#update = Date.now();
						let callback = this.#callback;
						this.#callback = null;
						if (!!callback) callback(true, null);
					} else {
						this.#timer = setTimeout(closer, closeDelay);
						this.sendData();
					}
				})
				.setKeepAlive(true, delay)
				.setTimeout(delay);
				return;
			}

			// 如果是UDP
			this.#socket = UDP.createSocket(this.#protocol);
			this.#socket.on('message', async (msg, remote) => {
				if (this.#status === Status.TERMINATED) {
					this.keepAlive();
					return;
				}
				if (msg.length === 3 && msg[0] === 0 && msg[1] === 0 && msg[2] === 255) { // 如果要求关闭信道
					let callback = this.#callback;
					await this.suicide();
					if (!!callback) callback(false, Errors.RemoteClosed);
					return;
				}
				if (this.#status === Status.IDLE) {
					this.keepAlive();
					return;
				}
				if (this.#status === Status.WORKING) return this.onUDPMessage(msg, remote);

				// 确认握手反馈
				if (msg.length !== 3) return;
				msg = Uint8Array.fromBuffer(msg);
				if (msg[2] !== 2) return;
				msg = [msg[0], msg[1]];
				if (msg[0] !== this.#fid[0] || msg[1] !== this.#fid[1]) return;
				this.#respPort = remote.port;
				this.keepAlive();
				res(null);
			});

			var send = () => {
				if (this.#status === Status.TERMINATED) return;

				// 发送握手信息
				this.#fid = newFID();
				var data = new Uint8Array([...this.#fid, 1]); // FID(2)+ORDER(1)

				if (this.#isTCP) {
					this.#socket.write(data);
				} else {
					this.#socket.send(data, this.#port, this.#address);
				}
				wait4retry();
			};
			var wait4retry = () => {
				this.#timer = setTimeout(async () => {
					this.#retried ++;
					if (this.#retried === config.retry) {
						await this.suicide();
						res(Errors.ShakeHandTimeout);
						return;
					}
					send();
				}, config.timeout[this.#retried]);
			};
			this.keepAlive();
			this.#retried = 0;

			send();
		});
	}
	close () {
		return new Promise(res => {
			this.keepAlive();
			if (!this.#isTCP && this.#respPort === 0) return res();
			// 发送关闭信息
			var fid = newFID();
			var data = new Uint8Array([...fid, 255]); // FID(2)+ORDER(1)
			var cb = () => {
				this.#status = Status.IDLE;
				this.#name = '';
				this.#address = '';
				this.#port = 0;
				this.#respPort = 0;
				this.#protocol = '';
				this.#fid = null;
				res();
			};
			if (this.#isTCP) {
				if (this.#socket.destroyed) cb();
				else this.#socket.end(data, cb);
			} else {
				this.#socket.send(data, this.#respPort, this.#address, cb);
			}
		});
	}
	onUDPMessage (msg, remote) {
		if (this.#status === Status.TERMINATED) return;

		// 反馈数据结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)
		if (msg.length !== 26) return;
		if (this.#fid[0] !== msg[0] || this.#fid[1] !== msg[1]) return;
		var shouldResend = false;
		if (msg[2] === 5) shouldResend = true; // 接收端发送重新发送全部指令
		else if (msg[2] !== 4) return;
		var bcount = bytes2uint(msg.subarray(18, 22)), total = this.#blocks.length;
		if (bcount !== total) return;
		var bindex = 0;
		if (shouldResend) this.#bindex = -1;
		else bindex = bytes2uint(msg.subarray(22, 26));
		if (bindex !== this.#bindex) return;

		this.keepAlive();
		this.#bindex ++;
		if (this.#bindex === total) {
			this.#status = Status.IDLE;
			this.#fid = null;
			this.#blocks = [];
			this.#update = Date.now();
			let callback = this.#callback;
			this.#callback = null;
			if (!!callback) callback(true, null);
		} else {
			this.sendData();
		}
	}
	sendData () {
		var block = this.#blocks[this.#bindex];

		var send = () => {
			if (this.#status === Status.TERMINATED) return;

			this.#fid = newFID();
			block[0] = this.#fid[0];
			block[1] = this.#fid[1];

			if (this.#isTCP) {
				this.#socket.write(block);
			} else {
				this.#socket.send(block, this.#respPort, this.#address);
				wait4retry();
			}
		};

		var wait4retry = () => {
			this.#timer = setTimeout(async () => {
				this.#retried ++;
				if (this.#retried === config.retry) {
					let callback = this.#callback;
					await this.suicide();
					callback(false, Errors.SendDataTimeout);
					return;
				}
				send();
			}, config.timeout[this.#retried]);
		};

		this.keepAlive();
		this.#retried = 0;
		send();
	}
	async sendMessage (mid, address, port, protocol, message, callback) {
		this.#callback = callback;
		if (this.#address !== address || this.#port !== port || this.#protocol !== protocol) {
			protocol = protocol.toLowerCase();
			if (AvailableProtocols.indexOf(protocol) < 0) {
				this.#status = Status.IDLE;
				callback(false, Errors.UnavailableProtocol);
				return;
			}
			// 先关闭原有信道
			if (this.#name !== '') {
				await this.close();
			}
			this.#status = Status.IDLE;
			this.#address = address;
			this.#port = port;
			this.#protocol = protocol;
			this.#isTCP = protocol === 'tcp';
			this.#name = this.#protocol + '-' + this.#address + '-' + this.#port;
			let err = await this.setup(); // 与远端握手，建立数据传输信道
			if (!!err) {
				this.#status = Status.TERMINATED;
				callback(false, err);
				return;
			}
		}

		this.#status = Status.WORKING;
		if (message instanceof Uint8Array) message = message.toBuffer();
		this.#mid = mid;
		var count = Math.ceil(message.length / config.blockSize);

		// 块结构：FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)+DATA
		var arrMID = Buffer.from(mid, 'base64');
		arrMID = Uint8Array.fromBuffer(arrMID);
		var header = [0, 0, 3, ...arrMID, ...uint2bytes(count, 4)];
		this.#blocks = [];
		for (let i = 0; i < count; i ++) {
			let start = i * config.blockSize, end = start + config.blockSize;
			let block = message.subarray(start, end);
			let head = array2buffer(header);
			let index = array2buffer([...uint2bytes(i, 4)]);
			head = head.concat(index);
			this.#blocks[i] = head.concat(block);
		}
		this.#bindex = 0;
		this.sendData();
	}
}
Fiber.Status = Status;
Fiber.Errors = Errors;

module.exports = Fiber;