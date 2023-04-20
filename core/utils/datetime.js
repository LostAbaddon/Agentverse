/**
 * Name:	Auxillary Utils and Extends for DateTime
 * Desc:    日期时间相关拓展
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2018.11.02
 */

const getDTMatch = (format, match, lim, def) => {
	if (isNaN(def)) def = lim;
	var temp = format.match(match);
	if (!temp) temp = def;
	else temp = temp.length;
	if (temp < lim) temp = lim;
	return temp;
};
const formatString = (str, len) => {
	if (len === 0) return '';
	var l = str.length;
	if (l > len) str = str.substring(l - len, l);
	else if (l < len) str = str.padStart(len, '0');
	return str;
};
const getDateString = (Y, M, D, link) => {
	var temp = [];
	if (Y.length > 0) temp.push(Y);
	if (M.length > 0) temp.push(M);
	if (D.length > 0) temp.push(D);
	return temp.join(link);
};
const getTimeString = (h, m, s, ms, link) => {
	var temp = [];
	if (h.length > 0) temp.push(h);
	if (m.length > 0) temp.push(m);
	if (s.length > 0) temp.push(s);
	var result = temp.join(link);
	if (ms.length > 0) result += '.' + ms;
	return result;
};
const timeNormalize = (time, format='YYYYMMDDhhmmss', datelink='/', timelink=':', combinelink=' ') => {
	time = time || new Date();
	// format = format || 'YYYYMMDDhhmmssx';

	var Ys = getDTMatch(format, /Y/g, 0, 0);
	var Ms = getDTMatch(format, /M/g, 1, 0);
	var Ds = getDTMatch(format, /D/g, 1, 0);
	var hs = getDTMatch(format, /h/g, 0, 0);
	var mms = getDTMatch(format, /m/g, 0, 0);
	var ss = getDTMatch(format, /s/g, 0, 0);
	var mss = getDTMatch(format, /x/g, 0);

	var Y = formatString(time.getYear() + 1900 + '', Ys);
	var M = formatString(time.getMonth() + 1 + '', Ms);
	var D = formatString(time.getDate() + '', Ds);
	var h = formatString(time.getHours() + '', hs);
	var m = formatString(time.getMinutes() + '', mms);
	var s = formatString(time.getSeconds() + '', ss);
	var ms = formatString(time.getMilliseconds() + '', mss);

	var sDate = getDateString(Y, M, D, datelink);
	var sTime = getTimeString(h, m, s, ms, timelink);
	if (sTime.length === 0) return sDate;
	return sDate + combinelink + sTime;
};

_('Utils').getTimeString = timeNormalize;