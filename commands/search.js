const request = require('request');
const { getWebpage } = require('./browse');
const config = require('../config.json');

const DefaultOptions = {
	method: 'GET',
	timeout: 30000,
	headers: {
		'Accept': 'text/html,application/xhtml+xml,application/xml',
		'Accept-Language': 'en',
		'Cache-Control': 'max-age=0',
		'Connection': 'keep-alive',
		'DNT': 1
	}
};
if (!!config.extensions?.google_search?.proxy) {
	DefaultOptions.proxy = config.extensions.google_search.proxy;
}

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
	content.replace(/<a[^>]*?>[\s\r\n]*<h3/gi, (match, pos) => {
		result.push(pos)
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
			.replace(/<\/?\w+[^>]*?>/gi, '')
			.replace(/[\s\r\t]*\n+[\s\r\t]*/g, '\n')
			.replace(/\n+/g, '\n')
			.replace(/^\n+|\n+$/g, '');
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
		content.push('- URL: ' + item[0] + ctx);
		if (content.length >= limit) return true;
	});
	return content.join('\n')
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

	var result;
	for (let i = retryMax; i > 0; i --) {
		try {
			result = await scrabGoogle(query);
			result = result + '\n\nNow use these search results to continue the mission.';
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