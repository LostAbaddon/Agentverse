/**
 * Name:	Math Utils
 * Desc:    Math 类拓展工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.11.09
 */

Math.pick = list => {
	if (Array.is(list)) {
		let i = Math.floor(Math.random() * list.length);
		return list[i];
	}
	else if (!isNaN(list)) {
		return Math.random() <= list;
	}
	return null;
};
Math.range = (l, r) => {
	if (isNaN(r)) {
		r = l;
		l = 0;
	}
	return l + Math.random() * (r - l);
};