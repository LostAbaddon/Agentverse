module.exports = {
	sender: {
		limit: {
			connection: 100,
			contemporary: 10,
		},
		retry: 5,
		timeout: [300, 500, 1000, 1500, 1500],
		blockSize: 4070, // FID(2)+SIG(1)+MID(15)+BCOUNT(4)+BINDEX(4)+DATA
	},
	receiver: {
		connection: 200,
		retry: 3,
		timeout: 10000,
	}
};