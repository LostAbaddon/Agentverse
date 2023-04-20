Math.Vector = {};
Math.Vector.normalize = vec => {
	var t = vec.reduce((r, n) => r + n * n, 0);
	t = Math.sqrt(t);
	t = 1 / t;
	return vec.map(n => n * t);
};
Math.Vector.averagize = vec => {
	var t = vec.reduce((r, n) => r + n, 0);
	t = 1 / t;
	return vec.map(n => n * t);
};
Math.Vector.times = (v, n) => {
	return v.map(i => i * n);
};

Math.Matrix = {};
Math.Matrix.transpose = m => {
	var l = m.length;
	var n = 0;
	m.forEach(mm => {
		var j = mm.length;
		if (j > n) n = j;
	});
	var result = Array.generate(n, () => Array.generate(l, 0));
	for (let i = 0; i < l; i ++) {
		let mm = m[i] || [];
		for (let j = 0; j < n; j ++) {
			result[j][i] = mm[j] || 0;
		}
	}
	return result;
};
Math.Matrix.actOnVector = (m, v) => {
	var result = [], l = m.length;
	for (let i = 0; i < l; i ++) {
		let r = 0, n = m[i];
		if (!!n) for (let j = 0, k = n.length; j < k; j ++) {
			r += n[j] * (v[j] || 0);
		}
		result[i] = r;
	}
	return result;
};