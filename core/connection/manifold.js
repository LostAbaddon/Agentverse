// Author:  LostAbaddon
// Version: 0.1
// Date:    2019.07.02
//
// 主线程中的管理接口，作为主线程与网络端口监听线程之间的桥梁
// 每个Manifold与一个Unifold对应，管理一类协议-端口，在独立线程中运行。

const Thread = require('worker_threads').Worker;
const Config = require('./default.js');

class Manifold {
	#unifold;
	#alive = true;
	#status = 0; // 0：初始化；1：等待连接；2：闲置；3：工作中
	#protocol;
	#port = 0;
	#onReady = null;
	#onMsg = new Set();
	constructor (protocol, port, title) {
		this.title = title;
		this.#protocol = protocol;
		if (!(port > 0)) port = 0;
		this.#port = port;

		this.#unifold = new Thread(__dirname + '/unifold.js', { workerData: {
			config: Config.receiver,
			protocol, port, title
		}});
		this.#unifold.on('message', msg => {
			if (msg.type === 'init') {
				this.#status = 1;
				this.#port = msg.data.port;
				this.title = msg.data.title;
				if (!!this.#onReady) this.#onReady(msg.data.err || null);
			} else {
				let resp = (_msg) => {
					this.#unifold.postMessage({
						remote: msg.data.sender,
						msg: _msg
					});
				};
				for (let cb of this.#onMsg) {
					if (Function.is(cb)) cb(msg.data, resp);
				}
			}
		});
	}
	onReady (cb) {
		if (!this.#alive) return;
		this.#onReady = cb;
		if (this.#status > 0) cb();
	}
	onMessage (cb) {
		this.#onMsg.add(cb);
	}
	get protocol () {
		return this.#protocol;
	}
	get port () {
		if (!this.#alive) return 0;
		return this.#port;
	}
}

module.exports = Manifold;