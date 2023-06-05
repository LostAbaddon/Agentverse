require('../core');
const SocksProxyAgent = require('socks-proxy-agent');
const prepareSystem = require('../prepare');
const Commands = require('../commands');
const ClaudeAgent = require('../ai/agent/claude');
const SubAgent = require('../commands/subagent.js');
const config = require('../config.json');

(async () => {
	await prepareSystem.prepareFolders();
	await Commands.loadCommands();
	await ClaudeAgent.loadPrompt();
	prepareSystem.prepareProxy(config);

	var claude = new ClaudeAgent('', config.setting.Claude);
	console.log('Creating Sub Agent...');
	var result = await SubAgent.execute('', claude, {
		role: '',
		task: "How to build a Dyson Sphere?",
		use: false
	});
	console.log(result);
}) ();