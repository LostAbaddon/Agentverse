require('../../kernel/log.js');
const { readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const setStyle = _('CL.SetStyle');
const Logger = _("Utils.Logger");
const logger = new Logger('AI::Claude');
const { readFile, loadPrompt, sendRequest, md2json } = require('../agents.js');
const AbstractAgent = require('./abstract.js');
const Commands = require('../../commands');
const project = require('../../package.json');
const logFolder = join(process.cwd(), 'out', 'log');

const PrintStyle = {
	log: "bold green",
	info: "bold yellow",
	warn: "bold magenta",
	error: "bold red"
};
const PREFIX_HUMAN = "Human: ";
const PREFIX_AI = "Assistant: ";
const MaxEmptyLoop = 5;

const LogInOut = true;

const print = (hint, content, type="info") => {
	var cmd = !!PrintStyle[type] ? type : 'info';
	var style = PrintStyle[type] || type;
	if (global.isSingleton) {
		console[cmd](setStyle(hint, style) + content);
	}
	else {
		logger[cmd](hint + content);
	}
};
const normalize = content => {
	content = content.split(/\r*\n\r*/);
	content = content.map(line => {
		var match = line.match(/^[^'"\w]*('|")?[^'"\w]*(thoughts?|commands?|reasoning|plan|criticism|speak)\W*?\1[^'"\w]*('|")?(.*?)\3\W*$/i);
		if (!!match) {
			let name = match[2], content = match[4];
			if (!name) return line;
			name = name.toLowerCase();
			if (name === 'thought') name = 'thoughts';
			else if (name === 'commands') name = 'command';
			return ['# ' + name, content];
		}
		else {
			return line;
		}
	}).flat(100);
	return content.join('\n');
};
const analyzeCommands = content => {
	var json = [], last = '';
	content = '\n' + (content || '').split(/\r*\n\r*/).join('\n\n') + '\n';
	content.replace(/\n[^'":]*(['"]?)([\w_ ]+)\1?|:\s*[\[\{]+([\w\W]*?)[\]\}]+[^\[\]\{\}]*?\n/gi, (match, _, name, value) => {
		if (!!name) {
			let m = match.match(/^\W*([\w_ ]+)/);
			name = m[1];
			last = name;
		}
		else {
			value = value
				.replace(/(\s*\n\s*)+/g, ' ')
				.replace(/^[\s,;:]+|[\s,;:]+$/g, '')
			;
			let poses = [], args = {};
			value = '\n' + value + '\n';
			value.replace(/[^\w'":,;\n]*[,;\n][^\w'":,;\n]*(\\*)(['"]?)([\w_ ]+)\2\s*:\s*/gi, (match, pre, quote, name, pos) => {
				pre = pre || '';
				var len = pre.length || 0;
				if (len >> 1 << 1 !== len) return;
				var loc = pos + match.length;
				poses.push([pos, loc, name]);
			});
			poses.push([value.length, value.length, '']);
			for (let i = 0, len = poses.length - 1; i < len; i ++) {
				let s = poses[i][1], e = poses[i + 1][0];
				let v = value.substring(s, e);
				v = v.replace(/^[\s'"]*|[\s'"]*$/g, '');
				args[poses[i][2]] = v;
			}
			json.push([last, args, match]);
		}
		return match;
	});
	return json;
};
const analyzeRole = role => {
	role = role
		.replace(/^(#*\s*|\-\s*|\+\s*|\*\s*|\d+\.\s*)*\s*/, '')
		.trim()
		.replace(/[\*_`'"!\?\\\/]/gi, '')
	;
	var list = role.split(/\s*[:：]+\s*/);
	return list.last;
};
const showAIResponse = response => {
	if (!!response.thoughts) {
		print("AI thought: ", response.thoughts.replace(/[\r\n]+/g, '\n'), 'info');
	}
	if (!!response.reasoning) {
		print("Reasons: ", response.reasoning.replace(/[\r\n]+/g, '\n'), 'info');
	}
	if (!!response.plan && !!response.plan.length) {
		print("Next Plan:\n", response.plan.replace(/[\r\n]+/g, '\n'), 'info');
	}
	if (!!response.criticism) {
		print("Criticism: ", response.criticism.replace(/[\r\n]+/g, '\n'), 'info');
	}
	if (!!response.speak) {
		print("Talking to YOU: ", response.speak.replace(/[\r\n]+/g, '\n'), 'log');
	}
	if (!!response.command && !!response.command.length) {
		print("Jobs to do: ", '', 'bold blue');
		for (let cmd of response.command) {
			print("- ", cmd[0] + '(' + JSON.stringify(cmd[1]) + ')', 'bold blue');
		}
	}
};

class ClaudeAgent extends AbstractAgent {
	#api_key = '';
	#model = '';
	#temperature = 0;
	#max_token = 1024;
	#api_url = "";
	#client_id = "";
	#retryMax = 1;
	#interval = 300;

	#knowledge = [];
	#memory = [];

	static async loadPrompt () {
		if (!!ClaudeAgent.Prompts) return;

		ClaudeAgent.Jobs = [];
		var list = await readdir(join(process.cwd(), 'prompts'));
		list = list.filter(f => {
			var match = f.match(/^claude(.*)ini$/i)
			if (!match) return false;
			var mid = match[1];
			match = mid.match(/^\-(.*)\.$/);
			if (!match) return true;
			mid = match[1];
			if (!mid) return true;
			ClaudeAgent.Jobs.push(mid);
			return true;
		}).map(l => l.replace(/\.ini$/i, ''));

		ClaudeAgent.Workflow = {};
		await Promise.all(list.map(async file => {
			var data = await loadPrompt(file);
			if (file === 'claude') {
				ClaudeAgent.Prompts = data;
			}
			else {
				ClaudeAgent.Workflow[file.replace(/^claude\-/i, '')] = data;
			}
		}));
	}

	constructor (id, config) {
		super(id, config);
		this.#api_url = config.url || "https://api.anthropic.com/v1/complete";
		this.#client_id = config.client || project.name + "/" + project.version;
		this.#api_key = config.key || 'empty';
		this.#model = config.model || 'claude-v1';
		if (config.temperature >= 0 && config.temperature <= 1) {
			this.#temperature = config.temperature;
		}
		if (config.max_token > 0 && config.max_token <= 8000) {
			this.#max_token = config.max_token;
		}
		if (config.retry > 0) {
			this.#retryMax = config.retry;
		}
		if (config.interval > 0) {
			this.#interval = config.interval;
		}
	}
	copy () {
		var ai = new ClaudeAgent(null, {
			url: this.#api_url,
			client: this.#client_id,
			key: this.#api_key,
			model: this.#model,
			temperature: this.#temperature,
			max_token: this.#max_token,
			retry: this.#retryMax,
			interval: this.#interval,
		});
		ai.addKnowledge(this.#knowledge);
		return ai;
	}

	async loadKnowledge (filepath) {
		var knowledge;
		try {
			knowledge = await readFile(filepath);
		}
		catch (err) {
			err = err.message || err.msg || err;
			print("Load Knowledge failed: ", err, 'error');
			return;
		}

		knowledge = knowledge.split(/[\r\n]+/).map(k => k.trim()).filter(k => !!k);
		this.#knowledge = knowledge;
		print('Knowledge loaded: ', filepath, 'log');
	}
	addKnowledge (knowledge) {
		var count = 0;
		if (String.is(knowledge)) {
			if (!!knowledge) {
				this.#knowledge.push(knowledge);
				count = 1;
			}
		}
		else if (Array.is(knowledge)) {
			knowledge.forEach(k => {
				if (!k) return;
				this.#knowledge.push(k);
				count ++;
			});
		}
		if (count > 0) {
			print('Knowledge added: ', count, 'log');
		}
	}

	async send (prompt, heat=1.0, addtion=true) {
		var content = [], timespent = Date.now();

		if (this.#knowledge.length > 0) {
			content.push(PREFIX_HUMAN + ClaudeAgent.Prompts.knowledge + '\n' + this.#knowledge.join('\n'));
		}

		var memory = this.#memory
			.map(mem => {
				var list = [];
				if (!mem || !mem.length) {
					return null;
				}
				if (!!mem[0]) list.push(PREFIX_HUMAN + mem[0]);
				if (!!mem[1]) list.push(PREFIX_AI + mem[1]);
				return list.join('\n\n');
			})
			.filter(m => !!m)
			.join('\n\n');
		if (!!memory) {
			content.push(memory);
		}

		content = content.join('\n\n');
		var session, notFinish = true, firstTime = true, answer = '', error, human, loop = 0;
		var nowTime = _('Utils').getTimeString(null, 'YYYY/MM/DD hh:mm:ss');

		while (notFinish) {
			loop ++;

			let current = [];
			if (firstTime) {
				human = [];
				if (addtion) {
					human.push(PREFIX_HUMAN + ClaudeAgent.Prompts.systemInfo + 'current time is ' + nowTime);
					human.push(prompt);
					human.push('');
					human.push(ClaudeAgent.Prompts.replyFormat);
				}
				else {
					human.push(PREFIX_HUMAN + prompt);
				}
				human = human.join('\n');
				current.push(human);
			}
			else {
				current.push(human);
				current.push(PREFIX_AI + answer);
				current.push(PREFIX_HUMAN + ClaudeAgent.Prompts.continueChat);
			}
			if (!!content) current.unshift(content);
			current.push(PREFIX_AI);
			current = '\n\n' + current.join('\n\n');

			let reply
			let data = {
				model: this.#model,
				prompt: current,
				stop_sequences: [PREFIX_HUMAN, PREFIX_AI],
				temperature: heat || this.#temperature,
				max_tokens_to_sample: this.#max_token,
			};

			if (!global.isSingleton) logger.info('Send request to Claude...');
			for (let i = this.#retryMax; i > 0; i --) {
				try {
					reply = await sendRequest({
						url: this.#api_url,
						method: "POST",
						headers: {
							Accept: "application/json",
							"Content-Type": "application/json",
							Client: this.#client_id,
							"X-API-Key": this.#api_key,
						},
						data,
					});
					if (LogInOut) {
						try {
							let idx = global._writeIdx || 0;
							try {
								await Promise.all([
									writeFile(join(logFolder, 'output-' + idx + '.txt'), current, 'utf-8'),
									writeFile(join(logFolder, 'input-' + idx + '.txt'), JSON.stringify(reply), 'utf-8')
								]);
							}
							catch (err) {
								console.error('Save log file failed: ' + (err.message || err.msg || err));
							}
							global._writeIdx = idx + 1;
						} catch {}
					}
					break;
				}
				catch (err) {
					print("Fetch response failed: ", err.message || err.msg || err, "error");
					if (i > 1) {
						logger.info('retry...');
						timespent += this.#interval;
						await wait(this.#interval);
					}
					else {
						throw err;
					}
				}
			}

			if (!!reply.exception) {
				throw new Error(reply.exception);
			}

			let r = reply.completion.replace(/(^[\s\r\t\n]+|[\s\r\t\n]+$)/g, '');
			if (!firstTime) {
				r = r.replace(/^[\s]*with:[\s\t\r\n]*/i, '');
			}
			answer = answer + r;

			notFinish = reply.stop_reason === 'max_tokens';
			firstTime = false;
		}

		timespent = Date.now() - timespent;

		return [answer, loop, timespent];
	}

	async ask (data, heat=1.0) {
		var prompt = data.data;
		var [answer, loop, timespent] = await this.send(prompt, heat);
		this.#memory.push([prompt, answer]);
		var info = "Reply spent " + loop + ' loops and ' + timespent + ' ms.';
		print('System: ', info, 'info');
		return answer;
	}

	async analyzeRole (task) {
		var prompt = ClaudeAgent.Prompts.analyzeRole
			.replace('<jobs>', ClaudeAgent.Jobs.join(', '))
			.replace('<task>', task)
		;

		var answer, loop, timespent;
		try {
			[answer, loop, timespent] = await this.send(prompt, 0.5);
		}
		catch (err) {
			print("Analyze role failed: ", err.message || err.msg || err, 'error');
			throw err;
		}
		answer = answer
			.split(/[\r\n]+/)
			.map(l => analyzeRole(l))
		;

		var info = {};
		info.role = answer[0];
		info.template = answer[1];
		if (!ClaudeAgent.Jobs.includes(info.template)) info.template = 'default';
		info.language = answer[2] || 'English';

		print("Cloude thought the suitest ROLE for this task is: ", info.role, 'log');
		print("           the suitest Workflow for this task is: ", info.template, 'log');
		print("                         output for this task is: ", info.language, 'log');
		return [info, loop, timespent];
	}
	async startMission (workflow, role, task, heat) {
		var nowTime = _('Utils').getTimeString(null, 'YYYY/MM/DD hh:mm:ss');
		var prompt = workflow.missionStart
			.replace('<time>', nowTime)
			.replace('<role>', role)
			.replace('<commands>', Commands.generateCommands())
			.replace('<task>', task.split(/[\n\r]+/).map(l => '- ' + l.trim()).join('\n'))
		;

		var answer, loop, timespent;
		[answer, loop, timespent] = await this.send(prompt, heat, false);
		answer = normalize(answer);

		var result = md2json(answer);
		if (!result) result = {};
		if (Object.keys(result).length === 0) {
			result.thoughts = answer;
			result.speak = answer;
			result.command = '- "task_complete": [ {"reason": "Mission Failed."} ]';
		}
		result.command = analyzeCommands(result.command);
		this.#memory.push([prompt, answer]);
		return [result, loop, timespent];
	}
	async continueMission (workflow, replies, heat) {
		if (!replies || replies.length === 0) {
			replies = workflow.missionContinue;
		}
		else {
			if (!!workflow.missionContinue) {
				replies.push('');
				replies.push(workflow.missionContinue);
			}
			replies = replies.join('\n\n');
		}

		var answer, loop, timespent;
		[answer, loop, timespent] = await this.send(replies, heat, false);
		answer = normalize(answer);

		var result = md2json(answer);
		if (!result) result = {};
		if (Object.keys(result).length === 0) {
			result.thoughts = answer;
			result.speak = answer;
			result.command = '- "task_complete": [ {"reason": "Mission Failed."} ]';
		}
		result.command = analyzeCommands(result.command);
		this.#memory.push([replies, answer]);
		return [result, loop, timespent];
	}
	async executeCommands (commands) {
		var task_complete = true, replies = [], loops = 0, timespent = 0;

		if (!!commands && !!commands.length) {
			for (let cmd of commands) {
				let time = Date.now();
				let [name, args, raw] = cmd;
				let action = Commands.normalizeCommandName(name);
				let command = Commands.getCommandName(action);
				if (!command) {
					print('No match command and AI is trying to find the matchest command: ', action + ' (' + name + ')', 'warn');
					let ai = this.copy();
					let prompt = ClaudeAgent.Prompts.matchCommand
						.replace(/<command_name>/gi, action)
						.replace(/<command_list>/gi, '- ' + Object.keys(Commands.list).join('\n- '))
					;
					let rename = await ai.send(prompt, 0.5, false);
					timespent += Date.now() - time;
					loops += rename[1];
					rename = rename[0];
					print("AI found the matchest command for the unmatched one: ", action + " -> " + rename + ' (' + name + ')', 'info');
					command = Commands.getCommandName(rename);
					if (!command) {
						print("Invalid command: ", name, 'error');
						continue;
					}
					Commands.addAlias(action, rename);
					await wait(this.#interval);
					time = Date.now();
				}
				let argText = [];
				for (let key in args) {
					argText.push(key + '="' + args[key] + '"');
				}
				if (argText.length === 0) {
					argText = '';
				}
				else {
					argText = ' : ' + argText.join(', ');
				}
				try {
					let result = await Commands.executeCommands('claude', {}, command.command, args);
					time = Date.now() - time;
					timespent += time;
					time /= 1000;
					if (!!result.speak) {
						print("Execute command " + command.name + ' completed with respond in ' + time + 's : ', result.speak, 'info');
					}
					if (result.exit !== true && !result.noReply) {
						replies.push("## Command (" + name + ': ' + raw + ') returned:\n' + result.reply);
					}
					if (result.exit === false) {
						task_complete = false;
					}
					await wait(this.#interval);
				}
				catch (err) {
					print('Execute command ' + command.name + ' failed: ', err.message || err.msg || err, 'error');
				}
			}
		}

		return [replies, task_complete, loops, timespent];
	}
	async generateReply (history, language) {
		var reply = 'Mission Completed.';
		if (history.length > 0) {
			reply = history.join('\n\n');
		}
		try {
			let ai = this.copy();
			let prompt = ClaudeAgent.Prompts.translate
				.replace(/<language>/gi, language)
				.replace(/<content>/gi, reply)
			;
			let translate = await ai.send(prompt, 0.5, false);
			translate = translate[0];
			if (!!translate) reply = translate;
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			print('Mission Failed: ', msg, 'error');
			console.log(err);
		}
		if (language.match(/\b\s*(汉语|中文|chinese)\s*$/i)) {
			reply = reply
				.replace(/\s*,\s*/gi, '，')
				.replace(/\s*!\s*/gi, '！')
				.replace(/\s*\?\s*/gi, '？')
				.replace(/\s*;\s*/gi, '；')
				.replace(/\s*:\s*/gi, '：')
			;
		}
		return reply;
	}
	async task (task) {
		var loops = 0, totalTime = 0, max = task.max;
		if (!max) max = Infinity;
		var answer, loop, timespent;
		var replies, completed, emptyLoop = 0, msg;
		var history = [];
		var role, template, language;
		var workflow;
		var heatDecay = parseInt(ClaudeAgent.Prompts.missionHeatDecayRate || 1);
		var heatMin = parseInt(ClaudeAgent.Prompts.missionHeatMin || 0);
		var heatMax = parseInt(ClaudeAgent.Prompts.missionHeatMax || 1);
		var heat = heatMax;

		try {
			[answer, loop, timespent] = await this.analyzeRole(task.data);
			loops += loop;
			totalTime += timespent;
			role = answer.role;
			template = answer.template;
			language = answer.language;
			workflow = ClaudeAgent.Workflow[template] || ClaudeAgent.Workflow.default;
			workflow = Object.assign({}, ClaudeAgent.Workflow.default, workflow);
			await wait(this.#interval);

			[answer, loop, timespent] = await this.startMission(workflow, role, task.data, heat);
			loops += loop;
			totalTime += timespent;
			showAIResponse(answer);
			msg = `task used ${totalTime / 1000} seconds in ${loops} loops(up to ${max} loops).`;
			print("SYSTEM: ", msg, 'info');
			await wait(this.#interval);

			if (!!answer.command && !!answer.command.length) {
				[replies, completed, loop, timespent] = await this.executeCommands(answer.command);
				loops += loop;
				totalTime += timespent;
				msg = `task used ${totalTime / 1000} seconds in ${loops} loops(up to ${max} loops).`;
				print("SYSTEM: ", msg, 'info');
				await wait(this.#interval);
			}
			else {
				replies = null;
			}
			if (!replies || !replies.length) {
				emptyLoop ++;
			}
			else {
				emptyLoop = 0;
			}

			if (!!answer) {
				let ctx = answer.speak || answer.thoughts || answer.reasoning;
				if (!!ctx) history.push(ctx);
			}

			if (completed) {
				return await this.generateReply(history, language);
			}
			if (loops >= max) {
				print("Mission Failed: ", 'AI call times exhausted.', 'error');
				history.push('Mission Failed: AI call times exhausted.');
				return await this.generateReply(history, language);
			}
			if (emptyLoop >= MaxEmptyLoop) {
				print("Mission maybe completed: ", 'AI didn\'t response actively.', 'warn');
				history.push('Mission maybe completed: AI didn\'t response actively.');
				return await this.generateReply(history, language);
			}

			while (1) {
				heat = (heat - heatMin) * heatDecay + heatMin;
				[answer, loop, timespent] = await this.continueMission(workflow, replies, heat);
				loops += loop;
				totalTime += timespent;
				showAIResponse(answer);
				msg = `task used ${totalTime / 1000} seconds in ${loops} loops(up to ${max} loops).`;
				print("SYSTEM: ", msg, 'info');
				await wait(this.#interval);

				if (!!answer.command && !!answer.command.length) {
					[replies, completed, loop, timespent] = await this.executeCommands(answer.command);
					loops += loop;
					totalTime += timespent;
					msg = `task used ${totalTime / 1000} seconds in ${loops} loops(up to ${max} loops).`;
					print("SYSTEM: ", msg, 'info');
					await wait(this.#interval);
				}
				else {
					replies = [];
				}
				if (!replies || !replies.length) {
					emptyLoop ++;
				}
				else {
					emptyLoop = 0;
				}

				if (!!answer) {
					let ctx = answer.speak || answer.thoughts || answer.reasoning;
					if (!!ctx) history.push(ctx);
				}

				if (completed) {
					return await this.generateReply(history, language);
				}
				if (loops >= max) {
					print("Mission Failed: ", 'AI call times exhausted.', 'error');
					history.push('Mission Failed: AI call times exhausted.');
					return await this.generateReply(history, language);
				}
				if (emptyLoop >= MaxEmptyLoop) {
					print("Mission maybe completed: ", 'AI didn\'t response actively.', 'warn');
					history.push('Mission maybe completed: AI didn\'t response actively.');
					return await this.generateReply(history, language);
				}
			}
		}
		catch (err) {
			let msg = err.message || err.msg || err;
			print('Mission Failed: ', msg, 'error');
			console.log(err.stack);
			history.push('mission failed: ' + msg);
			return await this.generateReply(history, language);
		}

		return answer;
	}
}

module.exports = ClaudeAgent;