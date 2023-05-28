const { readFile, writeFile } = require('fs/promises');
const { join } = require('path');
const Console = require('../server.js').console;
const ClaudeAgent = require('../ai/agent/claude');
const browse = require('../commands/browse');
const StartPrompt = "请将下面的内容翻译为<language>，直接给出翻译，不要有任何评论或分析，也不要有任何衍生内容。如果一次输出不完，可以分多次输出。当翻译完成后，一定要在下一行输入“翻译完成”。在翻译过程中，如果我输入“请继续”，请继续输出剩余的翻译内容。如果翻译已经完成，我输入“请继续”后，请您输出“翻译完成”。\n\n以下是待翻译内容:\n\n<content>";
const ContinuePrompt = "请继续";

const LimitRate = 5;
const Duration = 1000 * 10;
const TotalRetryMax = 100;
var totalRetry = 0;

const Action = {
	name: "translate",
};

const decompose = content => {
	content = content.replace(/\s/g, (match) => {
		if (match === '\n') return '\n';
		if (match === '\t') return '\t';
		if (match === ' ') return ' ';
		return '';
	});

	var poses = [0];
	content.replace(/\n+[ \t]*#+/gi, (match, pos) => {
		poses.push(pos);
	});
	poses.push(content.length);

	var parts = [];
	for (let i = 0, l = poses.length - 1; i < l; i ++) {
		let ctx = content.substring(poses[i], poses[i + 1]);
		ctx = ctx.replace(/^\n+|\n+$/g, '');
		parts.push(ctx);
	}
	return parts.filter(p => p.length > 0);
};
const checkFinish = content => {
	var parts = content.split(/\n+/).filter(p => !!p);
	var last = parts[parts.length - 1];
	if (parts.length > 1) {
		return !!last.match(/翻译(已经?|彻底|完全|全部)*(完成|结束|成功)\s*[\.。!！,，…]*\s*$/i);
	}
	else if (parts.length === 0) {
		return true;
	}
	else {
		return !!last.match(/翻译(已经?|彻底|完全|全部)*(完成|结束|成功)/i);
	}
};
const clearReply = content => {
	var pos = content.match(/\s*翻译(已经?|彻底|完全|全部)*(完成|结束|成功)/i);
	if (!pos) return content;
	return content.substring(0, pos.index);
};
const sendAndReply = async (ai, prompt) => {
	var loops = 0;
	while (totalRetry < TotalRetryMax) {
		try {
			let result = await ai.send(prompt, 1.0, false);
			loops += result[1];
			result = result[0];
			ai.addMemory(prompt, result);
			totalRetry = 0;
			return [result, loops];
		}
		catch (err) {
			console.error('Translate failed: ' + (err.message || err.msg || err));
			console.error(err.stack);
			totalRetry ++;
			console.log('wait for retry... (' + totalRetry + ')');
			await wait(Duration);
			console.log('retrying... (' + totalRetry + ')');
		}
	}
	return ['', loops];
};
const translate = async (ai, language, content) => {
	var head = content.match(/^\n*(#*)[ \t]*/);
	if (!head) head = '';
	else head = head[1] + ' ';
	content = content.replace(/^\n*#*[ \t]*/, '');
	var limitSize = content.length * LimitRate;

	ai = ai.copy();
	var loops = 0, answer = '', shouldContinue = true;
	var prompt = StartPrompt
		.replace(/<language>/i, language)
		.replace(/<content>/i, content)
	;
	var reply = await sendAndReply(ai, prompt);
	loops += reply[1];
	reply = reply[0];
	if (!reply) {
		console.log('翻译失败……');
		return ['\n\n翻译失败\n\n', loops];
	}
	shouldContinue = !checkFinish(reply);
	reply = clearReply(reply);
	answer = answer + reply;
	console.log('完成部分翻译: ' + reply.length + ' [' + loops + ']');

	prompt = ContinuePrompt;
	while (!!reply && shouldContinue) {
		await wait(Duration);
		reply = await sendAndReply(ai, prompt);
		loops += reply[1];
		reply = reply[0];
		if (!reply) {
			console.log('翻译失败……');
			return ['\n\n翻译失败\n\n', loops];
		}
		shouldContinue = !checkFinish(reply);
		reply = clearReply(reply);
		answer = answer + reply;
		console.log('完成部分翻译: ' + reply.length + ' [' + loops + ']');
		if (answer.length >= limitSize) {
			console.warn("翻译文本过长，疑似出现异常……");
			break;
		}
	}

	answer = answer.replace(/^\n*#*\s*/, head);
	if (language.match(/汉语|中文|chinese/i)) {
		answer = answer
			.replace(/\s*,[ \t]*/gi, '，')
			.replace(/\s*![ \t]*/gi, '！')
			.replace(/\s*\?[ \t]*/gi, '？')
			.replace(/\s*;[ \t]*/gi, '；')
			.replace(/\s*:[ \t]*/gi, '：')
		;
	}
	console.log('完成章节翻译: ' + answer.length + ' [' + loops + ']');

	return [answer, loops];
};
const saveToFile = async (output, result) => {
	try {
		await writeFile(output, result, 'utf-8');
		console.log('Translation saved.');
	}
	catch (err) {
		console.error('Write to file failed: ' + (err.message || err.msg || err));
		console.error(err.stack);
	}
};
const execute = (ai) => new Promise(res => {
	Console({
		name: "Translator",
		version: "0.0.1"
	})
	.add('action')
	.setParam('<action> >> Action name')
	.addOption("--target -t <target> >> Set target")
	.addOption("--language -l [language] >> Set language")
	.addOption("--output -o [output] >> Set output path")
	.addOption("--start -s [start] >> Set start position")
	.on("command", async (param, socket) => {
		param = param.mission.filter(p => p.name === 'action' && p.value?.action === 'translate')[0].value;

		var language = param.language || '中文';
		var output = param.output;
		if (!output) {
			output = join(process.cwd(), 'out', 'translate.md');
		}
		else if (output.match(/^\./)) {
			output = join(process.cwd(), output);
		}

		var target = param.target;
		if (target.match(/^https?:\/\//i)) {
			if (!browse.isURL(target)) {
				target = "Invalid URL.";
			}
			else {
				let content = await browse.execute('Claude', ai, {url: target});
				target = content.reply
					.replace(/^content:\n*|\n*Now use the page content to continue the tasks and goals, please\.\s*$/gi, '')
				;
			}
		}
		else if (target.match(/^[\\\/\.]/) && !target.match(/\n/)) {
			let filepath = target;
			if (target.match(/^\./)) {
				filepath = join(process.cwd(), target);
			}
			try {
				let content = await readFile(filepath, 'utf-8');
				target = content;
			}
			catch (err) {
				target = 'No such file.';
			}
		}

		var oriLen = target.length, loop = 0, time = Date.now();
		var start = param.start || 1;
		if (start < 1) start = 1;
		target = decompose(target);
		if (start > target.length + 1) start = target.length + 1;
		target.splice(0, start - 1);

		var result = [];
		try {
			let input = await readFile(output, 'utf-8');
			result.push(input);
		} catch {}

		console.log('Translating: ' + start + ' / ' + (target.length + start - 1));
		for (let i = 0; i < target.length; i ++) {
			let part = target[i];
			let reply = await translate(ai, language, part);
			result.push(reply[0]);
			loop += reply[1];
			await saveToFile(output, result.join('\n\n'));
			if (i < target.length - 1) {
				console.log('take a break...');
				await wait(Duration);
			}
			console.log('Translating: ' + (result.length + start - 1) + ' / ' + (target.length + start - 1));
		}

		result = result.join('\n\n');
		time = Date.now() - time;
		var trsLen = result.length;
		console.log('Job done: ' + oriLen + ' bytes => ' + trsLen + ' bytes.');
		console.log('Timeused: ' + (time / 1000) + 's.');
		console.log('AI Loops: ' + loop);

		await saveToFile(output, result);

		res(result);
	})
	.launch();
});

Action.execute = async (option, ai) => {
	var result = await execute(ai);
	return result;
};

module.exports = Action;