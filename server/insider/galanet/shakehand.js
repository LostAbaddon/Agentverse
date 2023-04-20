const Galanet = require('../../galanet');

const responsor = (param, query, url, data, method, source, host, port) => {
	if (isSlaver) {
		setTimeout(() => {
			process.send({
				event: "command",
				action: "command::request::shakehand",
				data: host
			});
		}, 0);
	}
	else {
		setTimeout(() => {
			process.emit('command::request::shakehand', host);
		}, 0);
	}

	return {
		ok: true,
		data: Galanet.getNodeInfo()
	}
};

module.exports = {
	responsor,
	methods: 'get',
};