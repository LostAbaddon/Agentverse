const Logger = new (_("Utils.Logger"))('MessageDealer');
var Galanet;

const responsor = (param, query, url, data, method, protocol, host, port) => {
	if (global.isSlaver) {
		process.send({
			event: 'galanet::message',
			type: param.type,
			sender: { protocol, host, port },
			msg: param.data,
		});
	}
	else {
		process.emit('galanet::message', param.type, { protocol, host, port }, param.data);
	}

	Galanet = Galanet || _('Core.Galanet');
	if (param.type === 'broadcast' && !!param.toAll) {
		Galanet.broadcast(param.data, true, param.mid);
	}
	else if (param.type === 'narrowcast' && param.count > 0) {
		Galanet.narrowcast(param.data, param.count, param.mid);
	}

	return {
		ok: true,
		data: ''
	}
};

module.exports = {
	responsor,
	methods: 'post',
};