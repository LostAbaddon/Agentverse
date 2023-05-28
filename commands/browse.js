const { writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const request = require('request');
const config = require('../config.json');
const outputFolder = join(process.cwd(), 'out', 'browse');

const command = {
	"name": "Browse Website",
	"cmd": "browse_website",
	"args": {
		"url": "url"
	},
	"alias": [
		'browse',
		'website',
		'webpage',
		'browse_web',
		'browse_site',
		'browse_webpage',
		'browse_page',
		'extract_article_details',
		'extract_details',
		'obtained_article_details',
		'obtained_details',
	]
};

const parseSimpleMarkdown = content => {
	while (true) {
		let levs = [];
		content.replace(/<h(\d)[^>]*?>/gi, (match, lev) => {
			lev = lev * 1;
			if (!levs.includes(lev)) levs.push(lev);
		});
		levs.sort((a, b) => a - b);
		let temp = content
			.replace(/<h(\d)[^>]*?>([\w\W]*?)<\/h\1>/gi, (match, lev, ctx) => {
				lev = lev * 1;
				var l = levs.indexOf(lev);
				var h = '';
				for (let i = 0; i <= l; i ++) {
					h += '#';
				}
				return '\n' + h + ' ' + ctx + '\n';
			})
			.replace(/<a[^>]*?href="([\w\W]*?)"[^>]*?>([^<]*?)<\/a>/gi, (match, url, inner) => {
				url = url.replace(/^[\s\r\n]*|[\s\r\n]*$/gi, '');
				inner = inner.replace(/^[\s\r\n]*|[\s\r\n]*$/gi, '');
				if (!!url.match(/^\//)) return inner;
				return '[' + inner + '](' + url + ')'
			})
			.replace(/<\/?(b|strong)[^>]*?>/gi, '**')
			.replace(/<\/?(i|em)[^>]*?>/gi, '*')
			.replace(/<ul[^>]*?>([\w\W]*?)<\/ul>/gi, (match, ctx) => {
				var result = [];
				ctx.replace(/<li[^>]*?>([\w\W]*?)<\/li>/gi, (match, c) => {
					result.push('- ' + c);
				});
				return '\n' + result.join('\n') + '\n';
			})
			.replace(/<ol[^>]*?>([\w\W]*?)<\/ol>/gi, (match, ctx) => {
				var result = [];
				var idx = 1;
				ctx.replace(/<li[^>]*?>([\w\W]*?)<\/li>/gi, (match, c) => {
					result.push(idx + '. ' + c);
					idx ++;
				});
				return '\n' + result.join('\n') + '\n';
			})
		;
		if (content === temp) break;
		content = temp;
	}
	return content;
};
const defaultParse = content => {
	var low = content.toLowerCase();
	var start, end;
	start = low.indexOf('<article');
	if (start >= 0) {
		end = low.lastIndexOf('<\/article');
		content = content.substring(start, end);
	}
	else {
		start = low.indexOf('<section');
		if (start >= 0) {
			end = low.lastIndexOf('<\/section');
			content = content.substring(start, end);
		}
	}
	content = parseSimpleMarkdown(content)
		.replace(/<\/?(div|br|hr|p|article|section)[^>]*?>/gi, '\n')
		.replace(/<\/?[\w\-_]+[^<>]*?>/gi, '')
		.replace(/\s*[\r\n]+\s*/g, '\n')
		.replace(/^[\s\n]+|[\s\n]+$/g, '')
	;
	return 'Content:\n' + content;
};
const parseJianshu = content => {
	var low = content.toLowerCase();
	var start = low.indexOf('<article');
	var end = low.indexOf('<\/article');
	if (start < 0 || end < 0) return defaultParse(content);
	var pos = low.substring(0, start).lastIndexOf('<h1');
	if (pos >= 0) start = pos;
	pos = low.substring(end).indexOf('>');
	if (pos >= 0) end += pos + 1;
	content = content.substring(start, end);

	var title = '';
	content = content
		.replace(/<h1[^>]*?>([\w\W]*?)<\/h1>/, (match, t) => {
			if (!!t) title = 'Title: ' + parseSimpleMarkdown(t);
			return '';
		})
		.replace(/<a[^>]*?href="([\w\W]*?)"[^>]*?>/gi, (match, url) => {
			url = url.replace(/^[\s\r\n]*|[\s\r\n]*$/gi, '');
			var m = url.match(/^https?:\/\/links\.jianshu\.\w+\/go\?to=([\w\W]*)$/i);
			if (!m || !m[1]) return match;
			return '<a href="' + decodeURIComponent(m[1]) + '">';
		})
	;
	content = parseSimpleMarkdown(content)
		.replace(/<\/?(div|br|hr|p|article|section)[^>]*?>/gi, '\n')
		.replace(/<\/?[\w\-_]+[^<>]*?>/gi, '')
		.replace(/\s*[\r\n]+\s*/g, '\n')
		.replace(/^[\s\n]+|[\s\n]+$/g, '')
	;
	content = 'Content:\n' + content;
	if (!!title) content = title + '\n' + content;
	return content;
};
const parseZhihu = content => {
	content = content
		.replace(/<(div|span|p)([^>]*?)>/gi, (match, tag, attrs) => {
			var m = attrs.match(/class="([\w\W]*?)"/i);
			if (!m || !m[1]) return '<' + tag + '>';
			return '<' + tag + ' class="' + m[1] + '">';
		})
	;
	var pos = content.match(/<(div|span|p) class="[^"]*?Rich/i);
	if (!pos) return defaultParse(content);
	pos = pos.index;
	content = content.substring(pos);
	pos = content.match(/<(div|span|p) class="[^"]*?ContentItem/i);
	if (!!pos) {
		content = content.substring(0, pos.index);
	}
	content = parseSimpleMarkdown(content)
		.replace(/<\/?(div|br|hr|p|article|section)[^>]*?>/gi, '\n')
		.replace(/<\/?[\w\-_]+[^<>]*?>/gi, '')
		.replace(/\s*[\r\n]+\s*/g, '\n')
		.replace(/^[\s\n]+|[\s\n]+$/g, '')
	;
	content = 'Content:\n' + content;
	return content;
};

command.getWebpage = (requestOptions) => new Promise((res, rej) => {
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
command.prepareURL = url => {
	while (true) {
		let temp = decodeURI(url);
		if (temp === url) break;
		url = temp;
	}
	return encodeURI(url);
};
command.prepareHTML = content => {
	var low = content.toLowerCase();
	var start = low.indexOf('<body');
	var end = low.indexOf('<\/body>');
	content = content.substring(start, end);
	content = content
		.replace(/<body[^>]*?>/i, '')
		.replace(/<!\-+[\w\W]*?\-+>/gi, '')
		.replace(/\/\*+[\w\W]*?\*+\//gi, '')
		.replace(/<(noscript|script|style|video|audio|source|header|footer|aside|nav|select|option|form|svg|path|object|button)[\w\W]*?>[\w\W]*?<\/\1>/gi, '')
		.replace(/<(meta|img|input|textarea)[\w\W]*?>/gi, ' ')
		.replace(/<[^\/\\]*?[\/\\]>/gi, '')
	;
	return content;
};
command.clearHTML = (content, removeReturn=true) => {
	content = content
		.replace(/<a[^>]*?href="[^"]*?"[^>]*?>[\w\W]*?<\/a>/gi, '')
		.replace(/<\/?[^>]*?>/gi, '')
		.replace(/^[\s\r\n]+|[\s\r\n]+$/gi, '')
		.replace(/\s/g, (match) => {
			if (match === '\n') return '\n';
			if (match === '\t') return '\t';
			if (match === ' ') return ' ';
			return '';
		})
	;
	if (removeReturn) {
		content = content.replace(/\n+/gi, ' ');
	}
	else {
		content = content.replace(/\n{2,}/gi, '\n\n');
	}
	content = content.replace(/&#(\d+);/g, (match, code) => {
		var char;
		try {
			char = String.fromCharCode(code * 1);
		}
		catch {
			char = match;
		}
		return char;
	});
	return content;
};
command.isURL = url => {
	return !!url.match(/^https:?\/\/[\w\-\.]+(:\d+)?(\/[\w\-\.%\/]*)?(\?[\w\-\.%=&]*)?(\#[\w\-\.%]*)?$/i);
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
	url = command.prepareURL(url);
	if (!command.isURL(url)) {
		return {
			speak: "Web page url \"" + url + "\" is invalid.",
			reply: "wrong url",
			exit: false
		};
	}

	try {
		let saved = await readFile(join(outputFolder, url.replace(/[:\\\/\?=&\$\.!\+]+/g, '_') + '.txt'), 'utf-8');
		if (!!saved) {
			return {
				speak: "Get web page content: " + url + " (" + saved.length + ' bytes)',
				reply: saved,
				exit: false
			};
		}
	} catch {}

	var requestOptions = Object.assign({}, DefaultOptions, { url });
	var content;
	for (let i = retryMax; i > 0; i --) {
		try {
			content = await command.getWebpage(requestOptions);
			content = command.prepareHTML(content);
			if (!!url.match(/https?:\/\/([\w\-_\.]+\.)?jianshu\.\w+/i)) {
				content = parseJianshu(content);
			}
			else if (!!url.match(/https?:\/\/([\w\-_\.]+\.)?zhihu\.\w+/i)) {
				content = parseZhihu(content);
			}
			else {
				content = defaultParse(content);
			}
			if (!content || !!content.match(/^Content:[\s\r\n]*$/)) {
				content = 'Empty web page, no content.\n\nContinue the rest of the tasks and goals, please.';
			}
			else {
				content = command.clearHTML(content, false) + '\n\nNow use the page content to continue the tasks and goals, please.';
			}
			writeFile(join(outputFolder, url.replace(/[:\\\/\?=&\$\.!\+]+/g, '_') + '.txt'), content, 'utf-8').catch(err => {
				console.error('Save web page content into file failed: ' + (err.message || err.msg || err));
			});
			return {
				speak: "Get web page content: " + url + " (" + content.length + ' bytes)',
				reply: content,
				exit: false
			};
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			console.error("Get web page \"" + url + "\" failed:" + msg)
			if (i > 1) {
				await wait(1000);
				console.error('Retry browsing...');
				continue;
			}
			return {
				speak: "Get web page \"" + url + "\" failed:" + msg,
				reply: "failed",
				exit: false
			};
		}
	}
};

module.exports = command;