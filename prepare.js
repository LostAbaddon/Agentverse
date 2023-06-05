const { join } = require('node:path');
const preparePath = _("Utils").preparePath;
const SocksProxyAgent = require('socks-proxy-agent');
const Axios = require('axios');
const Logger = _("Utils.Logger");
const logger = new Logger('Prepare');

const prepareFolders = async () => {
	await preparePath(join(process.cwd(), 'out'));
	await preparePath(join(process.cwd(), 'out', 'log'));
	await preparePath(join(process.cwd(), 'out', 'search'));
	await preparePath(join(process.cwd(), 'out', 'scholar'));
	await preparePath(join(process.cwd(), 'out', 'browse'));
	await preparePath(join(process.cwd(), 'out', 'summarize'));
};

const prepareProxy = (config) => {
	global.DefaultOptions = {
		method: 'GET',
		timeout: 30000,
		headers: {
			'Accept': 'text/html,application/xhtml+xml,application/xml',
			'Accept-Language': 'en',
			'Cache-Control': 'max-age=0',
			// 'Connection': 'keep-alive',
			'DNT': 1
		}
	};
	if (!!config.proxy?.http) {
		DefaultOptions.proxy = config.proxy.http;
	}
	if (!!config.proxy?.socks) {
		try {
			global.globalHTTPSProxy = new SocksProxyAgent.SocksProxyAgent(config.proxy.socks);
			// global.globalHTTPSProxy.keepAlive = true;
			// global.globalHTTPSProxy.keepAliveMsecs = 1000;
			// global.globalHTTPSProxy.scheduling = 'fifo';
			global.globalHTTPSProxy.options = {
				// keepAlive: true,
				// scheduling: 'fifo',
				timeout: 5000,
				// timeout: 2 * 60 * 1000,
				// keepAliveTimeout: 5000,
				// maxHeadersCount: null,
				// headersTimeout: 40 * 1000,
				noDelay: true
			};
			global.globalHTTPSProxy.on('error', (err, req, res) => {
				logger.error('Global Proxy Error: ' + (err.message || err.msg || err));
				res.end();
			});
		}
		catch {
			global.globalHTTPSProxy = null;
		}
	}
	Axios.defaults.timeout = 2 * 60 * 1000;
};

module.exports = {
	prepareFolders,
	prepareProxy
};