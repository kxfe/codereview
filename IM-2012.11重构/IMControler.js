// vim: filetype=javascript
/**
 * @fileoverview 
 *    统一管理IM中的交互
 *
 * 文件对象组成
     TitleBlink     标题新消息闪烁提醒
	 DesktopNotify  桌面提醒功能封装
	 Storage.imsync 本地存储同步方法，替换原有的sync，以便可以接收各种类型参数
	 Controler      综合各个Controler
     Subscribe      处理监听到的消息
	 Sync           同步方法

 * @author  linfei@corp.kaixin001.com
 * @date    2012/10/26
 *
 */
define('apps/im/IMControler', [
	'jQuery',
	'apps/im/IMDatasource',
	'core/storage/Storage',
	'core/cookie/Cookie'
], function (require) {

	var $ = require('jQuery'),
		Storage = require('core/storage/Storage'),
		Cookie = require('core/cookie/Cookie'),
		DControler = require('apps/im/IMDatasource'),
		// 类定义，绕过海贝的模块引进(AIMInit中传入)
		Constructor = {
			// 列表对象class
			'List': {},
			// 窗口对象class
			'Window': {}
		},
		// 需要缓存的一些数据
		Cache = {
			Lock: {},
			Timer: {}
		},
		// 
		TitleBlink, DesktopNotify,
		WControler, LControler, Subscribe,
		Sync, // 存储同步方法
		Controler = {};
	
	/**
	 * 标题闪烁提醒
	 *  - 多个人发来消息，则循环播放
	 */
	TitleBlink = (function () {
		var oldTitle,
			timer,
			blinkUsers = [],
			blinkIndex = 0,
			// 当只有一项时，blinkIndex永远只有一个值，无法替代counter计数功能
			blinkCounter = 0;
		return {
			_prepareTitle: function (uid) {
				var user = Controler.getUser(uid);
				// 存储旧的标题
				if (!oldTitle) {
					oldTitle = document.title || '';
				}
				// 存储要循环显示的人的姓名
				if (user) {
					if (K.indexOf(blinkUsers, user) < 0) {
						blinkUsers.push(user);
					}
				}
			},
			// 移除某个人的提示
			remove: function (uid) {
				blinkUsers = K.filter(blinkUsers, function (user) {
					return user.uid != uid;
				});
			},
			// 执行闪烁
			play: function (uid) {
				var me = this;
				this._prepareTitle(uid);

				if (!timer) {
					timer = setInterval(function () {
						var t, len;
						// 循环显示名称被置空后停止
						if (!blinkUsers.length) {
							me.stop();
							return;
						}

						len = blinkUsers.length;
						blinkIndex %= len;
						if ((blinkCounter++) % 2 === 0) {
							t = '【' + blinkUsers[blinkIndex].name + '说...】- ' + oldTitle;
							blinkIndex = (blinkIndex + 1) % len;
						}
						else {
							t = '【　　　】';
						}
						document.title = t;
					}, 1000);
				}
			},
			// 停止闪烁
			stop: function () {
				if (timer && oldTitle) {
					clearInterval(timer);
					document.title = oldTitle;

					oldTitle = timer = void 0;
					blinkUsers = [];
					blinkIndex = blinkCounter = 0;
				}
			}
		};
	})(); // end TitleBlink

	/**
	 * 桌面提醒
	 * DesktopNotify
	 */
    DesktopNotify = (function () {
	var notify = window.webkitNotifications;
	return {
		// 是否支持该功能
		isSupport: !!notify,
		// 是否被允许
		isPermission: function () {
			return this.isSupport && this.getPermission() === 0;
		},
		// 获取许可值：0-允许，1-未设置，2-拒绝
		getPermission: function () {
			var v = 2;
			if (this.isSupport) {
				v = notify.checkPermission();
			}
			return v;
		},
		// 请求许可，允许对结果在回调函数中处理(回调中没有任何参数)
		requestPermission: function (callback) {
			if (this.isSupport) {
				notify.requestPermission(callback);
			}
		},

		//是否允许进行桌面提醒：支持桌面提醒、以获取许可、窗口未聚焦
		isAllowNotify: function () {
			return this.isSupport && this.isPermission() && !Cache.WindowFocused;
		},
		// 创建桌面提醒
		create: function (icon, title, content) {
			var n;
			if (this.isAllowNotify()) {
				n = notify.createNotification(icon, title, content);
				// 左对齐
				n.dir = 'ltl';
				//确保只有一个提醒
				n.tag = 'kxim';
			}
			return n;
		},
		show: function (icon, title, content, data) {
			var n, me = this;
			if (this.isAllowNotify()) {
				n = this.create(icon, title, content);
				// 点击事件处理
				n.onclick = function () {
					me.clickHandler(data);
					n.cancel();
				};
				// 显示提醒
				n.show();
				// 一段时间后消失
				setTimeout(function () {
					n.cancel();
				}, 10000);
			}
		},
		clickHandler: function (winId) {
			window.focus();
			Subscribe.doOpenWindow({'id': winId});
		},

		showChatNotify: function (data) {
			var id, user, icon, title, content, msg, groupData,
				rgroup = /^{#(?:[^:]+:)(.+)#}$/, // 群聊系统消息正则表达式
				sgroup; // 存储解析出的系统消息
			if (!this.isAllowNotify()) {
				return;
			}

			// 说话者
			user = Controler.getUser(data.uid);
			id = data.gid || data.uid;
			if (data.gid) {
				// 圈子
				if (id.slice(-1) === 'G') {
					groupData = Controler.getCircle(id);
					icon = 'rgroup/group_type_' + (groupData.ginfo.logo || 0) + '.png';
					title = K.subByte(groupData.ginfo.name, 24, '...');
				}
				// 群组
				else {
					groupData = Controler.getGroup(id);
					icon = 'chat/chat_group_32.png';
					title = K.subByte(groupData.ginfo.name, 20, '...等') + groupData.ginfo.member + '人';
				}
				icon = 'http://' + K.Env.IMG_HOST + '/i2/' + icon;
				content = user.name + ': ';
			}
			else { // 个人
				icon = user.logo;
				title = user.name;
				content = '';
			}

			// 解析内容
			msg = $.parseJSON(data.msg);
			if (msg.attachment) { // 文件
				content += '发送了文件：' + msg.attachment.filename +
						  ' 大小：' + Controler.getFileSize(msg.attachment.size);
			}
			else if (sgroup = msg.content.match(rgroup)) { // 系统消息（群组改变）
				content = sgroup[1];
			}
			else { // 一般文本
				content += msg.content;
			}

			this.show(icon, title, content, id);
		}
	};
	})(); // end DesktopNotify


	// 替换Storage中的sync方法
	Storage.imsync = function (func, context, prefix) {
		var me = this,
			// 数据项中前缀和参数之间的分隔符
			split = '~{##}~',
			// 参数之间的分隔符
			argSplit = '~{###}~',
			// 参数类型与实际参数之间的分割
			typeSplit = '~{t}~',
			isCurrentTrigger = false, // 标识本页面触发storage修改
			key;

		if(!me.isAvailable() || !K.isFunction(func)) {
			return func;
		}
		// 根据函数生成存储key(原函数有时会一样，这里指定特别的前缀)
		key = (prefix || '') + me._genSyncKey(func);

		// 监听key变化
		me.onstorage(key, function (val) {
			var args, i, len, arg, r;
			if(!isCurrentTrigger){
				r = [];
				args = val.split(split)[1].split(argSplit);
				for (i = 0, len = args.length; i < len; i++) {
					arg = args[i].split(typeSplit);
					switch (arg[0]) {
					case 's':
						arg = arg[1];
						break;
					case 'n':
						arg = parseFloat(arg[1]);
						break;
					case 'b':
						arg = arg[1] === 'true' ? true : false;
						break;
					case 'N':
						arg = null;
						break;
					case 'u':
						arg = void 0;
						break;
					case 'j':
						arg = JSON.parse(arg[1]);
						break;
					default:
						alert('Sorry! 解析参数失败！未找到可解析类型');
						K.log('解析失败参数：', args);
						return;
					}
					r.push(arg);
				}
				K.log(['onstorage change : ', r]);
				func.apply(context, r);
			}
			isCurrentTrigger = false;
		});
		
		// 返回的函数执行时，传入参数会被转换为string类型，然后再解析出来
		// *参数必须是纯对象、数组、字符串、数字、布尔值、null、undefined*
		// *有些对象可能转换成字符串后，不能恢复*
		return function () {
			var i = 0,
				len = arguments.length,
				arg, r = [];
			func.apply(context, arguments);
			isCurrentTrigger = true;
			// 为存入localstorage准备字符串
			for (; i < len; i++) {
				arg = arguments[i];
				switch ($.type(arg)) {
					case 'string':
						arg = ['s', arg];
						break;
					case 'number':
						arg = ['n', arg + ''];
						break;
					case 'boolean':
						arg = ['b', arg + ''];
						break;
					case 'null':
						arg = ['N', arg + ''];
						break;
					case 'undefined':
						arg = ['u', arg + ''];
						break;
					// 下面的数组和对象中如果有对象引用，只能是plainObject
					case 'array':
					case 'object':
						arg = ['j', JSON.stringify(arg)]; // json
						break;
					default:
						alert('Sorry! 有些参数类型不适合转为字符串，无法同步化');
						return;
				}
				r.push(arg.join(typeSplit));
			}
			K.log(['同步方法执行完毕，修改localstorage：', r]);
			// 同步(加时间戳和随机数是为了让数据项发生变化，否则其他页面无法监听到)
			me.setItem(
				key, 
				new Date().getTime() + '' + Math.random() + split + (r.join(argSplit)) 
			);
		};
	};

	

	/*******************************Controler*************************************/
	
	// =========================ChatList==============================
	// 好友涉及到数据类方法
	LControler = {
		// 得到单例List
		getListInstance: function () {
			return Constructor.List.getInstance();
		}
			
	}; // /end List Controler 
	
	// =========================ChatWindow==============================
	// 聊天窗口涉及到数据类方法
	WControler = (function () {
	var windowContainer, soundFlash;
	return {
		setWindowContainer: function (dom) {
			windowContainer = dom;
		},
		getWindowContainer: function () {
			return windowContainer;
		},
		// opts包含id和openFrom属性
		createWindow: function (opts) {
			var id = opts.id,
				type = (id + '').slice(-1),
				Window = Constructor.Window,
				user, win;
			
			// 公用属性，已经包含id 和 openFrom
			$.extend(opts, {
				'container': Controler.getWindowContainer()
			});

			// 群聊
			if (type === 'T') {
				$.extend(opts, {
					'type': Window.TYPE.GROUP,
					'useQuit': true,
					'useAddPerson': true
				});
			}
			// 圈子
			else if (type === 'G') {
				$.extend(opts, {
					'type': Window.TYPE.CIRCLE,
					'useForbid': true,
					'useAddPerson': false
				});
			}
			// 个人
			else {
				user = Controler.getUser(id);
				$.extend(opts, {
					'type': Window.TYPE.PERSON,
					'title': user.real_name
				});
			}

			win = new Window(opts);

			Controler.saveStatusToCookie();

			return win;
		},
		// 根据cookie创建窗口(数据格式见getStatusFromCookie)
		createWindowBaseOnCookie: function (winInfo) {
			var activeWin;
			Cache.Lock.creatingFromCookie = true; // 标识正在从cookie中创建窗口
			$.each(winInfo, function (i, info) {
				var id = info.id,
					win;  
				// 没有该id的情况
				if (!Controler.getUser(id) && 
					!Controler.getCircle(id) &&
					!Controler.getGroup(id)) {
					return;
				}

				win = Controler.createWindow({
						'id': id,
						// 由历史记录开启
						'openFrom': Controler.getConf().openFrom.auto
					});

				if (info.isOpen) {
					win.max(); // 不发出通知
				}
				if (info.isActive) {
					activeWin = win;
				}
				// 如果有未读，通知
				if (Controler.getUnread(win.id).length) {
					win.notify();
				}
			});
			
			// 激活active的窗口
			if (activeWin) {
				activeWin.open();
			}
			Cache.Lock.creatingFromCookie = false;
		},
		getFileSize: function (size) {
			var t;
			// 文件大小转换
			t = size / 1024 /1024;
			if (t >= 1) {
				t = Math.round(t * 10) / 10 + 'M';
			}
			else {
				t = size / 1024;
				if (t >= 1) {
					t = Math.round(t * 10) / 10 + 'K';
				}
				else {
					t = size + 'B';
				}
			}
			return t || '0';
		},
		makeSound: function () {
			//IE下Flash被缓存后不会执行，因此需要反复加载
			if ( !soundFlash || K.Browser.ie ) {
				soundFlash = new SWFObject( 
					'http://' + K.Env.IMG_HOST + '/i2/newmsg_sound.1.0.swf?t=' + (new Date()) * 1,
					'newmsg_sound_swf', 
					'1', 
					'1', 
					'8', 
					'#ffffff', 
					true );

				soundFlash.addParam( 'allowscriptaccess', 'always' );
				soundFlash.addParam( 'wmode', 'opaque' );
				soundFlash.addParam( 'menu', 'false' );
				soundFlash.addVariable( 'autoplay', '0' );
			}
			soundFlash.write( 'head_msgsound_div' );
		}
	};
	})(); // /end Window Controler 


	// ============================Controler==============================
	// - 整合所有Controler
	// - 添加不好归类的方法
	// - 添加消息订阅
	K.mix(Controler, DControler, LControler, WControler, {
		// 设置Window和List对象构造函数
		setConstructor: function (structs) {
			K.mix(Constructor, structs);
		},
		// 保存到cookie中
		//  - 存入者id
		//  - 列表状态
		//  - 窗口状态
		saveStatusToCookie: function () {
			// 正在从cookie创建则不再保存
			if (Cache.Lock.creatingFromCookie) {return;}
			var wins = Controler.getWindows(),
				listData = Controler.getListInstance().getListData(),
				state = [],
				cookie = [],
				toStr = function (b) { return b ? '1' : '0'; };
			// 存入者id
			cookie.push(Controler.getMine().uid);
			// 列表状态
			// list.isOpen|group.type,group.isOpen|group.type,...
			state.push(toStr(listData.expand)); // list状态
			$.each(listData.groups, function (type, group) { // 各分组状态
				var st = [];
				st.push(type);
				st.push(toStr(group.expand));

				state.push(st.join(','));
			});
			cookie.push(state.join('|'));
			// 窗口状态
			//   win.id,win.isOpen,win.isActive|win.id,...
			state = [];
			$.each(wins, function (i, win) {
				var st = [];
				st.push(win.id);
				st.push(toStr(win.isOpen()));
				st.push(toStr(win.isActive()));

				state.push(st.join(','));
			});
			cookie.push(state.join('|'));
			
			// 存入cookie
			setTimeout(function () {
				Cookie.set(Controler.getConf().statusCookieName, cookie.join('\n'));
				K.log(['设置cookie完成：', cookie.join('\n')]);
			}, 10);
		},
		// 从cookie中取出保存状态
		getStatusFromCookie: function () {
			// 作者：121322\n
			// 列表：1|online,1|recent,0|...\n
			// 窗口：1343,0,0|234T,1,1|...
			var cookie = Cookie.get(Controler.getConf().statusCookieName).split('\n'),
				list, wins, result;
			K.log(['得到cookie： ', cookie]);

			// 结构符合且是自己设置的
			if (cookie.length === 3 && Controler.isMine(cookie[0])) {
				result = {};
				// 列表解析
				list = cookie[1].split('|');
				$.each(list, function (i, s) {
					if (!s) {return;}
					if (i === 0) {
						result.list = {'expand': !!(s >> 0), 'groups': {}};
					}
					else {
						s = s.split(',');
						result.list.groups[s[0]] = {'expand': !!(s[1] >> 0)};
					}
				});
				// 窗口解析
				wins = cookie[2].split('|');
				$.each(wins, function (i, s) {
					if (!s) {return;}
					s = s.split(',');
					result.win = result.win || [];
					result.win.push({
						'id': s[0],
						'isOpen': !!(s[1] >> 0),
						'isActive': !!(s[2] >> 0)
					});
				});
			}
			
			K.log(['解析cookie完毕：', result]);
			return result;
		},
		// 显示标题闪烁
		showBlink: function (uid) {
			if (!Cache.WindowFocused) {
				TitleBlink.play(uid);
			}
		},
		// 隐藏标题闪烁
		hideBlink: function () {
			TitleBlink.stop();
		},
		/** 
		 * 避免元素同时显示, 并在点击其他地方时，关闭dom
		 * 
		 *  - 没有callback时，默认隐藏panel 
		 *  - 如果触发点击的元素不再属于Dom，则不予判断
		 *
		 * @method avoidShowSimultaneously
		 * @param {mix for jquery} button 按钮
		 * @param {mix for jquery} panel 面板
		 * @param {Function} callback 互斥处理时的回调
		 */
		avoidShowSimultaneously: (function () {
			var doms = [];
			$(document).bind('click', function (evt) {
				var target = evt.target;
				if (!$.contains(document.body, target)) {return;} // 不在页面中的不再判断
				$.each(doms, function (i, dom) {
					var elb = dom.button,
						elp = dom.panel,
						triggerOnThis = (elb.get(0) === target || $.contains(elb.get(0), target)) ||
									   (elp.get(0) === target || $.contains(elp.get(0), target));
					if (!triggerOnThis && elp.is(':visible')) {
						if (K.isFunction(dom.callback)) {
							dom.callback();
						}
						else {
							elp.hide();
						}
					}
				});
			});
			return function (button, panel, callback) {
				doms.push({'button': $(button), 'panel': $(panel), 'callback': callback});
			};
		})(),
		// 订阅消息
		subscribeMessage: function () {
			var C = Controler,
				Window = Constructor.Window,
				List = Constructor.List,
				S = Subscribe,
				sync;

			if (!(Window && List)) {
				K.log('Error：订阅消息需要Window和List类');
				return;
			}
			// 将Sync中的方法转变为同步方法
			$.each(Sync, function (name, func) {
				Sync[name] = Storage.imsync(func, null, name);
			});
			sync = {
				'new':         S.chatNewRecord,
				'typing':      S.chatTyping,
				'clear':       S.chatClear,
				'close':       S.chatClose,
				'max':         S.chatMax,
				'min':         S.chatMin,
				'groupAdded':  S.chatGroupAdded,
				'groupChange': S.chatGroupMemberChange

			};
			/*
			$.each(sync, function (name, func) {
				sync[name] = Storage.imsync(func, null, name);
			});
			*/

			// 消息轮询
			K.on('msg:poll_init_ok', function (data) {K.log('msg:poll_init_ok 第一次Poll完成, 获取im服务器完毕!');});
			K.on('msg:poll_fail', function (data) {K.log('msg:poll_fail 重新发起请求...')});
			K.on('msg:.ctx',          S.pollNewMsg);
			// im轮询返回消息类型
				// 单人窗口
			K.on('msg:chat.msg',      sync.new);
			K.on('msg:chat.typing',   sync.typing);
			K.on('msg:chat.clear',    sync.clear);
			K.on('msg:chat.close',    sync.close);
			K.on('msg:chat.max',      sync.max);
			K.on('msg:chat.min',      sync.min);
			K.on('msg:.user.online',  S.userOnline);
			K.on('msg:.user.offline', S.userOffline);
				// 群聊
			K.on('msg:tchat.added',   sync.groupAdded);
			K.on('msg:tchat.quit',    sync.groupChange);
			K.on('msg:tchat.join',    sync.groupChange);
			K.on('msg:tchat.msg',     sync.new);
			K.on('msg:tchat.typing',  sync.typing);
			K.on('msg:tchat.clear',   sync.clear);
			K.on('msg:tchat.close',   sync.close);
			K.on('msg:tchat.max',     sync.max);
			K.on('msg:tchat.min',     sync.min);
			K.on('msg:gchat.msg',     sync.new);
			K.on('msg:gchat.typing',  sync.typing);
			K.on('msg:gchat.clear',   sync.clear);
			K.on('msg:gchat.close',   sync.close);
			K.on('msg:gchat.max',     sync.max);
			K.on('msg:gchat.min',     sync.min);
			// List 发出
			C.on(List.Events.GroupExpandChanged, S.listExpandChanged);
			C.on(List.Events.ListExpandChanged,  S.listExpandChanged);
			C.on(List.Events.ClickItem,          S.doOpenWindow);
			// 聊天窗口发出
			C.on(Window.Events.Min,   S.chatWindowMin);
			C.on(Window.Events.Open,  S.chatWindowOpen);
			C.on(Window.Events.Close, S.chatWindowClose);
			C.on(Window.Events.QuiteGroup, S.chatWindowQuiteGroup); // 从群聊退出
			C.on(Window.Events.CreateGroup, S.chatWindowCreateGroup); // 创建新群聊
			C.on(Window.Events.InviteInGroup, S.chatWindowInviteInGroup); // 在群聊中邀请


			// 窗口焦点获取
			Cache.WindowFocused = K.windowFocused;
			if (K.Browser.ie) {
				$(document)
					.bind('focusin',  S.onWindowFocus)
					.bind('focusout', S.onWindowBlur);
			}
			else {
				$(window)
					.bind('focus', S.onWindowFocus)
					.bind('blur',  S.onWindowBlur);
			}
		}
	}, new K.Pubsub()); // end All Controler




	// ============================Subscribe==============================
	// 处理监听到的事件
	Subscribe = {
		onWindowFocus: function () {
			if (!Cache.WindowFocused) {
				Cache.WindowFocused = true;
				K.log('~ window onfocused ~');

				// 当前active的窗口获得焦点
				$.each(Controler.getWindows(), function (i, win) {
					if (win.isActive()) {
						win.open();
					}
				});

				// 停止标题闪烁
				Controler.hideBlink();
			}
		},
		onWindowBlur: function () {
			if (Cache.WindowFocused) {
				Cache.WindowFocused = false;
				K.log('~ window blured ~');
			}
		},
		// list展开状态改变，存储到cookie
		listExpandChanged: function () {
			Controler.saveStatusToCookie();
		},
		// 点击列表打开窗口
		doOpenWindow: function (data) {
			var win = Controler.getWindow(data.id);

			if (!win) {
				K.log('需要创建窗口：'+data)
				win = Controler.createWindow(
					$.extend({'openFrom': Controler.getConf().openFrom.manual}, data)
				);
			}
			win.open();
		},
		chatWindowMin: function (win) {
			K.log(['最小化窗口', win.id]);
			Controler.saveStatusToCookie();
		},
		chatWindowOpen: function (win) { // 已经打开，包括新建、激活、max
			K.log(['打开窗口, 清空未读', win.id]);
			var id = win.id,
				unread = Controler.getUnread(id),
				unreadNumber = unread.length || 0,
				opts = {'chatid': Controler.getChatId()},
				url;

			Controler.saveStatusToCookie();

			// 本身unreadNumber是0，不需要处理
			if (!unreadNumber) {
				return;
			}

			// 个人
			if (win.id >> 0) {
				url = '/chat/clear.php';
				opts.otheruid = id;
				opts.cmids = K.map(unread, function (v) {
								return v.cmid || 0;
							}).join(',');
			}
			// 群聊、圈子
			else {
				url = '/rgroup/aj_chat_clear.php';
				opts.gid = id;
			}

			if (url) {
				$.post(url, opts);
				Sync.clear(id);
			}
		},
		chatWindowClose: function (win) { // 已经关闭
			K.log(['关闭窗口', win.id, win.title]);
			Controler.removeWindow(win);
			Controler.saveStatusToCookie();
		},
		// 主动发起：退出群聊
		chatWindowQuiteGroup: function (win) {
			// remove the group from Datasource
			Controler.removeGroup(win.id);
			// remove the group from List
			Controler.getListInstance().removeItem(win.id);
		},
		// 主动发起：创建新的群聊
		chatWindowCreateGroup: function (data) {
			Controler.getListInstance().insertItem(
				Controler.getGroup(data.gid),
				'group'
			);
		},
		// 主动发起：在群聊中邀请
		chatWindowInviteInGroup: function (data) {
			Controler.getListInstance().updateItemInGroup(data.gid);
		},
		// 被邀请加入群聊 -- 新创建群组
		// - 数据更新
		// - 列表更新
		// - 判断是否创建聊天窗口弹出
		chatGroupAdded: function (data) {
			var win;
			// 过滤自己的消息
			if (Controler.isMine(data.uid)) {
				return;
			}
			K.log(['tchat.added ...: ', data]);
			// 将新的群信息加入DS
			Controler.addGroup({'gid':data.gid, 'ginfo': data});
			// list 中创建新的群聊项
			Controler.getListInstance().insertItem(
				Controler.getGroup(data.gid),
				'group'
			);

			if (!Controler.getForbidAlert()) {
				// 创建窗口
				win = Controler.createWindow({
					'id': data.gid,
					'openFrom': Controler.getConf().openFrom.msg
				});
				win.open();
			}
		},
		// 成员变化：
		// - 收到新加入成员信息 -- 新成员加入群聊
		// - 收到退出群的通知 -- 其他人退出
		// 操作内容
		// - 更新数据
		// - 更新列表
		// - 更新聊天窗口
		chatGroupMemberChange: function (data) {
			// 过滤自己的消息
			if (Controler.isMine(data.uid)) {
				return;
			}
			var gid = data.gid,
				groupData = Controler.getGroup(gid),
				win;

			// 更新数据
			groupData.ginfo.member = data.member;
			groupData.ginfo.name = data.name;
			// 更新列表
			Controler.getListInstance().updateItemInGroup(gid);
			// 更新聊天窗口 
			win = Controler.getWindow(gid);
			if (win) {
				if (win.member[data.uid]) { // quit
					delete win.member[data.uid];
				}
				else { // join
					win.member[data.uid] = Controler.getUser(data.uid);
				}
				win.updateTitle();
			}
		},
		// 收到新的消息
		// - 窗口未读提醒
		// - 列表未读设置
		// - 通知
		chatNewRecord: function (data) {
			var id, win, unreadDiff, needNotify;
			K.log(['chat.msg 收到新消息', data]);
			// 个体对话时，uid-消息发送者，otheruid-消息接收者
			// 群组时，uid-消息发送者
			// 这里要过滤自己发出的
			if (Controler.isMine(data.uid)) {
				return;
			}

			unreadDiff = 1;
			id = data.gid || data.uid;
			Controler.addUnread(id, data);

			// 如果不是圈子禁言，窗口提醒
			if (!(data.gid && Controler.getForbidCircle(data.gid))) {
				win = Controler.getWindow(id);
				if (win) {
					win.dealNewMsg(data);
					needNotify = true;
				}
				else { // 全新消息
					// 未设置弹出提醒才弹出窗口
					if (!Controler.getForbidAlert()) {
						Controler.createWindow({
							'id': id,
							'openFrom': Controler.getConf().openFrom.msg
						});
						needNotify = true;
					}
				}
			}

			// 处理list的未读信息显示
			Controler.getListInstance().updateUnread(id, unreadDiff);
			// 通知
			if (needNotify) {
				Controler.showBlink(data.uid);
				Controler.DesktopNotify.showChatNotify(data);
			}
		},
		chatTyping: function (data) {
			K.log(['msgchat:正在输入...', data]);
			var win = Controler.getWindow(data.gid || data.uid),
				info;
			// 不是自己的 && 打开时才提示
			if (!Controler.isMine(data.uid) && win && win.isOpen()) { 
				win.showTip('typing', Controler.getUser(data.uid));
			}
		},
		chatClear: function (data) { // data = {chatid: ..., uid/gid: ...}
			K.log(['msgchat:clear 清除未读消息', data]);
			Sync.clear(data.gid || data.uid);
		},
		chatClose: function (data) {
			K.log(['msgchat:关闭', data]);
			Sync.close(data.gid || data.uid);
		},
		chatMin: function (data) {
			K.log(['msgchat:最小化', data]);
			Sync.min(data.gid || data.uid);
		},
		chatMax: function (data) {
			K.log(['msgchat:最大化', data]);
			Sync.max(data.gid || data.uid);
		},
		userOnline: function (data) {
			K.log(['msguser:用户上线', data]);
			Subscribe.userOnlineStatusChange('online', data);
		},
		userOffline: function (data) {
			K.log(['msguser:用户下线', data]);
			Subscribe.userOnlineStatusChange('offline', data);
		},
		// 处理各类消息的新消息数
		pollNewMsg: function (ctx) { // 开始将newmsg.php交由全局方法隔60s查询一次
			K.log('msg:.ctx 返回，newmsg.php交由原函数处理(60s一次)');
			if (window.checkNewMsgShow) {
				window.checkNewMsgShow($.parseJSON(ctx.state));
			}
		},
		// 用户在线状态改变处理
		userOnlineStatusChange: function (type, data) {
			var users = [];

			data = K.isArray(data) ? data : [data];
			// 修改存储的数据状态
			K.forEach(data, function (v, i) {
				var u = Controler.getUser(v.uid);
				if (u) {
					u.online = type === 'online' ? 1 : 0;
					users.push(u);
				}
			});

			if (users.length) {
				// 通知窗口有用户状态更新
				$.each(Controler.getWindows(), function (i, win) {
					win.onlineStatusChange(users);
					K.log('!!!!win 处理 onlinestatus： '+win.id )
				});			
				// 对应的list修改
				Controler.getListInstance().updateWhenOnlineChange(users);
			}
		}
	}; // end Subscribe


	/**
	 * 同步方法
	 */
	Sync = {
		// 清空未读
		// - 标题闪烁中的提醒移除
		// - DS清空
		// - 取消window中的未读状态
		// - list 中的未读数
		clear: function (id) {
			var unread = Controler.getUnread(id),
				win;
			if (unread.length) {
				// title blink
				$.each(unread.uids ? unread.uids : [id], function (i, uid) {
					TitleBlink.remove(uid);
				});
				// unread
				Controler.clearUnread(id);
				// window
				win = Controler.getWindow(id);
				if (win) {
					win.clearNotify();
				}
				// list
				Controler.getListInstance().updateUnread(id, -unread.length);
			}
		},
		close: function (id) {
			var win = Controler.getWindow(id);
			if (win) {
				win.close();
			}
		}
	}; // end Sync

	Controler.DesktopNotify = DesktopNotify;

	return Controler;
});
