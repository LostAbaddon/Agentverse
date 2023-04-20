const Config = require('./default.js');
const Manifold = require('./manifold');
const Section = require('./section.js');

// 服务端每协议、端口是一个独立的线程
const createServer = (protocol, port, callback) => {
	var server = new Manifold(protocol, port);
	server.onReady(err => {
		callback(server, err);
	});
};

// 发送端由统一线程进行管理
const createClient = (callback) => {
	Section.init(callback);
};

const setConfig = cfg => {
	if (!cfg) return;
	var limit;

	if (!!cfg.sender) {
		limit = Config.sender.limit;
		Object.assign(Config.sender, cfg.sender);
		Config.sender.limit = Object.assign({}, limit, cfg.sender.limit);
	}

	if (!!cfg.receiver) {
		limit = Config.receiver.limit;
		Object.assign(Config.receiver, cfg.receiver);
		Config.receiver.limit = Object.assign({}, limit, cfg.receiver.limit);
	}
};

module.exports = {
	server: createServer,
	client: createClient,
	setConfig 
};