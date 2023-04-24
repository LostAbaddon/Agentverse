require('../../kernel/log.js');
const Logger = _("Utils.Logger");
const logger = new Logger('AI::Claude');
const { readFile, loadPrompt, sendRequest } = require('../agents.js');
const AbstractAgent = require('./abstract.js');
const project = require('../../package.json');

const PREFIX_HUMAN = "Human: ";
const PREFIX_AI = "Assistant: ";

class ClaudeAgent extends AbstractAgent {
	#api_key = '';
	#model = '';
	#temperature = 0;
	#max_token = 1024;
	#api_url = "";
	#client_id = "";

	#knowledge = [];
	#memory = [];

	static async loadPrompt () {
		if (!!ClaudeAgent.Prompts) return;
		ClaudeAgent.Prompts = await loadPrompt('claude');
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
	}
	async loadKnowledge (filepath) {
		var knowledge;
		try {
			knowledge = await readFile(filepath);
		}
		catch (err) {
			logger.error('Load Knowledge failed: ' + err.message);
			return;
		}

		knowledge = knowledge.split(/[\r\n]+/).map(k => k.trim()).filter(k => !!k);
		this.#knowledge = knowledge;
		logger.log('Knowledge loaded: ' + filepath);
	}

	async send (prompt, heat=1.0) {
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
				human.push(PREFIX_HUMAN + ClaudeAgent.Prompts.systemInfo + 'current time is ' + nowTime);
				human.push(prompt);
				human.push(ClaudeAgent.Prompts.replyFormat);
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

			logger.info('Send request to Claude...');
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
	async ask (prompt, heat) {
		var [answer, loop, timespent] = await this.send(prompt, heat);
		this.#memory.push([prompt, answer]);
		logger.info("Claude Replied spent " + loop + ' loops and ' + timespent + ' ms.');
		return answer;
	}
}

module.exports = ClaudeAgent;