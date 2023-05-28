const { writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const config = require('../config.json');
const browse = require('./browse');
const outputFolder = join(process.cwd(), 'out', 'summarize');

const command = {
	"name": "summarize Website",
	"cmd": "summarize_website",
	"args": {
		"url": "url",
		"wordcount": "wordcount"
	},
	"alias": [
		'summarize',
		'summarize_web',
		'summarize_site',
		'summarize_webpage',
		'summarize_page',
		'summarize_article',
		'extract_article_summary',
		'extract_summary',
		'obtained_article_summary',
		'obtained_summary',
	]
};

command.execute = async (type, caller, target) => {
	var retryMax = config.setting?.retry || 1;
	if (!(retryMax > 1)) retryMax = 1;

	var url, prepare;
	for (let key in target) {
		let value = target[key];
		if (value.match(/^https?:\/\//)) prepare = value;
		if (key.match(/\b(url|web|site|query|target|link)\b/i)) {
			url = value;
			break;
		}
	}
	if (!url) url = prepare;
	url = browse.prepareURL(url);
	if (!browse.isURL(url)) {
		return {
			speak: "Web page url \"" + url + "\" is invalid.",
			reply: "wrong url",
			exit: false
		};
	}
	url = join(outputFolder, url.replace(/[:\\\/\?=&\$\.!\+]+/g, '_') + '.txt');

	try {
		let saved = await readFile(url, 'utf-8');
		if (!!saved) {
			return {
				speak: "Get web page summary: " + url + " (" + saved.length + ' bytes)',
				reply: saved,
				exit: false
			};
		}
	} catch {}

	var wordcount = 1000;
	for (let key in target) {
		let value = target[key];
		if (key.match(/\b(word|count|wordcount)\b/i)) {
			let wc = value * 1;
			if (wc > 0) {
				wordcount = wc;
				break;
			}
		}
	}

	var content = await browse.execute(type, caller, target);
	if (!content) {
		content = 'Empty web page, no content.';
	}
	else if (!content.reply) {
		content = 'Empty web page, no content.';
	}
	else {
		content = content.reply;
	}
	if (content.indexOf('Empty web page, no content.') >= 0) {
		return {
			speak: "Get web page summary: " + url + " (" + content.length + ' bytes)',
			reply: content,
			exit: false
		}
	}

	var ai = caller.copy();
	var prompt = caller.constructor.Prompts.summarize
		.replace(/<content>/gi, content)
		.replace(/<wordcount>/gi, wordcount)
	;
	var summarize = '';
	for (let i = 0; i < retryMax; i ++) {
		try {
			let temp = await ai.send(prompt, 0.5, false);
			if (!!temp && !!temp[0]) {
				summarize = temp[0];
				break;
			}
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			console.error(msg);
			console.error(err.stack);
			if (i === retryMax - 1) {
				return {
					speak: "Summarize web page failed: " + msg,
					reply: 'no summarize for this web page.\n\nContinue the rest of the tasks and goals, please.',
					exit: false
				}
			}
		}
	}

	summarize = summarize + '\n\nNow use the summary to continue the tasks and goals, please.';
	writeFile(url, summarize, 'utf-8').catch(err => {
		console.error('Save web page summary into file failed: ' + (err.message || err.msg || err));
	});
	return {
		speak: "Get web page summary: " + url + " (" + summarize.length + ' bytes)',
		reply: summarize,
		exit: false
	};
};

module.exports = command;