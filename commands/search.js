const Google = require('google');
const config = require('../config.json');

Google.requestOptions = {
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
	Google.requestOptions.proxy = config.extensions.google_search.proxy;
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

const scrabGoogle = (query) => new Promise((res, rej) => {
	Google(query, async (err, data) => {
		if (!!err) {
			rej(err.message || err.msg || err);
			return;
		}

		var items = [];
		var content = data.body;
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
		content.replace(/<a[^>]*?>[\s\r\n]*<h3/gi, (match, pos) => {
			items.push(pos)
		});
		items.push(content.length);

		for (let i = 0; i < items.length - 1; i ++) {
			let a = items[i], b = items[i + 1];
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
			items[i] = [url, sub];
		}
		items.pop();

		if (!items.length) {
			return res('nothing found.');
		}
		else {
			let limit = config.extensions?.google_search?.count;
			if (!(limit > 0)) limit = Infinity;
			if (items.length > limit) {
				items.splice(limit);
			}
		}

		var result = [];
		items.forEach(item => {
			if (!item || !item[0]) return;
			var ctx = item[1] || '';
			ctx = ctx.split('\n');
			ctx = ctx.map(line => line.replace(/^\-\s*/, '\n  ')).join('\n  ');
			result.push('- URL: ' + item[0] + ctx);
		});
		res(result.join('\n'));
	});
});

command.execute = async (type, caller, target) => {
	var retryMax = config.setting?.retry || 1;
	if (!(retryMax > 1)) retryMax = 1;

	var result = {};
	var queries = [], prepare = [];
	for (let key in target) {
		let value = target[key];
		if ((value * 1) + '' !== value && !['true', 'false'].includes(value.toLowerCase())) {
			prepare.push(value);
		}
		if (!!key.match(/\b(args?|name|q|query|s|search|f|find|keywords?)\b/i)) {
			queries.push(target[key]);
		}
	}
	if (queries.length === 0) queries = prepare;

	for (let i = retryMax; i > 0; i --) {
		try {
			await Promise.all(queries.map(async query => {
				result[query] = await scrabGoogle(query);
			}));
			var reply = [];
			for (let target in result) {
				reply.push(result[target]);
			}
			reply = reply.join('\n\n');
			return {
				speak: "Search Google for \"" + queries.join(', ') + "\" finished.",
				reply: reply,
				exit: false
			};
		}
		catch (err) {
			if (i > 1) {
				console.error("Search Google for \"" + queries.join(', ') + "\" failed:" + (err.message || err.msg || err))
				await wait(1000);
				console.error('Retry searching...');
				continue;
			}
			return {
				speak: "Search Google for \"" + queries.join(', ') + "\" failed:" + (err.message || err.msg || err),
				reply: "failed",
				exit: false
			};
		}
	}
};

module.exports = command;