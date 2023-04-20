const responsor = (param, query, url, data, method, source, ip, port) => {
	setTimeout(() => {
		if (isSlaver) {
			process.send({ event: 'extinct' });
		}
		else {
			require(require('path').join(process.cwd(), '../../responser')).extinct();
		}
	}, 100);
	return {
		ok: true,
		data: 'EXSTINCTUS MUNDE'
	};
};

module.exports = { responsor };