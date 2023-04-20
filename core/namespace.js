const ModuleList = new Map;
global._ = (path, mod) => {
	path = path.split(/[\/\\,\.\:;]/).map(p => p.trim()).filter(p => p.length > 0);
	if (path.length < 1) return global;
	path = path.join("/");
	if (!!mod) {
		ModuleList.set(path, mod);
		return mod
	}
	mod = ModuleList.get(path);
	if (!!mod) return mod;
	var names = [...ModuleList.keys()];
	names = names.filter(n => n.indexOf(path) === 0);
	mod = {};
	names.forEach(n => {
		var m = ModuleList.get(n);
		n = n.replace(path + '/', '');
		n = n.split('/');
		var l = n.pop();
		var t = mod;
		n.forEach(m => {
			if (!!t[m]) t[m] = {};
			t = t[m];
		});
		t[l] = m;
	});
	return mod;
};

_('Utils', {});