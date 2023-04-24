const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const Axios = require('axios');
const SocksProxyAgent = require('socks-proxy-agent');
const preparePath = _("Utils").preparePath;
const AbstractAgent = require('./agent/abstract.js');

var httpsAgent;

const Agents = {};

const setProxy = url => {
	if (!url) {
		httpsAgent = null;
		return;
	}

	try {
		httpsAgent = new SocksProxyAgent.SocksProxyAgent(url);
	}
	catch {
		httpsAgent = null;
	}
};
const readLocalFile = async filepath => {
	if (filepath.indexOf('.') === 0) {
		filepath = join(process.cwd(), filepath);
	}

	try {
		let data = await readFile(filepath, 'utf8');
		return data;
	}
	catch (err) {
		throw new Error(err.message || err.msg || err);
	}
};
const initAI = async () => {
	var tasks = [
		Agents.Claude.loadPrompt()
	];
	await Promise.all(tasks);
};
const loadPrompt = async type => {
	var data = await readLocalFile('./prompts/' + type.toLowerCase() + '.ini');
	var prompts = {}, inside = false, last = '';
	data = data.split(/[\r\n]+/);
	data.forEach(line => {
		var match = line.match(/^[\s\t]*\[(.*?)\][\s\t]*$/);
		if (!!match) {
			if (!!prompts[last]) {
				prompts[last] = prompts[last].join('\n');
			}
			last = match[1];
			prompts[last] = [];
		}
		else {
			prompts[last].push(line);
		}
	});
	if (!!prompts[last]) {
		prompts[last] = prompts[last].join('\n');
	}

	return prompts;
};
const sendRequest = ctx => new Promise((res, rej) => {
	if (!!httpsAgent) ctx.httpsAgent = httpsAgent;
	Axios.request(ctx).then(result => {
		res(result.data);
	}).catch(err => {
		rej(err);
	});
});

module.exports = {
	Agents,
	AbstractAgent,
	initAI,
	setProxy,
	readFile: readLocalFile,
	loadPrompt,
	sendRequest
};

Agents.Claude = require('./agent/claude');