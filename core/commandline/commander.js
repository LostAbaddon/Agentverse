/**
 * Name:	Commander Line Parser
 * Desc:    命令行解析
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.13
 *
 * 命令行格式：	caller (<mgparam>|[ogparam]) command (-opt|--option) (<mparam>|[oparam]|[...optionlist])
 * 参数格式：		{
 * 					params: Ordered Strings (<must> [options] [optiongroup]),
 * 					options: [
 * 						{
 * 							name: String,
 * 							short: String,
 * 							params: Ordered Strings (<must> [options] [optiongroup])
 * 						},
 * 						...
 * 					],
 * 					modules: [
 * 						{
 * 							quest: String,
 * 							alias: StringArray,
 * 							params: Ordered Strings (<must> [options] [optiongroup]),
 * 							options: [
 * 						 		{
 * 							 		name: String,
 * 							 		short: String,
 * 							 		params: Ordered Strings (<must> [options[=defaultvalue]] [...optionlist[=defaultvalue]])
 * 						 		},
 * 						 		...
 * 							]
 * 						},
 * 						...
 * 					]
 * 				}
 */

const EventEmitter = require('events');

require('../extend');
const setStyle = require('./setConsoleStyle');
const cli = require('./cli');

const RegMonoWidthChars = /[\x00-\xff–]+/g;
const getCLLength = text => {
	var len = text.length;
	var ascii = text.match(RegMonoWidthChars);
	if (!ascii) ascii = [''];
	return len * 2 - ascii.join('').length;
};

const isDate = v => v.match(/^\d{2,4}-\d{1,2}-\d{1,2}(\/\d{1,2}:\d{1,2}(:\d{1,2}(\.\d+)?)?)?$/);
const toRegExp = reg => new RegExp(reg);

// 参数分隔，必须使用空格的时候，用“\ ”或者“[:SPACE:]”代替
const paramsSep = params => {
	if (!params) return [];
	if (params.trim().length === 0) return [];
	params = params.split(/ +/);
	return params;
}

