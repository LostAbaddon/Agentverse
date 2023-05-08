const request = require('request')

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
	"name": "Browse Website",
	"cmd": "browse_website",
	"alias": ['browse', 'website', 'webpage', 'browse_web', 'browse_site', 'browse_webpage', 'browse_page'],
	"args": {
		"url": "<url>"
	}
};

const getWebpage = (requestOptions) => new Promise((res, rej) => {
	request(requestOptions, (err, resp, data) => {
		if (!!err) {
			rej(err);
		}
		else if ([400, 401, 402].includes(resp.statusCode)) {
			res("wrong request.")
		}
		else if (resp.statusCode > 402 && resp.statusCode < 500) {
			res("cannot get this page.")
		}
		else if (resp.statusCode !== 200) {
			rej(new Error('Error with response status code: ' + resp.statusCode));
		}
		else {
			res(data);
		}
	});
});

command.execute = async (type, caller, target) => {
	var retryMax = config.setting?.retry || 1;
	if (!(retryMax > 1)) retryMax = 1;

	var url;
	for (let key in target) {
		if (key.match(/\b(url|web|site|query|target)\b/i)) {
			url = target[key];
			break;
		}
	}
	var requestOptions = Object.assign({}, DefaultOptions, { url });
	var content;

	for (let i = retryMax; i > 0; i --) {
		try {
			content = await getWebpage(requestOptions);
			content = ('\n' + content + '\n')
				.replace(/<![^>]*?>/gi, '')
				.replace(/<(head|noscript|script|title|style|header|footer|aside|select|option)[\w\W]*?>[\w\W]*?<\/\1>/gi, '')
				.replace(/<(input|img|textarea)[\w\W]*?>/gi, ' ')
				.replace(/<[^\/\\]*?[\/\\]>/gi, '')
				.replace(/<\/?(div|br|hr|p|article|section|h\d)[^>]*?>/gi, '\n')
				.replace(/<\/?[\w\-_]+[^<>]*?>/gi, '')
				.replace(/\s*[\r\n]+\s*/g, '\n')
			;
			return {
				speak: "Get webpage content: " + url + " (" + content.length + ' bytes)',
				reply: content,
				exit: false
			};
		}
		catch (err) {
			if (i > 1) {
				console.error("Get webpage \"" + url + "\" failed:" + (err.message || err.msg || err))
				await wait(1000);
				console.error('Retry browsing...');
				continue;
			}
			return {
				speak: "Get webpage \"" + url + "\" failed:" + (err.message || err.msg || err),
				reply: "failed",
				exit: false
			};
		}
	}
};

module.exports = command;