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
		else if (resp.statusCode !== 200) {
			rej(new Error('Error with response status code: ' + resp.statusCode));
		}
		else {
			res(data);
		}
	});
});

command.execute = async (type, caller, target) => {
	console.log('VVVVVVVVVVVVvVVVVVVVVVVVV');
	console.log(' VVVVVVVVVVVvVVVVVVVVVVV');
	console.log('   VVVVVVVVVvVVVVVVVVV');
	console.log('      VVVVVVvVVVVVV');
	console.log('          VVvVV');
	console.log(target);

	var url;
	for (let key in target) {
		if (key.match(/\b(url|web|site|query|target)\b/i)) {
			url = target[key];
			break;
		}
	}
	var requestOptions = Object.assign({}, DefaultOptions, { url });
	var result = await getWebpage(requestOptions);
	console.log(result);
	return {
		speak: "Get webpage content: " + url,
		reply: result,
		exit: false
	};
};

module.exports = command;