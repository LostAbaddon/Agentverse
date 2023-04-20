const BlackHole = function (message, code, name) {
	if (!!code) {
		if (!code.match(/\w{1,3}-\d{5}/)) {
			name = code;
			code = null;
		}
	}
	name = name || "CommonError";
	return class extends Error {
		constructor (msg) {
			super(message + (!!msg && msg.length > 0 ? "\n" + msg : ""));
		}
		get code () {
			return code;
		}
		get [Symbol.toStringTag] () {
			return name;
		}
		static get code () {
			return code;
		}
		static get name () {
			return name;
		}
	}
};

const Errors = {};

Errors.ConfigError = {};
Errors.ConfigError.NoPorts = new BlackHole("无指定端口信息", "CFG-00001", "NoPortConfig");
Errors.ConfigError.NoWebServerAvailable = new BlackHole("无可用Web后台", "CFG-00002", "NoWebServerAvailable");
Errors.ConfigError.NoSocketServerAvailable = new BlackHole("无可用Socket后台", "CFG-00003", "NoSocketServerAvailable");
Errors.ConfigError.NoResponsor = new BlackHole("无 API 响应模块", "CFG-00004", "NoResponsor");

Errors.ServerError = {};
Errors.ServerError.UnavailableHost = new BlackHole("指定IP错误", "SVR-00001", "UnavailableHost");
Errors.ServerError.UnavailablePort = new BlackHole("指定端口错误", "SVR-00002", "UnavailablePort");
Errors.ServerError.CreateServerFailed = new BlackHole("服务器初始化失败", "SVR-00003", "CreateServerFailed");
Errors.ServerError.ConnectRemoteFailed = new BlackHole("连接节点失败", "SVR-00004", "ConnectRemoteFailed");
Errors.ServerError.ConnectionBroken = new BlackHole("连接被中断", "SVR-00005", "ConnectionBroken");
Errors.ServerError.CreateConsoleFailed = new BlackHole("命令行控制台初始化失败", "SVR-00006", "CreateConsoleFailed");

Errors.RuntimeError = {};
Errors.RuntimeError.MainProcessExited = new BlackHole("主进程关闭", "RTM-00001", "MainProcessExited");
Errors.RuntimeError.SubProcessBrokenDown = new BlackHole("子进程离线", "RTM-00002", "SubProcessBrokenDown");
Errors.RuntimeError.ResponsorModuleMissing = new BlackHole("响应模块缺失", "RTM-00003", "ResponsorModuleMissing");
Errors.RuntimeError.NoRegisteredThread = new BlackHole("无业务相关注册线程", "RTM-00004", "NoRegisteredThread");
Errors.RuntimeError.RequestTimeout = new BlackHole("工作线程响应请求超时", "RTM-00005", "RequestTimeout");
Errors.RuntimeError.EmptyResponse = new BlackHole("响应为空", "RTM-00006", "EmptyResponse");

Errors.GalanetError = {};
Errors.GalanetError.ShakehandFailed = new BlackHole("Galanet握手失败", "GLN-00001", "ShakehandFailed");
Errors.GalanetError.WrongProtocol = new BlackHole("Galanet请求协议错误", "GLN-00002", "WrongProtocol");
Errors.GalanetError.NotFriendNode = new BlackHole("非Galanet集群友机请求", "GLN-00003", "NotFriendNode");
Errors.GalanetError.CannotService = new BlackHole("非本节点可服务请求", "GLN-00004", "CannotService");
Errors.GalanetError.EmptyClustor = new BlackHole("集群无注册节点", "GLN-00005", "EmptyClustor");
Errors.GalanetError.UnavailableNodeAddress = new BlackHole("无法解析的节点地址", "GLN-00006", "UnavailableNodeAddress");
Errors.GalanetError.NoSuchNode = new BlackHole("当前集群中无指定节点", "GLN-00007", "NoSuchNode");
Errors.GalanetError.Unauthorized = new BlackHole("无权限调用本接口", "GLN-00008", "Unauthorized");
Errors.GalanetError.WrongQuestPath = new BlackHole("无效的请求路径", "GLN-00009", "WrongQuestPath");
Errors.GalanetError.QuestDelegator = new BlackHole("网关收到请求", "GLN-00010", "QuestDelegator");
Errors.GalanetError.RequestTimeout = new BlackHole("集群响应请求超时", "GLN-00011", "RequestTimeout");
Errors.GalanetError.WrongMessageType = new BlackHole("集群通讯类型错误", "GLN-00012", "WrongMessageType");
Errors.GalanetError.DuplicatedMessage = new BlackHole("重复的信息", "GLN-00013", "DuplicatedMessage");
Errors.GalanetError.SendMessageFailed = new BlackHole("发送信息失败", "GLN-00014", "SendMessageFailed");

Errors.Quark = {};
Errors.Quark.DefaultPackerError = new BlackHole("不可用默认打包器", "QRK-000001", "DefaultPackerError");
Errors.Quark.ConflictPackerError = new BlackHole("Quark打包器冲突", "QRK-000002", "ConflictPackerError");
Errors.Quark.ConflictPrefixError = new BlackHole("数据类型前缀冲突", "QRK-000003", "ConflictPrefixError");
Errors.Quark.PackerNotFoundError = new BlackHole("指定的打包器不存在", "QRK-000004", "PackerNotFoundError");
Errors.Quark.ParseElementError = new BlackHole("解析Quark轻数据错误", "QRK-000011", "ParseElementError");
Errors.Quark.ParseFixLengthArrayError = new BlackHole("解析Quark固长数组错误", "QRK-000012", "ParseFixLengthArrayError");
Errors.Quark.ParseVarLengthArrayError = new BlackHole("解析Quark变长数组错误", "QRK-000013", "ParseVarLengthArrayError");

Errors.Dealer = {};
Errors.Dealer.DealerNotAvailable = new BlackHole("Dealer当前不可用", "DLR-000001", "DealerNotAvailable");
Errors.Dealer.DealerDied = new BlackHole("Dealer被强制关闭", "DLR-000002", "DealerDied");

global.BlackHole = BlackHole;
global.Errors = Errors;