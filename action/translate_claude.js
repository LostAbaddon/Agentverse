const { readFile, writeFile } = require('fs/promises');
const { join } = require('path');
const ClaudeAgent = require('../ai/agent/claude');
const browse = require('../commands/browse');

const RetryMax = 3;
const Duration = 1000;

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
const sendAndReply = async (ai, prompt) => {
	var loops = 0;
	for (let i = 0; i < RetryMax; i ++) {
		try {
			let result = await ai.send(prompt, 1.0, false);
			loops += result[1];
			result = result[0];
			ai.addMemory(prompt, result);
			return [result, loops];
		}
		catch (err) {
			console.error('Translate failed: ' + (err.message || err.msg || err));
			console.error(err.stack);
			if (i < RetryMax - 1) {
				console.log('wait for retry...');
				await wait(Duration);
				console.log('retrying...');
			}
			else {
				return ['\n\nTranslate failed...\n\n', loops + 1];
			}
		}
	}
};
const translate = async (ai, language, content) => {
	var head = content.match(/^\n*(#*)[ \t]*/);
	if (!head) head = '';
	else head = head[1] + ' ';
	content = content.replace(/^\n*#*[ \t]*/, '');

	ai = ai.copy();
	var loops = 0, answer = '', shouldContinue = true;
	var prompt = ClaudeAgent.Prompts?.translateLongArticle
		.replace(/<language>/i, language)
		.replace(/<content>/i, content)
	;
	var reply = await sendAndReply(ai, prompt);
	loops += reply[1];
	reply = reply[0];
	shouldContinue = !reply.match(/翻译(已经?)?(完成|结束)\s*$/);
	reply = reply.replace(/\s*翻译(已经?)?(完成|结束)\s*$/, '');
	answer = answer + reply;
	console.log('完成部分翻译: ' + reply.length + ' [' + loops + ']');

	prompt = "请继续";
	while (!!reply && shouldContinue) {
		await wait(Duration);
		reply = await sendAndReply(ai, prompt);
		loops += reply[1];
		reply = reply[0];
		shouldContinue = !reply.match(/翻译(已经?)?(完成|结束)\s*$/);
		reply = reply.replace(/\s*翻译(已经?)?(完成|结束)\s*$/, '');
		answer = answer + reply;
		console.log('完成部分翻译: ' + reply.length + ' [' + loops + ']');
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

	return [answer, loops]
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

Action.execute = async (option, ai) => {
	var language = option.language || option.lang || option.lan || option.l || '中文';
	var target = option.target;
	var output = option.out || option.output || option.o;
	if (!output) {
		output = join(process.cwd(), 'out', 'translate.md');
	}

	if (!target) {
		target = 'Empty content.';
	}
	else if (target.match(/^https?$/i)) {
		let args = process.argv.join(' ');
		let pos = args.indexOf(target);
		args = args.substring(pos);
		pos = args.match(/[};]/);
		if (!!pos) args = args.substring(0, pos.index);
		if (!browse.isURL(args)) {
			target = "Invalid URL.";
		}
		else {
			let content = await browse.execute('Claude', ai, {url: args});
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
	target = decompose(target);
	var result = [];
	console.log('Translating: 1 / ' + target.length);
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
		console.log('Translating: ' + (result.length + 1) + ' / ' + target.length);
	}

	result = result.join('\n\n');
	time = Date.now() - time;
	var trsLen = result.length;
	console.log('Job done: ' + oriLen + ' bytes => ' + trsLen + ' bytes.');
	console.log('Timeused: ' + (time / 1000) + 's.');
	console.log('AI Loops: ' + loop);

	await saveToFile(output, result);

	return result;
};

module.exports = Action;