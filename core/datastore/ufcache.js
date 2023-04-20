/**
 * Name:	Usage Frequency Cache
 * Desc:    基于Map的高频数据缓存
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2018.11.07
 */

const Config = {
	frequency: 50,
	delay: 0.9,
	size: 100
};

const FunWeightOne = () => 1;

class UFCache {
	constructor (frequency=Config.frequency, delay=Config.delay, size=Config.size) {
		if (isNaN(frequency)) {
			this.frequency = frequency.frequency * 1 || Config.frequency;
			this.delay = frequency.delay * 1 || Config.delay;
			this.size = frequency.size * 1 || Config.size;
		}
		else {
			this.frequency = frequency * 1 || Config.frequency;
			this.delay = delay * 1 || Config.delay;
			this.size = size * 1 || Config.size;
		}
		this._cache = new Map();
		this._time = 0;
		this._weightFun = FunWeightOne;
	}
	set (k, v) {
		var p = this._cache.get(k);
		if (!p) {
			p = [v, 0];
			this._cache.set(k, p);
		}
		else {
			p[0] = v;
		}
		p[1] += this._weightFun(v);
		this._update();
	}
	get (k) {
		var v = this._cache.get(k);
		if (v === undefined) return v;
		v[1] += this._weightFun(v[0]);
		this._update();
		return v[0];
	}
	del (k) {
		this._cache.delete(k);
	}
	has (k) {
		return this._cache.has(k);
	}
	clear () {
		this._cache = new Map();
		this._time = 0;
	}
	_update (k, v) {
		this._time ++;
		if (this._time <= this.frequency) return;
		this._time = 0;
		if (this._cache.size <= this.size) return;
		var keys = Array.from(this._cache.keys());
		var remove = [];
		keys.forEach(k => {
			let v = this._cache.get(k);
			let f = v[1] * this.delay;
			if (f < this.delay) {
				this._cache.delete(k);
			}
			else {
				v[1] = f;
			}
		});
	}
	withWeight (weightFun) {
		this._weightFun = weightFun;
	}
	static changeFrequency (f) {
		if (!isNaN(f) && f > 0) Config.frequency = f;
	}
	static changeDelay (d) {
		if (!isNaN(d) && d > 0 && d < 1) Config.delay = d;
	}
}

class UFCacheWithDatastore extends UFCache {
	constructor (...args) {
		super(...args);
		var i = args.query(a => isNaN(a));
		if (i < 0) {
			this._ds = new Map();
		}
		else {
			this._ds = args[i];
		}
	}
	set (k, v) {
		UFCache.prototype.set.call(this, k, v);
		this._ds.set(k, v);
	}
	get (k) {
		var v = UFCache.prototype.get.call(this, k);
		if (v === undefined) {
			v = this._ds.get(k);
			if (v !== undefined) this._update(k, v);
		}
	}
	del (k) {
		UFCache.prototype.del.call(this, k);
		this._ds.delete(k);
	}
}

UFCache.withDatastore = UFCacheWithDatastore;

module.exports = UFCache;
_('DataStore.UFCache', UFCache);