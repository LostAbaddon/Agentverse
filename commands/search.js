const { writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const request = require('request');
const { getWebpage } = require('./browse');
const config = require('../config.json');
const outputFolder = join(process.cwd(), 'out', 'search');

const command = {
	"name": "Search",
	"cmd": "google_search",
	"alias": ['google', 'search', 'web_search'],
	"args": {
		"query": "query"
	}
};

const parseParams = param => {
	var json = {};
	param = (param || '').split('?');
	param.shift();
	param = (param || '').join('?').split('&');
	param.forEach(item => {
		item = item.split('=');
		var key = item.shift();
		item = item.join('=');
		json[key] = item;
	});
	return json;
};

const scrabGoogle = async (query) => {
	query = encodeURIComponent(query);

	var limit = config.extensions?.google_search?.count;
	if (!(limit > 0)) limit = 10;
	var url = `https://www.google.com/search?q=${query}&hl=en-US&start=0&num=${limit}&ie=UTF-8&oe=UTF-8&gws_rd=ssl`;
	var requestOptions = Object.assign({}, DefaultOptions, { url });

	var content = await getWebpage(requestOptions);

	content = content
		.replace(/<![^>]*?>/gi, '')
		.replace(/<(noscript|script|title|style|header|footer|head|ul|ol)[\w\W]*?>[\w\W]*?<\/\1>/gi, '')
		.replace(/<(meta|input|img)[\w\W]*?>/gi, '')
		.replace(/<[^\/\\]*?[\/\\]>/gi, '')
		.replace(/<\/?(html|body)[^>]*?>/gi, '')
		.replace(/<\/?span[^>]*?>/gi, '')
		.replace(/<\/?(div|br|hr)[^>]*?>/gi, '\n')
	;
	content = content.replace(/<a[^>]*href=('|")([^'"]*)\1[^>]*>([\w\W]*?)<\/a>/gi, (match, quote, url, inner) => {
		if (url.match(/^https?:\/\/.*?\.google/)) return '';
		if (url.match(/^\s*\//) && !url.match(/^\s*\/url\?/)) return '';
		return match;
	});
	while (true) {
		let temp = content.replace(/<([\w\-_]+)[^>]*?>[\s\r\t\n]*<\/\1>/gi, '');
		if (content === temp) break;
		content = temp;
	}
	content = content
		.replace(/^[\w\W]*?<a/i, '<a')
		.replace(/Related searches[\w\W]*?$/i, '')
		.replace(/[\s\r\t]*\n+[\s\r\t]*/g, '\n')
		.replace(/\n+/g, '\n')
	;

	let result = [];
	content.replace(/<a[^>]*?>[\s\r\n]*/gi, (match, pos) => {
		result.push(pos);
	});
	result.push(content.length);

	for (let i = 0; i < result.length - 1; i ++) {
		let a = result[i], b = result[i + 1];
		let sub = content.substring(a, b);
		let url = sub.match(/^[\s\r\n]*<a[^>]*?href=('|")?([^'"]*?)\1[^>]*?>/i);
		if (!url || !url[2]) continue;
		url = parseParams(url[2]);
		for (let key in url) {
			let value = url[key];
			if (value.match(/^https?/i)) {
				url = decodeURI(value);
				break;
			}
		}
		sub = sub
			.replace(/<h3[^>]*>/gi, '\n  Title: ')
			.replace(/<\/h3[^>]*>/gi, '\n  Description: ')
			.replace(/<\/?\w+[^>]*?>/gi, '')
			.replace(/[\s\r\t]*\n+[\s\r\t]*/g, '\n')
			.replace(/\n+/g, '\n')
			.replace(/^\n+|\n+$/g, '')
			.replace(/\n  Title:\s*\n\s*/gi, '\n  Title: ')
			.replace(/\n  Description:\s*\n\s*/gi, '\n  Description: ')
			.replace(/&#(\d+);/g, (match, code) => {
				var char;
				try {
					char = String.fromCharCode(code * 1);
				}
				catch {
					char = match;
				}
				return char;
			})
		;
		result[i] = [url, sub];
	}
	result.pop();

	if (!result.length) {
		return 'nothing found.';
	}

	content = [];
	result.some(item => {
		if (!item || !item[0]) return;
		var ctx = item[1] || '';
		ctx = ctx.split('\n');
		ctx = ctx.map(line => line.replace(/^\-\s*/, '\n  ')).join('\n  ');
		ctx = ctx
			.replace(/Title:\s*\n\s*/gi, 'Title: ')
			.replace(/Description:\s*\n\s*/gi, 'Description: ')
			.replace(/\n\s*Title:\s*\n\s*/gi, '\n  Title: ')
			.replace(/\n\s*Description:\s*\n\s*/gi, '\n  Description: ')
		;
		content.push('- URL: ' + item[0] + '\n  ' + ctx);
		if (content.length >= limit) return true;
	});
	return content.join('\n');
};
const searchGoogle = async (query) => {
	query = encodeURIComponent(query);

	var limit = config.extensions?.google_search?.count;
	if (!(limit > 0)) limit = 10;
	var url = `https://customsearch.googleapis.com/customsearch/v1?key=${config.extensions.google_search.apikey}&cx=${config.extensions.google_search.cx}&q=${query}&sort=date-sdate:d:s`;
	var requestOptions = Object.assign({}, DefaultOptions, { url });

	var content = await getWebpage(requestOptions);
	content = JSON.parse(content);
	if (!content.items || !content.items.length) {
		return 'nothing found.';
	}

	content = content.items.map(item => {
		var list = ['- URL: ' + item.link];
		list.push('  Title: ' + item.title);
		list.push('  Description: ' + item.snippet.replace(/[\r\n]/g, ''));
		return list.join('\n')
	}).join('\n');
	return content;
};

command.execute = async (type, caller, target) => {
	var retryMax = config.setting?.retry || 1;
	if (!(retryMax > 1)) retryMax = 1;

	var query, prepare;
	for (let key in target) {
		let value = target[key];
		if ((value * 1) + '' !== value && !['true', 'false'].includes(value.toLowerCase())) {
			prepare = value;
		}
		if (!!key.match(/\b(args?|name|q|query|s|search|f|find|keywords?)\b/i)) {
			query = value;
			break;
		}
	}
	if (!query) query = prepare;
	if (!query) {
		return {
			speak: "Empty Google Search.",
			reply: 'empty search',
			exit: false
		};
	}

	try {
		let saved = await readFile(join(outputFolder, query + '.txt'), 'utf-8');
		if (!!saved) {
			return {
				speak: "Search Google for \"" + query + "\" finished.",
				reply: saved,
				exit: false
			};
		}
	} catch {}

	var useAPI = !!config.extensions.google_search.apikey && !!config.extensions.google_search.cx;
	var result;
	for (let i = retryMax; i > 0; i --) {
		try {
			if (useAPI) {
				result = await searchGoogle(query);
			}
			else {
				result = await scrabGoogle(query);
			}
			result = result + '\n\nNow use these search results to continue the mission.';
			writeFile(join(outputFolder, query + '.txt'), result, 'utf-8').catch(err => {
				console.error('Save Search Result into file failed: ' + (err.message || err.msg || err));
			});
			return {
				speak: "Search Google for \"" + query + "\" finished.",
				reply: result,
				exit: false
			};
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			console.error("Search Google \"" + query + "\" failed:" + msg)
			if (i > 1) {
				await wait(1000);
				console.error('Retry searching...');
				continue;
			}
			return {
				speak: "Search Google \"" + query + "\" failed:" + msg,
				reply: "failed",
				exit: false
			};
		}
	}
};

module.exports = command;