// 参数值获取，自动识别布尔值、数字、日期、简单数组和简单对象，必须使用分号与冒号时加前缀\或者用转移辞“[-semi-]”、“[-colon-]”
// 简单数组格式：[xxx;xxx;xxx]
// 简单对象格式：{key:value;key:value;key:value}
const parseSimpleValue = v => {
	var n = v * 1;
	if (!isNaN(n)) return [n, true];
	if (v.match(/^true$/i)) return [true, true];
	if (v.match(/^false$/i)) return [false, true];
	if (v.match(/^('|").*(\1)$/)) return [v.substring(1, v.length - 1), true];
	if (isDate(v)) return [new Date(v), true];
	return [v, false];
};
const getParamValue = v => {
	v = parseSimpleValue(v);
	if (v[1]) return v[0];
	v = v[0];
	if (v.match(/^\[.*\]$/)) {
		v = v.substring(1, v.length - 1);
		v = v.replace(/\\;/gi, '[-semi-]');
		v = v.split(';');
		v = v.map(v => {
			v = v.replace(/\[-semi-\]/gi, ';');
			v = parseSimpleValue(v);
			return v[0];
		});
		return v;
	}
	if (v.match(/^\{.*\}$/)) {
		let r = {};
		v = v.substring(1, v.length - 1);
		v = v.replace(/\\;/gi, '[-semi-]');
		v = v.replace(/\\:/gi, '[-colon-]');
		v = v.split(';');
		v.map(v => {
			v = v.split(':');
			if (!v[1]) return;
			v[0] = v[0].replace(/\[-semi-\]/gi, ';').replace(/\[-colon-\]/gi, ':');
			v[1] = v[1].replace(/\[-semi-\]/gi, ';').replace(/\[-colon-\]/gi, ':');
			v[1] = parseSimpleValue(v[1]);
			r[v[0]] = v[1][0];
		});
		return r;
	}
	return v;
};
const simpleParam2String = p => {
	if (p === true || p === false) return p ? 'true' : 'false';
	if (p instanceof Date) {
		let year = p.getYear() + 1900;
		let month = p.getMonth() + 1;
		let date = p.getDate();
		let hour = p.getHours();
		let minute = p.getMinutes() + 1;
		let second = p.getSeconds();
		if (hour === 0 && minute === 0 && second === 0) return year + '-' + month + '-' + date;
		return year + '-' + month + '-' + date + '/' +  hour + ':' + minute + ':' + second;
	}
	if (!isNaN(p) || String.is(p)) return p + '';
	return p;
};
const param2String = p => {
	var q = simpleParam2String(p);
	if (String.is(q)) return q;
	if (p instanceof Array) {
		q = [];
		p.map(x => {
			x = simpleParam2String(x);
			if (String.is(x)) q.push(x);
		});
		q = '[' + q.join(';') + ']';
		return q;
	}
	q = Object.keys(p);
	q = q.map(x => {
		var y = p[x];
		y = simpleParam2String(y);
		if (String.is(y)) return x + ':' + y;
		return null;
	}).filter(x => !!x).join(';');
	q = '{' + q + '}';
	return q;
};
const encodeEscape = line => line.replace(/\\ /g, '[:SPACE:]');
const decodeEscape = line => line.replace(/\[:SPACE:\]/g, ' ');

// 格式：<mparam>( <mparam>)*( [oparam])*( [...optionlist])?
class Params {
	constructor (params) {
		this.musts = [];
		this.options = [];
		this.optionlist = null;
		this.defaultValues = {};
		this.valueRanges = {};
		params = paramsSep(params);
		params = params.filter(p => p.match(/^(<.*>|\[.*\])$/));
		params.map(p => {
			var tag = p.substring(0, 1);
			var opt = p.substring(1, p.length - 1).trim();
			if (tag === '<') { // 必填参数
				let range = opt.match(/\(.*\)$/);
				if (!!range) {
					range = range[0];
					opt = opt.replace(range, '');
					range = toRegExp(range.substring(1, range.length - 1));
					this.valueRanges[opt] = range;
				}
				if (this.musts.indexOf(opt) < 0) this.musts.push(opt);
			}
			else if (tag === '[') { // 选填参数
				let range, isArray;
				if (opt.substring(0, 3) === '...') { // 选填参数组
					opt = opt.substring(3, opt.length);
					range = opt.match(/(\(.*?\)=|\(.*?\)$)/);
					isArray = true;
				}
				else {
					range = opt.match(/\(.*?\)[=$]/);
					isArray = false;
				}
				if (!!range) {
					range = range[0];
					if (range.substring(range.length - 1, range.length) === '=') range = range.substring(0, range.length - 1);
					opt = opt.replace(range, '');
					range = toRegExp(range.substring(1, range.length - 1));
				}
				if (opt.indexOf('=') > 0) { // 带缺省值
					opt = opt.split('=');
					let defval = opt[1];
					opt = opt[0];
					if (this.options.indexOf(opt) < 0 && this.optionlist !== opt) {
						if (!!range) this.valueRanges[opt] = range;
						if (isArray) {
							this.optionlist = opt;
							defval = getParamValue(defval);
							if (!(defval instanceof Array)) defval = [defval];
							this.defaultValues[opt] = defval;
						}
						else {
							this.options.push(opt);
							this.defaultValues[opt] = getParamValue(defval);
						}
					}
				}
				else { // 不带缺省值
					if (this.options.indexOf(opt) < 0 && this.optionlist !== opt) {
						if (!!range) this.valueRanges[opt] = range;
						if (isArray) {
							this.optionlist = opt;
						}
						else {
							this.options.push(opt);
						}
					}
				}
			}
		});
	}
	parse (params, helpMode) {
		var result = {};
		if (!(params instanceof Array)) params = paramsSep(params);
		params = params.map(p => decodeEscape(p)); // 处理转义符
		var len, index = 0, plen = params.length;
		// 先解析必填参数
		len = this.musts.length;
		if (!helpMode && plen < len) {
			throw new Error("缺少参数 " + this.musts.copy().splice(plen, this.musts.length).join(' 、 ') + " !");
		}
		var qlen = helpMode ? plen : len;
		for (let i = 0; i < qlen; i ++) {
			let key = this.musts[i];
			let value = getParamValue(params[index]);
			let range = this.valueRanges[key];
			if (!!range && !(value + '').match(range)) {
				throw new Error("参数 " + key + " 的值 " + value + " 不符合取值范围 " + range + " !");
			}
			result[key] = value;
			index ++;
		}
		// 处理选填参数
		len = this.options.length;
		for (let i = 0; i < len; i ++) {
			let n = this.options[i];
			let v = params[index];
			let r = this.valueRanges[n];
			if (!!v) v = getParamValue(v);
			else v = this.defaultValues[n];
			if (!!v || v === false || v === 0) {
				if (!!r && !(v + '').match(r)) {
					throw new Error("参数 " + n + " 的值 " + v + " 不符合取值范围 " + r + " !");
				}
				result[n] = v;
			}
			index ++;
		}
		// 处理选填参数组
		if (this.optionlist !== null) {
			let list;
			let range = this.valueRanges[this.optionlist];
			if (plen - index > 0) {
				list = [];
				for (let i = index; i < plen; i ++) {
					let v = getParamValue(params[i]);
					if (!!range && !(v + '').match(range)) {
						throw new Error("缺省参数组 " + this.optionlist + " 的值 " + v + " 不符合取值范围 " + range + " !");
					}
					list.push(v);
				}
				if (list.length > 0) result[this.optionlist] = list;
			}
			else {
				list = this.defaultValues[this.optionlist];
				if (!!list && list.length > 0) result[this.optionlist] = list;
			}
		}
		return result;
	}
	toString () {
		var line = [];
		this.musts.map(m => line.push('<' + m.trim() + '>'));
		this.options.map(m => line.push('[' + m.trim() + ']'));
		if (!!this.optionlist) {
			if (this.optionlist !== 'args' || line.length > 0) line.push('[...' + this.optionlist.trim() + ']');
		}
		line = line.filter(l => l.trim().length > 0);
		return line.join(' ').trim();
	}
	get notEmpty () {
		if (this.musts.length > 0) return true;
		if (this.options.length > 0) return true;
		return !!this.optionlist;
	}
}
// 格式：-opt --option <mparam>( <mparam>)*( [oparam])*( [...optionlist])? >> desc
class Option {
	constructor (name, short, params, desc) {
		this.name = name;
		this.short = short || null;
		if (params instanceof Params) this.params = params;
		else {
			// if (!params || params.trim().length === 0) params = '[...args]';
			this.params = new Params(params);
		}
		this.desc = desc || '';
	}
	static parse (option) {
		option = option.split(' >> ');
		var desc = (option[1] || '').trim();
		option = ' ' + option[0] + ' ';
		var name = option.match(/ --\w/gi);
		if (!name) throw new Error('缺少开关参数！');
		else if (name.length > 1) throw new Error('开关过多！');
		else {
			name = option.match(/ --(.*?) /)[1];
			option = option.replace(' --' + name + ' ', ' ');
		}
		var short = option.match(/ -\w/gi);
		if (!short) short = null;
		else if (short.length > 1) throw new Error('短开关过多！');
		else {
			short = option.match(/ -(.*?) /)[1];
			option = option.replace(' -' + short + ' ', ' ');
		}
		return new Option(name, short, option, desc);
	}
	parse (params, helpMode) {
		var result = { name: this.name, active: false, params: null };
		if (!(params instanceof Array)) params = paramsSep(params);
		var tag = params[0], ego = '--' + this.name;
		if (tag === ego) result.active = true;
		else if (!!this.short) {
			ego = '-' + this.short;
			if (tag === ego) result.active = true;
		}
		if (!result.active) return result;
		params.shift();
		result.params = this.params.parse(params, helpMode);
		return result;
	}
	toString () {
		var line = '--' + this.name;
		if (!!this.short) line += '|-' + this.short;
		var param = this.params.toString();
		if (param.length > 0) line += ' ' + param;
		return line.trim();
	}
}
// 格式：command(|alias)*( -opt --option <mparam>( <mparam>)*( [oparam])*( [...optionlist])?)+ >> desc
class Quest {
	constructor (command, alias, params, options, desc) {
		this.command = command;
		if (alias instanceof Array) this.alias = alias;
		else if (String.is(alias)) this.alias = [alias];
		else this.alias = null;
		this.desc = desc || '';
		if (params instanceof Params) this.params = params;
		else {
			// if (!params || params.trim().length === 0) params = '[...args]';
			this.params = new Params(params);
		}
		this.optionGroup = [];
		var _options = {};
		Object.defineProperty(this, 'options', {
			value: _options,
			configurable: false,
			enumerable: false
		});
		if (!options) options = [];
		else if (options instanceof Option) options = [options];
		else if (String.is(options)) options = [options];
		options.map(opt => {
			if (!(opt instanceof Option)) {
				if (String.is(opt)) {
					opt = Option.parse(opt);
				}
				else {
					opt = new Option(opt.name, opt.short, opt.params, opt.desc);
				}
			}
			this.options['--' + opt.name] = opt;
			if (!!opt.short) this.options['-' + opt.short] = opt;
			this.optionGroup.push(opt);
		});
	}
	static parse (option) {
		option = option.split(' >> ');
		var desc = (option[1] || '').trim();
		option = option[0] + ' ';
		var command = option.split(' ')[0];
		option = option.replace(command + ' ', '');
		var alias = command.split('|');
		command = alias.shift();
		var options = option.split(' --');
		var params = options.shift();
		params = new Params(params);
		options = options.map(opt => {
			opt = '--' + opt;
			return Option.parse(opt);
		});
		return new Quest(command, alias, params, options, desc);
	}
	parse (quest, helpMode) {
		var result = { name: this.command, active: false, params: null };
		if (!(quest instanceof Array)) quest = paramsSep(quest);
		var cmd = quest.shift();
		if (cmd === this.command || this.alias.indexOf(cmd) >= 0) {
			result.active = true;
		}
		else {
			return result;
		}
		quest = (' ' + quest.join(' ')).split(' -');
		var params = quest.shift().trim();
		params = this.params.parse(params, helpMode);
		var options = [];
		quest.map(p => {
			p = '-' + p.trim();
			var q = p.split(' ')[0];
			q = this.options[q];
			if (!!q) options.push(q.parse(p, helpMode));
		});
		result.params = [];
		Object.keys(params).map(p => result.params.push({ name: p, value: params[p]}));
		options.map(o => result.params.push({ name: o.name, params: o.params }));
		return result;
	}
	has (option) { // 是否包含指定名称的option
		return this.optionGroup.some(opt => opt.name === option);
	}
	contain (opt) { // 是否包含指定名称与简称的option
		return !!this.options['--' + opt] || !!this.options['-' + opt];
	}
	add (option) {
		this.remove(option.name);
		if (String.is(option)) option = Option.parse(option);
		else if (!(option instanceof Option)) {
			option = new Option(option.name, option.short, option.params, option.desc);
		}
		this.options['--' + option.name] = option;
		if (!!option.short) this.options['-' + option.short] = option;
		this.optionGroup.push(option);
		return this;
	}
	remove (option) {
		var opt = this.options['--' + option];
		if (!opt) return this;
		this.options['--' + option] = null;
		if (!!opt.short) this.options['-' + opt.short] = null;
		var index = this.optionGroup.indexOf(opt);
		if (index >= 0) this.optionGroup.splice(index, 1);
		return this;
	}
	set (param) {
		if (params instanceof Params) this.params = params;
		else {
			// if (!params || params.trim().length === 0) params = '[...args]';
			this.params = new Params(params);
		}
		return this;
	}
	describe (desc) {
		if (!!desc) this.desc = desc || '';
		return this;
	}
	toString () {
		var param = this.params.toString();
		var line = this.command.trim();
		if (!!this.alias) this.alias.map(alias => line += '|' + alias.trim());
		line = line.trim();
		var options = [];
		this.optionGroup.map(opt => {
			var line = opt.toString();
			options.push(line);
		});
		options.unshift(param);
		options.unshift(line);
		options = options.filter(l => l.trim().length > 0);
		line = options.join(' ');
		return line.trim();
	}
}
// 格式：caller ( -opt --option <mparam>( <mparam>)*( [oparam])*( [...optionlist])?)?(\ncommand(|alias)*( -opt --option <mparam>( <mparam>)*( [oparam])*( [...optionlist])?)+)? >> desc
class Command {
	constructor (params, options, quests, desc) {
		this.desc = desc || '';
		if (quests instanceof Quest) quests = [quests];
		else if (String.is(quests)) quests = [quests];
		else if (!(quests instanceof Array)) quests = [];
		quests = quests.map(q => {
			if (q instanceof Quest) return q;
			if (String.is(q)) return Quest.parse(q);
			return null;
		}).filter(q => !!q);
		if (!quests.some(q => q.command === '[global]')) {
			quests.unshift(new Quest('[global]', null, params, options));
		}
		this.questGroup = [];
		var _quests = {};
		Object.defineProperty(this, 'quests', {
			value: _quests,
			configurable: false,
			enumerable: false
		});
		quests.map(q => {
			this.questGroup.push(q);
			var cmd = [];
			if (!!q.alias) cmd = q.alias.copy();
			cmd.unshift(q.command);
			cmd.map(cmd => {
				this.quests[cmd] = q;
			});
		});
		// 补上help默认命令
		var currQuest = _quests['[global]'];
		if (!currQuest.has('help')) {
			currQuest.add('--help -h >> 显示帮助');
		}
		// 指针
		var currOption = currQuest.options['--help'];
		Object.defineProperty(this, 'currentQuest', {
			get: () => currQuest,
			set: (quest) => currQuest = quest,
			enumerable: false
		});
		Object.defineProperty(this, 'currentOption', {
			get: () => currOption,
			set: (option) => currOption = option,
			enumerable: false
		});
	}
	static parse (config) {
		if (String.is(config)) {
			config = config.split(' >> ');
			var desc = (config[1] || '').trim();
			config = ('[global] ' + config[0].trim()).split('\n').filter(q => q.trim().length > 0);
			return new Command(null, null, config, desc);
		}
		else if (!config) {
			return new Command();
		}
		else {
			return new Command(config.params, config.options, config.quests, config.desc);
		}
	}
	parse (command) {
		command = encodeEscape(command); // 特殊字符转义
		if (command.substring(0, 9) !== '[global] ') command = '[global] ' + command;
		var sepcmd = Object.keys(this.quests);
		var cmds = [];
		paramsSep(command).map(cmd => {
			if (sepcmd.indexOf(cmd) >= 0) {
				if (cmds.length > 0) cmds[cmds.length - 1][1] = cmds[cmds.length - 1][1].trim();
				cmds.push([cmd, cmd + ' ']);
			}
			else {
				cmds[cmds.length - 1][1] += cmd + ' ';
			}
		});
		cmds[cmds.length - 1][1] = cmds[cmds.length - 1][1].trim();
		var helpMode = !!((' ' + cmds[0][1] + ' ').match(/ (\-\-help|\-h) /));
		var result = [];
		cmds.map(c => {
			var quest = this.quests[c[0]];
			if (!quest) return;
			var r = quest.parse(c[1], helpMode);
			if (!r.active) return;
			var quest = r.name;
			if (quest === '[global]') quest = 'global';
			var params = r.params;
			result.push({ quest, params });
		});
		return result;
	}
	has (command) { // 是否包含指定名称的command
		return this.questGroup.some(quest => quest.command === command);
	}
	contain (cmd) { // 是否包含指定简称的command
		return !!this.quests[cmd];
	}
	add (quest) {
		this.remove(quest.command);
		if (String.is(quest)) quest = Quest.parse(quest);
		else if (!(quest instanceof Quest)) {
			quest = new Quest(quest.command, quest.alias, quest.params, quest.options, quest.desc);
		}
		this.questGroup.push(quest);
		this.quests[quest.command] = quest;
		if (!!quest.alias) quest.alias.map(a => {this.quests[a] = quest;});
		this.currentQuest = quest;
		return this;
	}
	remove (quest) {
		var qst = this.quests[quest];
		if (!quest) return this;
		this.quests[quest] = null;
		if (!!qst.alias) qst.alias.map(a => {this.quests[a] = null;});
		var index = this.questGroup.indexOf(qst);
		if (index >= 0) this.questGroup.splice(index, 1);
		if (qst.command === this.currentQuest.command) this.currentQuest = this.quests['[global]'];
		return this;
	}
	describe (desc) {
		if (!!desc) this.desc = desc || '';
		return this;
	}
	command (cmd) {
		if (cmd === 'global') cmd = '[global]';
		if (!cmd) return this;
		cmd = this.quests[cmd];
		if (!!cmd) {
			this.currentQuest = cmd;
			this.currentOption = cmd.optionGroup[0];
		}
		return this;
	}
	option (option) {
		option = this.currentQuest['--' + option];
		if (!option) return this;
		this.currentOption = option;
		return this;
	}
	hasOption (option) {
		return this.currentQuest.has(option);
	}
	containOption (option) {
		return this.currentQuest.contain(option);
	}
	setParam (params) {
		if (params instanceof Params) this.params = params;
		else {
			// if (!params || params.trim().length === 0) params = '[...args]';
			this.currentQuest.params = new Params(params);
			// this.quests['[global]'].params = new Params(params);
		}
		return this;
	}
	addOption (option) {
		this.currentQuest.add(option);
		return this;
	}
	removeOption (option) {
		this.currentQuest.remove(option);
		return this;
	}
	setOptionParam (param) {
		this.currentOption.set(param);
		return this;
	}
	describeQuest (desc) {
		this.currentQuest.describe(desc);
		return this;
	}
	describeOption (desc) {
		this.currentOption.describe(desc);
		return this;
	}
	toString () {
		var defaultString = '';
		var string = [];
		this.questGroup.map(quest => {
			var line = quest.toString();
			if (quest.command === '[global]') {
				defaultString = line.replace('[global]', '').trim();
			}
			else {
				string.push(line.trim());
			}
		});
		string.unshift(defaultString);
		string = string.filter(l => l.trim().length > 0);
		return string.join(' ');
	}
}

const HelpLayoutConfig = {
	lev1: 10,
	lev2: 18,
	lev3: 20,
	right: 56,
	title: 24,
	help: 4,
	helpleft: 8,
	helpright: 32
};
const GenerateHelp = (command, cmdlist, title) => {
	title = title || '帮助说明';
	var helpContent = String.blank(HelpLayoutConfig.title) + setStyle('  ' + title + '  ', ['bold', 'underline']) + '\n\n';
	helpContent += setStyle('用法：', 'bold') + command.toString() + '\n\n';
	if (!!command.desc) helpContent += setStyle('简介：', 'bold') + '\n' + command.desc + '\n\n';
	let selectCommands = [];
	let scp = {};
	if (cmdlist.length <= 1) selectCommands = command.questGroup;
	else {
		let sc = cmdlist.map(q => {
			var quest = q.quest === 'global' ? '[global]' : q.quest;
			var scpq = q.params.map(p => p.name);
			if (quest === '[global]') {
				scpq.splice(scpq.indexOf('help'), 1);
				if (scpq.length > 0) scp[quest] = scpq;
			}
			else {
				scp[quest] = scpq;
			}
			return quest;
		});
		command.questGroup.map(q => {
			if (sc.indexOf(q.command) >= 0) {
				selectCommands.push(q);
			}
		});
	}
	selectCommands.map(q => {
		if (Object.keys(scp).length > 0 && !scp[q.command]) return;
		helpContent += Parser.Helper.quest(q, scp[q.command]);
	});
	if (cmdlist.length <= 1) {
		helpContent += '\n';
		helpContent += String.blank(HelpLayoutConfig.help) + String.blank(HelpLayoutConfig.right - HelpLayoutConfig.help, '=') + '\n';
		helpContent += String.blank(HelpLayoutConfig.help) + setStyle('参数说明', 'bold') + '\n';
		helpContent += String.blank(HelpLayoutConfig.help) + String.blank(HelpLayoutConfig.right - HelpLayoutConfig.help, '-') + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + '字符串' + String.blank(HelpLayoutConfig.helpright - 6) + '字符串' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + '单引号 / 双引号' + String.blank(HelpLayoutConfig.helpright - 15) + '字符串' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + '数字' + String.blank(HelpLayoutConfig.helpright - 4) + '数字' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + 'true / false' + String.blank(HelpLayoutConfig.helpright - 12) + '布尔值' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + 'YYYY-MM-DD/hh:mm:ss' + String.blank(HelpLayoutConfig.helpright - 19) + '日期' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + 'YYYY-MM-DD' + String.blank(HelpLayoutConfig.helpright - 10) + '日期' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + '[param1;param2;param3]' + String.blank(HelpLayoutConfig.helpright - 22) + '简单数组' + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + '{key1:value1;key2:value2}' + String.blank(HelpLayoutConfig.helpright - 25) + '简单对象' + '\n';
		helpContent += String.blank(HelpLayoutConfig.help) + String.blank(HelpLayoutConfig.right - HelpLayoutConfig.help, '-') + '\n';
		helpContent += String.blank(HelpLayoutConfig.helpleft) + setStyle('可选范围：', 'bold') + String.blank(HelpLayoutConfig.helpright - 10) + '正则表达式' + '\n';
	}
	return helpContent;
};
const GenerateQuestHelp = (quest, optlist) => {
	var title = quest.command, line;
	if (title === '[global]') {
		title = 'default';
		quest.desc = quest.desc || '默认环境指令';
	}
	line = setStyle(title, 'bold');
	if (!!quest.alias && quest.alias.length > 0) {
		line += String.blank(HelpLayoutConfig.lev1 - getCLLength(title)) + setStyle('别名：', 'bold');
		title = quest.alias.join(' | ');
		line += String.blank(HelpLayoutConfig.lev2 - HelpLayoutConfig.lev1 - 6) + title;
		line += String.blank(HelpLayoutConfig.right - HelpLayoutConfig.lev2 - getCLLength(title));
	}
	else {
		line += String.blank(HelpLayoutConfig.right - title.length);
	}
	line += quest.desc + '\n';
	var filterOption = !!optlist && optlist.length > 0;
	if (!filterOption) {
		title = '参数：';
		if (quest.params.notEmpty) line += String.blank(HelpLayoutConfig.lev1) + setStyle('参数：', 'bold');
		quest.params.musts.map(p => {
			line += Parser.Helper.param(p, 0, quest.params.defaultValues[p], quest.params.valueRanges[p], 0, title) + '\n';
			title = '';
		});
		quest.params.options.map(p => {
			line += Parser.Helper.param(p, 1, quest.params.defaultValues[p], quest.params.valueRanges[p], 0, title) + '\n';
			title = '';
		});
		if (!!quest.params.optionlist) {
			line += Parser.Helper.param(quest.params.optionlist, 2, quest.params.defaultValues[quest.params.optionlist], quest.params.valueRanges[quest.params.optionlist], 0, title) + '\n';
		}
	}
	title = '开关：';
	if (quest.optionGroup.length > 0) line += String.blank(HelpLayoutConfig.lev1) + setStyle(title, 'bold');
	quest.optionGroup.map(opt => {
		if (filterOption && optlist.indexOf(opt.name) < 0) {
			return;
		}
		var questline = Parser.Helper.option(opt, title);
		if (questline.length > 0) {
			line += questline + '\n';
			title = '';
		}
	});
	return line;
};
const GenerateOptionHelp = (option, prefix = '') => {
	var line, text;
	if (prefix.length > 0) {
		line = String.blank(HelpLayoutConfig.lev2 - HelpLayoutConfig.lev1 - getCLLength(prefix));
	}
	else {
		line = String.blank(HelpLayoutConfig.lev2);
	}
	text = '--' + option.name;
	line += setStyle(text, 'bold');
	if (!!option.short) {
		text += ' | ' + '-' + option.short;
		line += ' | ' + setStyle('-' + option.short, 'bold');
	}
	if (!!option.desc) line += String.blank(HelpLayoutConfig.right - HelpLayoutConfig.lev2 - text.length) + option.desc;
	if (option.params.musts.length > 0) {
		option.params.musts.map(p => {
			line += '\n' + Parser.Helper.param(p, 0, option.params.defaultValues[p], option.params.valueRanges[p], 1);
		});
	}
	if (option.params.options.length > 0) {
		option.params.options.map(p => {
			line += '\n' + Parser.Helper.param(p, 1, option.params.defaultValues[p], option.params.valueRanges[p], 1);
		});
	}
	if (!!option.params.optionlist) {
		line += '\n' + Parser.Helper.param(option.params.optionlist, 2, option.params.defaultValues[option.params.optionlist], option.params.valueRanges[option.params.optionlist], 1);
	}
	return line;
};
const GenerateParamHelp = (param, mode, defval, range, section, prefix = '') => {
	var padding, line;
	if (section === 1) {
		if (prefix.length > 0) {
			padding = HelpLayoutConfig.lev3 - HelpLayoutConfig.lev1 - getCLLength(prefix);
			line = String.blank(padding);
		}
		else {
			padding = HelpLayoutConfig.lev3;
			line = String.blank(padding);
		}
	}
	else {
		if (prefix.length > 0) {
			padding = HelpLayoutConfig.lev2 - HelpLayoutConfig.lev1 - getCLLength(prefix);
			line = String.blank(padding);
		}
		else {
			padding = HelpLayoutConfig.lev2;
			line = String.blank(padding);
		}
	}
	var title;
	if (mode === 0) title = '<' + param + '>';
	else if (mode === 2) title = '[...' + param + ']';
	else title = '[' + param + ']';
	line += title;
	var desc = '';
	if (!!range) {
		desc = setStyle('可选值', 'underline') + '：' + range.toString();
	}
	if (!!defval) {
		if (desc.length > 0) desc += '； ';
		desc += setStyle('默认值', 'underline') + '：' + param2String(defval);
	}
	if (desc.length > 0) {
		line += String.blank(HelpLayoutConfig.right - padding - title.length) + desc;
	}
	return line;
};

/**
 * {
 * 		title: String,
 * 		mode: process | cli | parser,
 * 		on: Object,
 * 		command: config,
 * 		hint: {
 * 			prefix: '> ',
 * 			response: ': ',
 * 			error: ': ',
 * 			welcome: 'Aloha Kosmos!',
 * 			byebye: 'Bye, Earth...'
 * 		}
 * }
 */
const CommandHistorySize = 100;
const DefaultHint = {
	hint: setStyle('> ', 'green bold'),
	answer: setStyle(': ', 'green bold'),
	error: setStyle(': ', 'magenta bold'),
	errorStyle: 'magenta',
	welcome: setStyle('欢迎来到字符的黑暗世界~~', 'yellow underline'),
	byebye: setStyle('黑暗，即将再临……', 'magenta bold underline'),
	no_such_command: setStyle('没有该命令！', 'red bold')
};
const paramConvert = param => {
	var result = { name: param.quest, value: {} };
	param.params.map(p => {
		if (!!p.params) {
			result.value[p.name] = true;
			for (let q in p.params) {
				result.value[q] = p.params[q];
			}
		}
		else {
			result.value[p.name] = p.value;
		}
	});
	return result;
};
const paramGroupConvert = params => {
	var convert = { mission: [] };
	params.map(param => {
		param = paramConvert(param);
		if (param.name === 'global') {
			for (let p in param.value) {
				convert[p] = param.value[p];
			}
		}
		else {
			convert.mission.push(param);
		}
	});
	Object.defineProperty(convert, 'raw', { value: params });
	return convert;
};
const exitProcess = async (cli, silence, leave) => {
	await cli.close(silence);
	if (leave) process.exit();
};
const Parser = config => {
	var em = new EventEmitter();
	var rl = {
		hint: () => {},
		answer: text => console.log(hint.answer + text),
		error: text => console.error(hint.error + setStyle(text, hint.errorStyle))
	};
	var command = Command.parse(config.command);

	var parse = command.parse;
	var title = config.title || 'Command Line Parser';
	var hint = config.hint || DefaultHint;
	hint.hint = hint.hint || DefaultHint.hint;
	hint.answer = hint.answer || DefaultHint.answer;
	hint.error = hint.error || DefaultHint.error;
	hint.errorStyle = hint.errorStyle || DefaultHint.errorStyle;
	hint.welcome = hint.welcome || DefaultHint.welcome;
	hint.byebye = hint.byebye || DefaultHint.byebye;
	hint.no_such_command = hint.no_such_command || DefaultHint.no_such_command;

	command.showPrefix = text => rl.hint(text);
	command.showHint = text => rl.answer(text);
	command.showError = text => rl.error(text);
	command.cursor = (...args) => rl.cursor(...args);

	command.parse = cmds => {
		var helpMode = !!(' ' + cmds + ' ').match(/ (\-\-help|\-h) /);
		if (helpMode) {
			cmds = '--help ' + (' ' + cmds + ' ').replace(/ (\-\-help|\-h) /g, ' ').trim();
		}
		var result = parse.call(command, cmds);
		result = paramGroupConvert(result);
		if (helpMode) {
			var helpContent = Parser.Helper.command(command, result.raw, title);
			console.log(helpContent);
			if (command.showPrefix) command.showPrefix();
		}
		else {
			em.emit('command', result, command);
			result.mission.map(mission => {
				em.emit(mission.name, mission.value, result, command);
			});
		}
		em.emit('done', result, command);
		return result;
	};
	command.on = (...args) => {
		em.on.apply(em, args);
		return command;
	};
	command.launch = () => {
		if (config.mode === 'process') {
			let args = process.argv.copy();
			args.splice(0, 2);
			args = args.map(arg => {
				if (arg.indexOf(" ") >= 0) {
					let m = arg.match(/^(--?\w+)=/);
					if (!!m) {
						let head = m[1];
						let rest = arg.substring(m[0].length, arg.length);
						rest = rest.replace(/ +/g, "[:SPACE:]")
						arg = head + ' "' + rest + '"';
					} else {
						arg = arg.replace(/ +/g, "[:SPACE:]")
						arg = '"' + arg + '"';
					}
				} else {
					let m = arg.match(/^(--?\w+)=/);
					if (!!m) {
						let head = m[1];
						let rest = arg.substring(m[0].length, arg.length);
						arg = head + ' ' + rest;
					}
				}
				return arg;
			});
			args = args.join(' ');
			command.parse(args);
		}
		if (config.mode === 'cli') {
			rl = cli({
				historySize: config.historySize || CommandHistorySize,
				hints: hint,
				history: config.historyStorage
			})
			.onRequest(cmd => {
				var shortcmd = cmd.replace(/ +/g, ' ');
				if (cmd === 'exit') exitProcess(rl, false, true);
				else if (shortcmd === 'exit -s') exitProcess(rl, true, true);
				else if (cmd === 'quit') exitProcess(rl, false, false);
				else if (shortcmd === 'quit -s') exitProcess(rl, true, false);
				else {
					if (!!cmd.match(/^(help |help$)/)) cmd = '--' + cmd;
					try {
						let result = command.parse(cmd);
						if (!result) return { msg: hint.no_such_command, norecord: true };
						if (result.length <= 1 && result[0].quest === 'global' && result[0].params.length === 0) return { msg: hint.no_such_command, norecord: true };
						return { nohint: !!result.nohint, msg: '', norecord: !!result.no_history };
					}
					catch (err) {
						rl.error(err.message);
						// console.error(err);
					}
				}
				return { msg: '' };
			})
			.onQuit(cli => {
				var result = { msg: '' };
				em.emit('quit', result, command);
				if (!!result.msg && result.msg.length > 0) cli.error(result.msg);
			})
			.onExit(cli => {
				em.emit('exit', command);
			});
			command.cli = rl;
			command.stopInput = () => rl.stopInput();
			command.resumeInput = () => rl.resumeInput();
		}
		return command;
	};
	command.terminate = silence => {
		if (config.mode !== 'cli') return;
		if (!silence) showHint(hint.byebye);
		rl.close();
	};
	Object.defineProperty(command, 'isInputStopped', {
		configurable: false,
		enumerable: true,
		get: () => rl.isInputStopped || false
	});
	return command;
};
Parser.Params = Params;
Parser.Option = Option;
Parser.Quest = Quest;
Parser.Command = Command;
Parser.Helper = {
	command: GenerateHelp,
	quest: GenerateQuestHelp,
	option: GenerateOptionHelp,
	param: GenerateParamHelp
};
Parser.getCLLength = getCLLength;

module.exports = Parser;
_('CL.CLP', Parser);