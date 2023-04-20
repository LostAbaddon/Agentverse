/**
 * Name:	可操作对象自动生成类，可自动与Quark数据打包器集成
 * Desc:    根据Quark打包器自动生成可操作的类
 *			Atom模块负责JSON到可操作对象的互转
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2019.06.04
 */

const Quark = require('./quark');

const AtomMap = {};

const Atom = (name, type, proto) => {
	if (!String.is(type)) {
		proto = type;
		type = name;
		name = null;
	}
	var quark = Quark.getPacker(type);
	if (!name) name = quark.name;
	var specials = {};
	quark.structure.forEach(st => {
		if (!!st.type.match(/float|u?int|string|bytes|bool/)) {
			return;
		} else { // withid和非basic类型
			let packer = Quark.getPacker(st.type);
			if (!packer) packer = { id: 0 };
			specials[st.name] = {
				type: st.type,
				id: packer.id,
				group: st.isGroup,
				packer
			};
		}
	});

	var cls = class {
		constructor (...args) {
			quark.structure.forEach(st => {
				if (st.isGroup) {
					this[st.name] = [];
				} else if (st.type === 'string') {
					this[st.name] = "";
				} else if (st.type === 'bytes') {
					this[st.name] = new Uint8Array(st.length);
				} else if (st.type === 'bool') {
					this[st.name] = false;
				} else if (st.type.match(/u?int64/)) {
					this[st.name] = 0n;
				} else if (!!st.type.match(/float|u?int/)) {
					this[st.name] = 0;
				} else { // withid和非basic类型
					this[st.name] = null;
				}
			});
			if (!!this._constructor) this._constructor(...args);
		}
		toString () {
			return "[" + name + " Atom]";
		}
		toJSON (withPackerID = false) {
			var json = {};
			if (withPackerID) json.packerID = this.packerID;
			quark.structure.forEach(st => {
				var name = st.name;
				var value = this[name];
				if (value === undefined) return;
				if (value !== null) {
					let sp = specials[name];
					if ((!!sp && sp.group) || Array.is(value)) { // 如果是数组，则对内部元素做处理
						value = value.map(v => {
							if (!!v.toJSON) return v.toJSON(withPackerID);
							v = v.duplicate();
							if (withPackerID && !!sp && !Number.is(v.packerID)) v.packerID = sp.id;
							return v;
						});
					} else { // 如果非数组，则对Atom对象取toJSON，否则做一般化处理
						if (!!value.toJSON) {
							value = value.toJSON(withPackerID);
						} else {
							value = value.duplicate();
							if (withPackerID && !!sp && !Number.is(value.packerID)) value.packerID = sp.id;
						}
					}
				}
				if (value !== undefined) json[name] = value;
			});
			return json;
		}
		toData (withPrefix = false) {
			return quark.pack(this.toJSON(true), withPrefix);
		}
		get packerID () {
			return quark.id;
		}
		get available () {
			return true;
		}
		static get name () {
			return name;
		}
		static get structure () {
			return quark;
		}
		static fromString () {
			return new this.prototype.constructor();
		}
		static fromJSON (json) {
			var obj = new this.prototype.constructor();
			quark.structure.forEach(st => {
				var name = st.name;
				var value = json[name];
				var sp = specials[name];
				if (!!value && !!sp) {
					if (st.type === 'withid' && !!value.packerID) {
						let atom = Quark.getPackerByID(value.packerID);
						if (!!atom) atom = AtomMap[atom.name];
						if (!!atom) {
							if (Array.is(value)) {
								value = value.map(v => atom.fromJSON(v));
							} else {
								value = atom.fromJSON(value);
							}
						}
					} else {
						let atom = AtomMap[st.type];
						if (!!atom) {
							if (Array.is(value)) {
								value = value.map(v => atom.fromJSON(v));
							} else {
								value = atom.fromJSON(value);
							}
						}
					}
				}
				if (value !== undefined) obj[name] = value;
			});
			return obj;
		}
		static fromData (data, hasPrefix = false) {
			var origin;
			if (data instanceof Buffer) origin = (new Uint8Array(data)).copy();
			else if (data instanceof Uint8Array) origin = data.copy();
			else return [null, data];

			var [json, left] = quark.unpack(data, hasPrefix);
			if (json === null || Object.keys(json).length === 0) return [null, origin];
			var obj;
			if (this.prototype.constructor.fromJSON) obj = this.prototype.constructor.fromJSON(json);
			else obj = cls.fromJSON(json);
			if (obj === null) return [null, origin];
			return [obj, left];
		}
	}
	if (!!proto) {
		for (let key in proto) {
			if (key === 'constructor') cls.prototype._constructor = proto.constructor;
			else if (key.match(/^get_/)) {
				let name = key.substring(4, key.length);
				Object.defineProperty(cls.prototype, name, {
					get: proto[key]
				});
			}
			else cls.prototype[key] = proto[key];
		}
	}
	AtomMap[type] = cls;
	return cls;
};
Atom.register = (type, cls) => {
	if (!String.is(type) || !Function.is(cls)) return;
	AtomMap[type] = cls;
};

_("Atom", Atom);
module.exports = Atom;