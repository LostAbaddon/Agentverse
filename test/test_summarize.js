require('../core');
const SocksProxyAgent = require('socks-proxy-agent');
const prepareSystem = require('../prepare');
const ClaudeAgent = require('../ai/agent/claude');
const Summarize = require('../commands/summarize.js');
const config = require('../config.json');

(async () => {
	await prepareSystem.prepareFolders();
	await ClaudeAgent.loadPrompt();
	prepareSystem.prepareProxy(config);

	var claude = new ClaudeAgent('', config.setting.Claude);
	console.log('Summarizing web page...');
	var result = await Summarize.execute('', claude, {url: 'https://www.jianshu.com/p/d633bb9bd463'});
	// var result = await Summarize.execute('', '', {url: 'https://www.zhihu.com/question/359948448/answer/1014333716'});
	// var result = await Summarize.execute('', '', {url: 'https://zhuanlan.zhihu.com/p/463715925'});
	// var result = await Summarize.execute('', '', {url: 'https://www.zhihu.com/collection/190519403'});
	console.log(result);
}) ();