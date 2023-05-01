const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const Axios = require('axios');
const SocksProxyAgent = require('socks-proxy-agent');
const preparePath = _("Utils").preparePath;
const AbstractAgent = require('./agent/abstract.js');
const Commands = require('../commands');

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
		Commands.loadCommands(),
		Agents.Claude.loadPrompt()
	];
	await Promise.all(tasks);
};
const ini2json = ini => {
	var json = {}, key = '';
	ini = ini.split(/\r*\n\r*/);
	ini.forEach(line => {
		var match = line.match(/^[\s\t]*\[(.*?)\][\s\t]*$/);
		if (!!match) {
			if (!!key && !!json[key]) {
				json[key] = json[key].join('\n').replace(/(^[\s\t\r\n]+|[\s\t\r\n]+$)/, '');
			}
			let k = match[1];
			if (!!k) {
				key = k;
				json[key] = [];
			}
		}
		else if (!!key) {
			json[key].push(line);
		}
	});
	if (!!json[key]) {
		json[key] = json[key].join('\n').replace(/(^[\s\t\r\n]+|[\s\t\r\n]+$)/, '');
	}

	return json;
};
const md2json = md => {
	var json = {}, key, level = 0, tree = [], curr, empty = true;
	md = md.split(/\r*\n\r*/);
	md.forEach(line => {
		var lev = line.match(/^(#+)[\s\t]*(.+)$/);
		if (!!lev) {
			empty = false;
			key = lev[2].toLowerCase();
			lev = lev[1].length;
			if (level === 0) {
				level = lev;
				tree.push(key);

				curr = json;
			}
			else if (level === lev) {
				tree[tree.length - 1] = key;

				if (tree.length <= 1) {
					curr = json;
				}
				else {
					curr = json[tree[tree.length - 2]];
				}
			}
			else if (lev > level) {
				tree.push(key);
				level = lev;

				let parent = json[tree[tree.length - 2]];
				if (Array.is(parent) || !parent) {
					parent = {};
					json[tree[tree.length - 2]] = parent;
				}
				curr = parent;
			}
			else {
				let idx = Math.max(0, tree.length - 1 - (level - lev));
				tree.splice(idx);
				tree.push(key);
				level = lev;

				if (idx === 0) {
					curr = json;
				}
				else {
					curr = json[tree[idx - 1]];
				}
			}
			curr[key] = [];
		}
		else {
			if (!!curr) curr[key].push(line);
		}
	});
	// console.log(empty, json);
	if (empty) return null;
	return array2text(json);
};
const array2text = json => {
	var result = {};
	for (let key in json) {
		let value = json[key];
		if (Array.is(value)) {
			value = value.join('\n');
			value = value.replace(/^[\s\t\r\n]*|[\s\t\r\n]*$/gi, '');
		}
		else {
			value = array2text(value);
		}
		result[key] = value;
	}
	return result;
};
const loadPrompt = async type => {
	var data = await readLocalFile('./prompts/' + type.toLowerCase() + '.ini');
	return ini2json(data);
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
	ini2json,
	md2json,
	setProxy,
	readFile: readLocalFile,
	loadPrompt,
	sendRequest
};

Agents.Claude = require('./agent/claude');