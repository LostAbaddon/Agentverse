const FS = require('fs');
const Path = require('path');
const Koa = require('koa');
const KoaBody = require('koa-body');
const KoaStatic = require('koa-static');
const IO = require('./websocket');
const ResponsorManager = require('./responser');
const Logger = new (_("Utils.Logger"))('WebManager');

const DefaultType = 'application/json';

const app = new Koa();
const kb = KoaBody({
	multipart: true,
	parsedMethods: ['POST', 'PUT', 'PATCH', 'GET', 'HEAD', 'DELETE']
});

module.exports = (options, callback) => {
	if (!options.port) {
		callback(new Errors.ConfigError.NoPorts());
		return;
	}

	// Static Resources
	if (String.is(options.page)) {
		app.use(KoaStatic(Path.join(process.cwd(), options.page), {
			maxage: 1000 * 60
		}));
	}
	else if (Array.is(options.page)) {
		options.page.forEach(path => {
			app.use(KoaStatic(Path.join(process.cwd(), path), {
				maxage: 1000 * 60
			}));
		});
	}
	else if (!!options.page) {
		let option = {maxage: 1000 * 60};
		if (!!options.page.maxage) option.maxage = options.page.maxage;
		if (String.is(options.page.path)) {
			app.use(KoaStatic(Path.join(process.cwd(), options.page.path), option));
		}
		else if (Array.is(options.page.path)) {
			options.page.path.forEach(path => {
				app.use(KoaStatic(Path.join(process.cwd(), path), option));
			});
		}
	}

	// For CORS
	app.use(async (ctx, next) => {
		ctx.set('Access-Control-Allow-Origin', '*');
		ctx.set('Access-Control-Allow-Headers', '*');
		ctx.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');

		var method = ctx.method.toLowerCase();
		if (method === 'options') {
			ctx.body = '';
			ctx.type = 'text/plain';
			return;
		}

		await next();
	});

	// For FormData
	app.use(kb);

	// Transaction Dealers
	var apiPrefix = options.api.url;
	apiPrefix = '/' + apiPrefix.replace(/^\/+|\/+$/g, '') + '/';
	app.use(async (ctx, next) => {
		var method = ctx.method.toLowerCase(), path = ctx.path, params = {};
		var remoteIP = ctx.request.headers['X-Orig-IP']
			|| ctx.request.headers['X-Orig-IP']
			|| ctx.request.socket.remoteAddress
			|| ctx.request.ip;
		if (!!remoteIP.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/)) remoteIP = remoteIP.replace('::ffff:', '');

		if (path.indexOf(apiPrefix) !== 0) {
			ctx.type = DefaultType;
			ctx.body = {
				message: 'Non-API Request',
				code: 403,
				ok: false
			};
			Logger.error('result: Non-API Request (' + path + ')');
			return await next();
		}
		path = path.replace(apiPrefix, '/');

		if (!!ctx.query) for (let key in ctx.query) params[key] = ctx.query[key];
		if (!!ctx.request.body) for (let key in ctx.request.body) params[key] = ctx.request.body[key];

		var [responsor, query] = ResponsorManager.match(path, method, 'web');
		if (!responsor) {
			ctx.type = DefaultType;
			ctx.body = {
				message: 'No Responsor Found',
				code: 404,
				ok: false
			};
			Logger.error('result: Responsor Not Found (' + path + ')');
			return await next();
		}

		ctx.type = DefaultType;
		var data;
		try {
			data = await ResponsorManager.launch(responsor, params, query, path, ctx, method, 'web', remoteIP, 0);
			ctx.type = data.type || DefaultType;
			ctx.body = data;
		}
		catch (err) {
			ctx.type = DefaultType;
			ctx.body = {
				ok: false,
				code: err.code || 500,
				message: err.message
			};
		}

		await next();
	});

	var count = 0, success = 0, failed = 0, tasks = {};
	var cb = (task, err) => {
		if (tasks[task]) return;
		tasks[task] = true;

		count --;
		if (!!err) {
			failed ++;
			Logger.error(task + ' failed: ' + err.message);
		}
		else {
			success ++;
			Logger.log(task + ' is ready.');
		}
		if (count > 0) return;

		if (success === 0) {
			callback(new Errors.ConfigError.NoWebServerAvailable());
		}
		else {
			callback();
		}
	};
	if (Number.is(options.port.https)) {
		let csrOption = {}, ok = false;
		try {
			csrOption.key = FS.readFileSync(Path.join(process.cwd(), options.certification?.privateKey));
			csrOption.cert = FS.readFileSync(Path.join(process.cwd(), options.certification?.certificate));
			ok = true;
		}
		catch (err) {
			Logger.error('Missing CSR key-file.');
			ok = false;
			setImmediate(() => {
				cb('https', err);
			});
		}
		if (ok) {
			tasks.https = false;
			let sServer = require('https').createServer(csrOption, app.callback());
			sServer.on('error', err => {
				cb('https', err);
			});
			IO.init(sServer); // socket.io
			count ++;
			try {
				sServer.listen(options.port.https, () => cb('https'));
			}
			catch (err) {
				cb('https', err);
			}
		}
	}
	if (Number.is(options.port.http)) {
		tasks.http = false;
		let nServer = require('http').createServer(app.callback());
		nServer.on('error', err => {
			cb('http', err);
		});
		IO.init(nServer); // socket.io
		count ++;
		try {
			nServer.listen(options.port.http, () => cb('http'));
		}
		catch (err) {
			cb('http', err);
		}
	}

	if (count === 0) {
		callback(new Errors.ConfigError.NoPorts());
	}
};