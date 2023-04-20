/**
 * Name:	Function Utils
 * Desc:    Function 类拓展工具
 * 			函数的 promisify、once 化函数、stack & pump 化函数
 * Author:	LostAbaddon
 * Version:	0.0.3
 * Date:	2018.11.05
 */

Function.is = obj => obj instanceof Function;
global.AsyncFunction = (async () => {}).constructor;
AsyncFunction.is = obj => obj instanceof AsyncFunction;

/**
 * 将函数Promise化
 * 可设置超时实现
 */

const promisify = (fn) => {
	if (!(fn instanceof Function)) return null;
	if (!!fn._promised) return fn;
	var afun = (...args) => new Promise((res, rej) => {
		try {
			fn(...args, res, rej);
			// setImmediate(() => fn(...args, res, rej));
		}
		catch (err) {
			rej(err);
		}
	});
	afun._promised = true;
	afun._original = fn;
	return afun;
};
promisify.withTimeout = (fn) => {
	if (!(fn instanceof Function)) return null;
	if (!!fn._promised) return fn;
	var afun = (...args) => {
		var start_time, tocb = null, todelay = -1, towatch = null, rej;
		var prom = new Promise((_res, _rej) => {
			rej = _rej;
			var res = (...args) => {
				if (!!towatch) clearTimeout(towatch);
				towatch = null;
				_res(...args);
			};
			try {
				start_time = new Date().getTime();
				fn(...args, res, rej);
				// setImmediate(() => fn(...args, res, rej));
			}
			catch (err) {
				rej(err);
			}
		});
		prom.timeout = (...args) => {
			if (args[0] instanceof Number) args[0] = args[0] * 1;
			if (!isNaN(args[0])) {
				if (args[1] instanceof Function) tocb = args[1];
				todelay = args[0] >= 0 ? args[0] : -1;
				if (todelay < 0 && !!towatch) {
					clearTimeout(towatch);
					towatch = null;
				}
				else if (todelay >= 0) {
					if (!!towatch) clearTimeout(towatch);
					let n = new Date().getTime();
					towatch = setTimeout(() => {
						if (!!tocb) tocb();
						rej(new Error('Timeout!'));
					}, todelay - (n - start_time));
				}
			}
			else if (args[0] instanceof Function) {
				tocb = args[0];
			}
			return prom;
		};
		return prom;
	};
	afun._promised = true;
	afun._original = fn;
	return afun;
};

const fun_prep = (promisible, ...args) => {
	var funs, data, cb;
	if (args[0] instanceof Array) {
		funs = args[0];
		data = args[1];
		cb = args[2];
		if (!cb) {
			cb = data;
			data = null;
		}
	}
	else {
		cb = args.pop();
		if (args[args.length - 1] instanceof Function) data = null;
		else data = args.pop();
		funs = args;
	}
	if (!!promisible) funs = funs.map(f => promisify(f));
	else funs = funs.map(f => f._original || f);
	return [funs, data, cb];
};

promisify.s = promisify.serial = promisify(async (...args) => {
	var [funs, data, res] = fun_prep(true, ...args);
	for (let fun of funs) {
		let v;
		if (data === null || data === undefined) v = await fun();
		else v = await fun(data);
		if (v !== undefined) data = v;
	}
	res(data);
});
promisify.p = promisify.parallel = promisify(async (...args) => {
	var [funs, data, res] = fun_prep(true, ...args);
	var tasks = funs.length, results = [];;
	funs.forEach(async (f, i) => {
		var v;
		if (data === null || data === undefined) v = await f();
		else v = await f(data);
		results[i] = v;
		tasks --;
		if (tasks > 0) return;
		res(results);
	});
});
promisify.a = promisify.any = promisify(async (...args) => {
	var [funs, data, res] = fun_prep(true, ...args);
	funs.forEach(async (f, i) => {
		var v;
		if (data === null || data === undefined) v = await f();
		else v = await f(data);
		res(v);
	});
});

global.promisify = Function.promisify = promisify;

/**
 * 将函数一次化，此后只返回第一次运行的结果，支持Promisify对象
 * oncefun.refresh可重新执行
 */
global.oncilize = Function.oncilize = fn => {
	var called = false, value, ofn;
	if (fn._promised) {
		ofn = (...args) => new Promise(async (res, rej) => {
			if (called) {
				await waitLoop();
				res(value);
				return;
			}
			called = true;
			value = await fn(...args);
			res(value);
		});
	}
	else {
		ofn = (...args) => {
			if (called) return value;
			called = true;
			value = fn(...args);
			return value;
		};
	}
	ofn.refresh = () => called = false;
	return ofn;
};

/**
 * 将函数堆栈化，可将一段时间内的输入都保存下来，只输出最后一次（stack模式）或者所有都输出（pump模式），默认为stack模式
 * pumpfun.dump可立即执行
 */
global.pumplize = Function.pumplize = (fn, cb, last_only=true) => {
	var stack = [], start_time = null, timeout = 100, timer = null;
	var done = () => {
		start_time = null;
		var args = stack;
		stack = [];
		if (last_only) cb(fn(...args));
		else cb(fn(args));
	};
	var pfn = (...args) => {
		if (start_time === null) {
			start_time = Date.now();
			if (timer) clearTimeout(timer);
			timer = setTimeout(done, timeout);
		}
		var n = Date.now();
		if (n - start_time >= timeout) {
			done();
		}
		else {
			if (last_only) stack = args;
			else stack.push(args);
		}
	};
	pfn.dump = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		done();
	};
	pfn.timeout = to => {
		if (isNaN(to)) return pfn;
		timeout = to;
		if (start_time === null) return pfn;
		var n = Date.now();
		if (timer) clearTimeout(timer);
		timer = setTimeout(done, timeout + start_time - n);
		return pfn;
	};
	return pfn;
};