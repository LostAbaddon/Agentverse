/**
 * Name:	Thread Evaluate Worker
 * Desc:    线程内辅助工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2018.11.04
 * 备注：未来可以用VM来取代eval
 */

register('init', (data, event) => {
	var result;
	try {
		result = eval(data.fun)(data.data);
	}
	catch (err) {
		request('evaluate', { err: err.toString(), result: null });
		return;
	}
	request('evaluate', { err: null, result });
});