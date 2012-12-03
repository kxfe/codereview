// vim: filetype=javascript
/**
 * @fileoverview 
 *    ͳһ����IM�еĽ���
 *
 * �ļ��������
     TitleBlink     ��������Ϣ��˸����
	 DesktopNotify  �������ѹ��ܷ�װ
	 Storage.imsync ���ش洢ͬ���������滻ԭ�е�sync���Ա���Խ��ո������Ͳ���
	 Controler      �ۺϸ���Controler
     Subscribe      �������������Ϣ
	 Sync           ͬ������

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
		// �ඨ�壬�ƹ�������ģ������(AIMInit�д���)
		Constructor = {
			// �б����class
			'List': {},
			// ���ڶ���class
			'Window': {}
		},
		// ��Ҫ�����һЩ����
		Cache = {
			Lock: {},
			Timer: {}
		},
		// 
		TitleBlink, DesktopNotify,
		WControler, LControler, Subscribe,
		Sync, // �洢ͬ������
		Controler = {};
	
	/**
	 * ������˸����
	 *  - ����˷�����Ϣ����ѭ������
	 */
	TitleBlink = (function () {
		var oldTitle,
			timer,
			blinkUsers = [],
			blinkIndex = 0,
			// ��ֻ��һ��ʱ��blinkIndex��Զֻ��һ��ֵ���޷����counter��������
			blinkCounter = 0;
		return {
			_prepareTitle: function (uid) {
				var user = Controler.getUser(uid);
				// �洢�ɵı���
				if (!oldTitle) {
					oldTitle = document.title || '';
				}
				// �洢Ҫѭ����ʾ���˵�����
				if (user) {
					if (K.indexOf(blinkUsers, user) < 0) {
						blinkUsers.push(user);
					}
				}
			},
			// �Ƴ�ĳ���˵���ʾ
			remove: function (uid) {
				blinkUsers = K.filter(blinkUsers, function (user) {
					return user.uid != uid;
				});
			},
			// ִ����˸
			play: function (uid) {
				var me = this;
				this._prepareTitle(uid);

				if (!timer) {
					timer = setInterval(function () {
						var t, len;
						// ѭ����ʾ���Ʊ��ÿպ�ֹͣ
						if (!blinkUsers.length) {
							me.stop();
							return;
						}

						len = blinkUsers.length;
						blinkIndex %= len;
						if ((blinkCounter++) % 2 === 0) {
							t = '��' + blinkUsers[blinkIndex].name + '˵...��- ' + oldTitle;
							blinkIndex = (blinkIndex + 1) % len;
						}
						else {
							t = '����������';
						}
						document.title = t;
					}, 1000);
				}
			},
			// ֹͣ��˸
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
	 * ��������
	 * DesktopNotify
	 */
    DesktopNotify = (function () {
	var notify = window.webkitNotifications;
	return {
		// �Ƿ�֧�ָù���
		isSupport: !!notify,
		// �Ƿ�����
		isPermission: function () {
			return this.isSupport && this.getPermission() === 0;
		},
		// ��ȡ���ֵ��0-����1-δ���ã�2-�ܾ�
		getPermission: function () {
			var v = 2;
			if (this.isSupport) {
				v = notify.checkPermission();
			}
			return v;
		},
		// ������ɣ�����Խ���ڻص������д���(�ص���û���κβ���)
		requestPermission: function (callback) {
			if (this.isSupport) {
				notify.requestPermission(callback);
			}
		},

		//�Ƿ���������������ѣ�֧���������ѡ��Ի�ȡ��ɡ�����δ�۽�
		isAllowNotify: function () {
			return this.isSupport && this.isPermission() && !Cache.WindowFocused;
		},
		// ������������
		create: function (icon, title, content) {
			var n;
			if (this.isAllowNotify()) {
				n = notify.createNotification(icon, title, content);
				// �����
				n.dir = 'ltl';
				//ȷ��ֻ��һ������
				n.tag = 'kxim';
			}
			return n;
		},
		show: function (icon, title, content, data) {
			var n, me = this;
			if (this.isAllowNotify()) {
				n = this.create(icon, title, content);
				// ����¼�����
				n.onclick = function () {
					me.clickHandler(data);
					n.cancel();
				};
				// ��ʾ����
				n.show();
				// һ��ʱ�����ʧ
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
				rgroup = /^{#(?:[^:]+:)(.+)#}$/, // Ⱥ��ϵͳ��Ϣ������ʽ
				sgroup; // �洢��������ϵͳ��Ϣ
			if (!this.isAllowNotify()) {
				return;
			}

			// ˵����
			user = Controler.getUser(data.uid);
			id = data.gid || data.uid;
			if (data.gid) {
				// Ȧ��
				if (id.slice(-1) === 'G') {
					groupData = Controler.getCircle(id);
					icon = 'rgroup/group_type_' + (groupData.ginfo.logo || 0) + '.png';
					title = K.subByte(groupData.ginfo.name, 24, '...');
				}
				// Ⱥ��
				else {
					groupData = Controler.getGroup(id);
					icon = 'chat/chat_group_32.png';
					title = K.subByte(groupData.ginfo.name, 20, '...��') + groupData.ginfo.member + '��';
				}
				icon = 'http://' + K.Env.IMG_HOST + '/i2/' + icon;
				content = user.name + ': ';
			}
			else { // ����
				icon = user.logo;
				title = user.name;
				content = '';
			}

			// ��������
			msg = $.parseJSON(data.msg);
			if (msg.attachment) { // �ļ�
				content += '�������ļ���' + msg.attachment.filename +
						  ' ��С��' + Controler.getFileSize(msg.attachment.size);
			}
			else if (sgroup = msg.content.match(rgroup)) { // ϵͳ��Ϣ��Ⱥ��ı䣩
				content = sgroup[1];
			}
			else { // һ���ı�
				content += msg.content;
			}

			this.show(icon, title, content, id);
		}
	};
	})(); // end DesktopNotify


	// �滻Storage�е�sync����
	Storage.imsync = function (func, context, prefix) {
		var me = this,
			// ��������ǰ׺�Ͳ���֮��ķָ���
			split = '~{##}~',
			// ����֮��ķָ���
			argSplit = '~{###}~',
			// ����������ʵ�ʲ���֮��ķָ�
			typeSplit = '~{t}~',
			isCurrentTrigger = false, // ��ʶ��ҳ�津��storage�޸�
			key;

		if(!me.isAvailable() || !K.isFunction(func)) {
			return func;
		}
		// ���ݺ������ɴ洢key(ԭ������ʱ��һ��������ָ���ر��ǰ׺)
		key = (prefix || '') + me._genSyncKey(func);

		// ����key�仯
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
						alert('Sorry! ��������ʧ�ܣ�δ�ҵ��ɽ�������');
						K.log('����ʧ�ܲ�����', args);
						return;
					}
					r.push(arg);
				}
				K.log(['onstorage change : ', r]);
				func.apply(context, r);
			}
			isCurrentTrigger = false;
		});
		
		// ���صĺ���ִ��ʱ����������ᱻת��Ϊstring���ͣ�Ȼ���ٽ�������
		// *���������Ǵ��������顢�ַ��������֡�����ֵ��null��undefined*
		// *��Щ�������ת�����ַ����󣬲��ָܻ�*
		return function () {
			var i = 0,
				len = arguments.length,
				arg, r = [];
			func.apply(context, arguments);
			isCurrentTrigger = true;
			// Ϊ����localstorage׼���ַ���
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
					// ���������Ͷ���������ж������ã�ֻ����plainObject
					case 'array':
					case 'object':
						arg = ['j', JSON.stringify(arg)]; // json
						break;
					default:
						alert('Sorry! ��Щ�������Ͳ��ʺ�תΪ�ַ������޷�ͬ����');
						return;
				}
				r.push(arg.join(typeSplit));
			}
			K.log(['ͬ������ִ����ϣ��޸�localstorage��', r]);
			// ͬ��(��ʱ������������Ϊ������������仯����������ҳ���޷�������)
			me.setItem(
				key, 
				new Date().getTime() + '' + Math.random() + split + (r.join(argSplit)) 
			);
		};
	};

	

	/*******************************Controler*************************************/
	
	// =========================ChatList==============================
	// �����漰�������෽��
	LControler = {
		// �õ�����List
		getListInstance: function () {
			return Constructor.List.getInstance();
		}
			
	}; // /end List Controler 
	
	// =========================ChatWindow==============================
	// ���촰���漰�������෽��
	WControler = (function () {
	var windowContainer, soundFlash;
	return {
		setWindowContainer: function (dom) {
			windowContainer = dom;
		},
		getWindowContainer: function () {
			return windowContainer;
		},
		// opts����id��openFrom����
		createWindow: function (opts) {
			var id = opts.id,
				type = (id + '').slice(-1),
				Window = Constructor.Window,
				user, win;
			
			// �������ԣ��Ѿ�����id �� openFrom
			$.extend(opts, {
				'container': Controler.getWindowContainer()
			});

			// Ⱥ��
			if (type === 'T') {
				$.extend(opts, {
					'type': Window.TYPE.GROUP,
					'useQuit': true,
					'useAddPerson': true
				});
			}
			// Ȧ��
			else if (type === 'G') {
				$.extend(opts, {
					'type': Window.TYPE.CIRCLE,
					'useForbid': true,
					'useAddPerson': false
				});
			}
			// ����
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
		// ����cookie��������(���ݸ�ʽ��getStatusFromCookie)
		createWindowBaseOnCookie: function (winInfo) {
			var activeWin;
			Cache.Lock.creatingFromCookie = true; // ��ʶ���ڴ�cookie�д�������
			$.each(winInfo, function (i, info) {
				var id = info.id,
					win;  
				// û�и�id�����
				if (!Controler.getUser(id) && 
					!Controler.getCircle(id) &&
					!Controler.getGroup(id)) {
					return;
				}

				win = Controler.createWindow({
						'id': id,
						// ����ʷ��¼����
						'openFrom': Controler.getConf().openFrom.auto
					});

				if (info.isOpen) {
					win.max(); // ������֪ͨ
				}
				if (info.isActive) {
					activeWin = win;
				}
				// �����δ����֪ͨ
				if (Controler.getUnread(win.id).length) {
					win.notify();
				}
			});
			
			// ����active�Ĵ���
			if (activeWin) {
				activeWin.open();
			}
			Cache.Lock.creatingFromCookie = false;
		},
		getFileSize: function (size) {
			var t;
			// �ļ���Сת��
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
			//IE��Flash������󲻻�ִ�У������Ҫ��������
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
	// - ��������Controler
	// - ��Ӳ��ù���ķ���
	// - �����Ϣ����
	K.mix(Controler, DControler, LControler, WControler, {
		// ����Window��List�����캯��
		setConstructor: function (structs) {
			K.mix(Constructor, structs);
		},
		// ���浽cookie��
		//  - ������id
		//  - �б�״̬
		//  - ����״̬
		saveStatusToCookie: function () {
			// ���ڴ�cookie�������ٱ���
			if (Cache.Lock.creatingFromCookie) {return;}
			var wins = Controler.getWindows(),
				listData = Controler.getListInstance().getListData(),
				state = [],
				cookie = [],
				toStr = function (b) { return b ? '1' : '0'; };
			// ������id
			cookie.push(Controler.getMine().uid);
			// �б�״̬
			// list.isOpen|group.type,group.isOpen|group.type,...
			state.push(toStr(listData.expand)); // list״̬
			$.each(listData.groups, function (type, group) { // ������״̬
				var st = [];
				st.push(type);
				st.push(toStr(group.expand));

				state.push(st.join(','));
			});
			cookie.push(state.join('|'));
			// ����״̬
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
			
			// ����cookie
			setTimeout(function () {
				Cookie.set(Controler.getConf().statusCookieName, cookie.join('\n'));
				K.log(['����cookie��ɣ�', cookie.join('\n')]);
			}, 10);
		},
		// ��cookie��ȡ������״̬
		getStatusFromCookie: function () {
			// ���ߣ�121322\n
			// �б�1|online,1|recent,0|...\n
			// ���ڣ�1343,0,0|234T,1,1|...
			var cookie = Cookie.get(Controler.getConf().statusCookieName).split('\n'),
				list, wins, result;
			K.log(['�õ�cookie�� ', cookie]);

			// �ṹ���������Լ����õ�
			if (cookie.length === 3 && Controler.isMine(cookie[0])) {
				result = {};
				// �б����
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
				// ���ڽ���
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
			
			K.log(['����cookie��ϣ�', result]);
			return result;
		},
		// ��ʾ������˸
		showBlink: function (uid) {
			if (!Cache.WindowFocused) {
				TitleBlink.play(uid);
			}
		},
		// ���ر�����˸
		hideBlink: function () {
			TitleBlink.stop();
		},
		/** 
		 * ����Ԫ��ͬʱ��ʾ, ���ڵ�������ط�ʱ���ر�dom
		 * 
		 *  - û��callbackʱ��Ĭ������panel 
		 *  - ������������Ԫ�ز�������Dom�������ж�
		 *
		 * @method avoidShowSimultaneously
		 * @param {mix for jquery} button ��ť
		 * @param {mix for jquery} panel ���
		 * @param {Function} callback ���⴦��ʱ�Ļص�
		 */
		avoidShowSimultaneously: (function () {
			var doms = [];
			$(document).bind('click', function (evt) {
				var target = evt.target;
				if (!$.contains(document.body, target)) {return;} // ����ҳ���еĲ����ж�
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
		// ������Ϣ
		subscribeMessage: function () {
			var C = Controler,
				Window = Constructor.Window,
				List = Constructor.List,
				S = Subscribe,
				sync;

			if (!(Window && List)) {
				K.log('Error��������Ϣ��ҪWindow��List��');
				return;
			}
			// ��Sync�еķ���ת��Ϊͬ������
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

			// ��Ϣ��ѯ
			K.on('msg:poll_init_ok', function (data) {K.log('msg:poll_init_ok ��һ��Poll���, ��ȡim���������!');});
			K.on('msg:poll_fail', function (data) {K.log('msg:poll_fail ���·�������...')});
			K.on('msg:.ctx',          S.pollNewMsg);
			// im��ѯ������Ϣ����
				// ���˴���
			K.on('msg:chat.msg',      sync.new);
			K.on('msg:chat.typing',   sync.typing);
			K.on('msg:chat.clear',    sync.clear);
			K.on('msg:chat.close',    sync.close);
			K.on('msg:chat.max',      sync.max);
			K.on('msg:chat.min',      sync.min);
			K.on('msg:.user.online',  S.userOnline);
			K.on('msg:.user.offline', S.userOffline);
				// Ⱥ��
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
			// List ����
			C.on(List.Events.GroupExpandChanged, S.listExpandChanged);
			C.on(List.Events.ListExpandChanged,  S.listExpandChanged);
			C.on(List.Events.ClickItem,          S.doOpenWindow);
			// ���촰�ڷ���
			C.on(Window.Events.Min,   S.chatWindowMin);
			C.on(Window.Events.Open,  S.chatWindowOpen);
			C.on(Window.Events.Close, S.chatWindowClose);
			C.on(Window.Events.QuiteGroup, S.chatWindowQuiteGroup); // ��Ⱥ���˳�
			C.on(Window.Events.CreateGroup, S.chatWindowCreateGroup); // ������Ⱥ��
			C.on(Window.Events.InviteInGroup, S.chatWindowInviteInGroup); // ��Ⱥ��������


			// ���ڽ����ȡ
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
	// ������������¼�
	Subscribe = {
		onWindowFocus: function () {
			if (!Cache.WindowFocused) {
				Cache.WindowFocused = true;
				K.log('~ window onfocused ~');

				// ��ǰactive�Ĵ��ڻ�ý���
				$.each(Controler.getWindows(), function (i, win) {
					if (win.isActive()) {
						win.open();
					}
				});

				// ֹͣ������˸
				Controler.hideBlink();
			}
		},
		onWindowBlur: function () {
			if (Cache.WindowFocused) {
				Cache.WindowFocused = false;
				K.log('~ window blured ~');
			}
		},
		// listչ��״̬�ı䣬�洢��cookie
		listExpandChanged: function () {
			Controler.saveStatusToCookie();
		},
		// ����б�򿪴���
		doOpenWindow: function (data) {
			var win = Controler.getWindow(data.id);

			if (!win) {
				K.log('��Ҫ�������ڣ�'+data)
				win = Controler.createWindow(
					$.extend({'openFrom': Controler.getConf().openFrom.manual}, data)
				);
			}
			win.open();
		},
		chatWindowMin: function (win) {
			K.log(['��С������', win.id]);
			Controler.saveStatusToCookie();
		},
		chatWindowOpen: function (win) { // �Ѿ��򿪣������½������max
			K.log(['�򿪴���, ���δ��', win.id]);
			var id = win.id,
				unread = Controler.getUnread(id),
				unreadNumber = unread.length || 0,
				opts = {'chatid': Controler.getChatId()},
				url;

			Controler.saveStatusToCookie();

			// ����unreadNumber��0������Ҫ����
			if (!unreadNumber) {
				return;
			}

			// ����
			if (win.id >> 0) {
				url = '/chat/clear.php';
				opts.otheruid = id;
				opts.cmids = K.map(unread, function (v) {
								return v.cmid || 0;
							}).join(',');
			}
			// Ⱥ�ġ�Ȧ��
			else {
				url = '/rgroup/aj_chat_clear.php';
				opts.gid = id;
			}

			if (url) {
				$.post(url, opts);
				Sync.clear(id);
			}
		},
		chatWindowClose: function (win) { // �Ѿ��ر�
			K.log(['�رմ���', win.id, win.title]);
			Controler.removeWindow(win);
			Controler.saveStatusToCookie();
		},
		// ���������˳�Ⱥ��
		chatWindowQuiteGroup: function (win) {
			// remove the group from Datasource
			Controler.removeGroup(win.id);
			// remove the group from List
			Controler.getListInstance().removeItem(win.id);
		},
		// �������𣺴����µ�Ⱥ��
		chatWindowCreateGroup: function (data) {
			Controler.getListInstance().insertItem(
				Controler.getGroup(data.gid),
				'group'
			);
		},
		// ����������Ⱥ��������
		chatWindowInviteInGroup: function (data) {
			Controler.getListInstance().updateItemInGroup(data.gid);
		},
		// ���������Ⱥ�� -- �´���Ⱥ��
		// - ���ݸ���
		// - �б����
		// - �ж��Ƿ񴴽����촰�ڵ���
		chatGroupAdded: function (data) {
			var win;
			// �����Լ�����Ϣ
			if (Controler.isMine(data.uid)) {
				return;
			}
			K.log(['tchat.added ...: ', data]);
			// ���µ�Ⱥ��Ϣ����DS
			Controler.addGroup({'gid':data.gid, 'ginfo': data});
			// list �д����µ�Ⱥ����
			Controler.getListInstance().insertItem(
				Controler.getGroup(data.gid),
				'group'
			);

			if (!Controler.getForbidAlert()) {
				// ��������
				win = Controler.createWindow({
					'id': data.gid,
					'openFrom': Controler.getConf().openFrom.msg
				});
				win.open();
			}
		},
		// ��Ա�仯��
		// - �յ��¼����Ա��Ϣ -- �³�Ա����Ⱥ��
		// - �յ��˳�Ⱥ��֪ͨ -- �������˳�
		// ��������
		// - ��������
		// - �����б�
		// - �������촰��
		chatGroupMemberChange: function (data) {
			// �����Լ�����Ϣ
			if (Controler.isMine(data.uid)) {
				return;
			}
			var gid = data.gid,
				groupData = Controler.getGroup(gid),
				win;

			// ��������
			groupData.ginfo.member = data.member;
			groupData.ginfo.name = data.name;
			// �����б�
			Controler.getListInstance().updateItemInGroup(gid);
			// �������촰�� 
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
		// �յ��µ���Ϣ
		// - ����δ������
		// - �б�δ������
		// - ֪ͨ
		chatNewRecord: function (data) {
			var id, win, unreadDiff, needNotify;
			K.log(['chat.msg �յ�����Ϣ', data]);
			// ����Ի�ʱ��uid-��Ϣ�����ߣ�otheruid-��Ϣ������
			// Ⱥ��ʱ��uid-��Ϣ������
			// ����Ҫ�����Լ�������
			if (Controler.isMine(data.uid)) {
				return;
			}

			unreadDiff = 1;
			id = data.gid || data.uid;
			Controler.addUnread(id, data);

			// �������Ȧ�ӽ��ԣ���������
			if (!(data.gid && Controler.getForbidCircle(data.gid))) {
				win = Controler.getWindow(id);
				if (win) {
					win.dealNewMsg(data);
					needNotify = true;
				}
				else { // ȫ����Ϣ
					// δ���õ������Ѳŵ�������
					if (!Controler.getForbidAlert()) {
						Controler.createWindow({
							'id': id,
							'openFrom': Controler.getConf().openFrom.msg
						});
						needNotify = true;
					}
				}
			}

			// ����list��δ����Ϣ��ʾ
			Controler.getListInstance().updateUnread(id, unreadDiff);
			// ֪ͨ
			if (needNotify) {
				Controler.showBlink(data.uid);
				Controler.DesktopNotify.showChatNotify(data);
			}
		},
		chatTyping: function (data) {
			K.log(['msgchat:��������...', data]);
			var win = Controler.getWindow(data.gid || data.uid),
				info;
			// �����Լ��� && ��ʱ����ʾ
			if (!Controler.isMine(data.uid) && win && win.isOpen()) { 
				win.showTip('typing', Controler.getUser(data.uid));
			}
		},
		chatClear: function (data) { // data = {chatid: ..., uid/gid: ...}
			K.log(['msgchat:clear ���δ����Ϣ', data]);
			Sync.clear(data.gid || data.uid);
		},
		chatClose: function (data) {
			K.log(['msgchat:�ر�', data]);
			Sync.close(data.gid || data.uid);
		},
		chatMin: function (data) {
			K.log(['msgchat:��С��', data]);
			Sync.min(data.gid || data.uid);
		},
		chatMax: function (data) {
			K.log(['msgchat:���', data]);
			Sync.max(data.gid || data.uid);
		},
		userOnline: function (data) {
			K.log(['msguser:�û�����', data]);
			Subscribe.userOnlineStatusChange('online', data);
		},
		userOffline: function (data) {
			K.log(['msguser:�û�����', data]);
			Subscribe.userOnlineStatusChange('offline', data);
		},
		// ���������Ϣ������Ϣ��
		pollNewMsg: function (ctx) { // ��ʼ��newmsg.php����ȫ�ַ�����60s��ѯһ��
			K.log('msg:.ctx ���أ�newmsg.php����ԭ��������(60sһ��)');
			if (window.checkNewMsgShow) {
				window.checkNewMsgShow($.parseJSON(ctx.state));
			}
		},
		// �û�����״̬�ı䴦��
		userOnlineStatusChange: function (type, data) {
			var users = [];

			data = K.isArray(data) ? data : [data];
			// �޸Ĵ洢������״̬
			K.forEach(data, function (v, i) {
				var u = Controler.getUser(v.uid);
				if (u) {
					u.online = type === 'online' ? 1 : 0;
					users.push(u);
				}
			});

			if (users.length) {
				// ֪ͨ�������û�״̬����
				$.each(Controler.getWindows(), function (i, win) {
					win.onlineStatusChange(users);
					K.log('!!!!win ���� onlinestatus�� '+win.id )
				});			
				// ��Ӧ��list�޸�
				Controler.getListInstance().updateWhenOnlineChange(users);
			}
		}
	}; // end Subscribe


	/**
	 * ͬ������
	 */
	Sync = {
		// ���δ��
		// - ������˸�е������Ƴ�
		// - DS���
		// - ȡ��window�е�δ��״̬
		// - list �е�δ����
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
