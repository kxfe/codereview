// vim: filetype=javascript
/**
 * @fileoverview 
 *    页面中IM初始化文件
 * @author  linfei@corp.kaixin001.com
 * @date    2012/10/29
 *
 */
K.App('apps/im/AIMInit', [
	'jQuery',
	'im/BarAppList',
	'apps/im/IMControler',
	'apps/im/IMList',
	'apps/im/IMWindow',
	'im/IMPoller'
]).define(function (require) {
	K.__debug = true;

	var $ = require('jQuery'),
		BarAppList = require('im/BarAppList'),
		Controler = require('apps/im/IMControler'),
		List = require('apps/im/IMList'),
		Window = require('apps/im/IMWindow'),
		IMPoller = require('im/IMPoller'),
		
		jqWindow = $(window),
		jqBody = $('body'),
		Handler, TmplBar;
		
	Handler = {
		'container': 'body',
		'event': {},
		'main': function () {
			// 将两个窗口对象传递给Controler
			Controler.setConstructor({'List': List, 'Window': Window});
			// 开始事件监听
			Controler.subscribeMessage();

			// 放置bar
			this.initChatBar();

			// 加载列表数据
			$.when(
					this.loadAllUsers(),
					this.loadListInfo(),
					this.loadRecentUsers()
				)
			.done($.proxy(this.dealWithData, this))
			.fail(function () {
					alert('Sorry, 获取用户数据失败！');
				});

            //初始化AppList
            BarAppList.ins().init({'appTab': this.sigil('barAppListContainer')});
		},
		
		/**
		 * 加载所有好友
		 */
		'loadAllUsers': function () {
			var dfd = $.Deferred(),
				data = Kx.SuggestionDatabase.data;
			if (data) {
				dfd.resolve(data);
			}
			else {
				// 获取最新的所有好友
				// 方法定义在 /js/Kx_Suggestion.js 中
				Kx.SuggestionDatabase.get(function (succ, data) {
					if (succ) {
						dfd.resolve(data);
					}
				});
			}
			return dfd.promise();
		},
		/**
		 * 加载初始化前的数据
		 */
		'loadListInfo': function () {
			var dfd = $.Deferred();
			$.post('/chat/startchat.php', {
					'buddy': 1,
					'init': 1,
					'getmsg': 1,
					'cmid': 0
				},
				function (data) {
					dfd.resolve(data);
				}, 'json');	
			return dfd.promise();
		},
		/**
		 * 加载最近联系人
		 */
		'loadRecentUsers': function () {
			var dfd = $.Deferred();
			$.post('/interface/recentcontacts.php', function (data) {
				dfd.resolve(data);
			}, 'json');
			return dfd.promise();
		},

		/**
		 * 初始化第一次请求数据
		 * @param {Object|String} imInfo 好友列表信息 
		 */
		'dealWithData': function (allUsers, imInfo, recentUsers) {
			var imp, cookieInfo;
			K.log(['初始数据: ',
				'allUsers: ', allUsers,
				'imList: ', imInfo,
				'recentUsers: ', recentUsers]);
			// 更新数据源
			Controler.setMine(imInfo.mystatus);
			Controler.addUser(imInfo.buddylist);
			// 所有好友过滤，关系只能值为3(相互关注)
			Controler.addUser(K.filter(allUsers.users, function (u) {return u.rel === 3;}));
			Controler.setChatId(imInfo.chatid);
			Controler.setForbidSound(!!imInfo.forbidsound);
			Controler.setForbidAlert(!!imInfo.mystatus.stnotice);
			Controler.setUploadVerify(imInfo.upload.verify);

			Controler.addCircle(imInfo.groups);
			Controler.addGroup(imInfo.tgroups);
			Controler.addRecentUsers(recentUsers);
			// 设置未读数
			// 好友
			K.forEach(imInfo.messages.fusers, function (uid) {
				Controler.addUnread(uid, imInfo.messages.fmsgs[uid].msgs);
			});
			// 圈子
			K.forEach(imInfo.gunreads, function (unread, gid) {
				// unread: {chat:14,talk:100}
				Controler.addUnread(gid, unread);
			});
			// 群聊
			K.forEach(imInfo.tunreads, function (unread, gid) {
				Controler.addUnread(gid, unread);
			});


			// 使用IMPoller能够实现本地的消息同步(多Tab下只维护一个长连接)
			imp = new IMPoller({
				'callback': function (data) {
					// 全局广播(供页面中的其他APP使用，
					// 更合理的做法是把整个poll操作移出IM，因为是页面公用的)
					// 本地同步时才会调用
					K.fire('msg:poll_ok', data, true);
				}
			});
			imp.start();


			// 处理cookie内容
			cookieInfo = Controler.getStatusFromCookie() || {};
			// 初始化IMList
			List = List.getInstance({
					'container': this.sigil('barListWrap'),
					'statusInfo': cookieInfo.list || {}});
			// 设置聊天窗口的容器
			Controler.setWindowContainer(this.sigil('barChatTabs'));
			// 根据cookie内容打开窗口
			Controler.createWindowBaseOnCookie(cookieInfo.win || []);
		},


		/**
		 * 初始化bar
		 * @method initChatBar
		 */
		initChatBar: function () {
			var bar = $(TmplBar),
				me = this;

			this.sigil('root', bar, true);

			this.resizePosition();
			jqBody.append(bar);
			
			// 根据窗口变化调整bar
			jqWindow.resize((function () {
				var timer;
				return function () {
					if (timer) {
						clearTimeout(timer);
						timer = null;
					} 
					timer = setTimeout($.proxy(me.resizePosition, me), 100);
				};
			})());
		},
		
		/**
		 * 重新计算bar的位置
		 * @method resizePosition
		 */
		resizePosition: function () {
			var bar = this.sigil('root'),
				listWrap = this.sigil('barListWrap'),

				// 页面整体左移，该类要放到 body 上
				activeClass = 'chatUserListActived',
				// list不在窗口右侧时，要在wrap中添加下面的类
				inBarClass = 'kxChatUserListWrap_inBar',

				windowWidth = jqWindow.width(),
				right;
			
			// ie6 适应窗口变化时的定位
			if (K.Browser.ie6) {
				bar.css('bottom', -jqWindow.scrollTop());
			}
			// 根据窗口大小调整list的位置
			else {
				if (windowWidth > 1280) {
					jqBody.addClass(activeClass);
					listWrap.removeClass(inBarClass);
					right = (windowWidth - 1005 - 219) / 2;
				}
				else {
					jqBody.removeClass(activeClass);
					listWrap.addClass(inBarClass);
					right = (windowWidth - 1005) / 2;
					right = right < 0 ? 0 : right; // 窗口过小时
				}
				bar.css({'left': 'auto', 'right': right + 1});
			}
		},

		/**
		 * 得到selector
		 * 仅本程序中用到的[data-sigil=...]形式
		 *
		 * @method selector
		 * @private
		 * @param {String} sigil 具体内容
		 * @return {String} 组合成的选择符
		 */
		selector: function (sigil) {
			return '[data-sigil=' + sigil + ']';
		},
		/**
		 * 获取data-sigil形式的对象
		 *
		 *   - 获取并缓存起来
		 *   - 一旦存在就不会再去查找
		 *   - 可以设定某个值
		 *
		 * @method sigil
		 * @private
		 * @param {String} sigil 要访问的元素sigil值
		 * @param {jQuery Dom} context 父级元素，加快查找速度 
		 * @param {Boolean} isExecSet 是否执行赋值操作
		 * @return {jQuery Dom} returnDom
		 */
		sigil: function (sigil, context, isExecSet) {
			var dom = this._dom || (this._dom = {}),
				root, returnDom;
			
			// 执行赋值存储对象
			if (isExecSet) {
				returnDom = dom[sigil] = context;
			}
			else {
				dom.root ? void 0 : dom.root = $('body');
				root = dom.root; // 设置根元素
				// 查找元素
				if (sigil && K.isString(sigil)) {
					returnDom = dom[sigil];
					// 没有缓存的，则重新查找，并缓存
					if (!returnDom) {
						context ? root = context : void 0;
						returnDom = dom[sigil] = root.find(this.selector(sigil));
					}
				}
				else {
					returnDom = root;
				}
			}
			return returnDom;
		}


	};




	TmplBar = 
'<div class="kxChatBar">' +
'    <div class="kxChatBarIn">' +
'        <div class="kxChatApp"><!-- App列表 -->' +
'            <div class="kxChatAppBox" data-sigil="barAppListContainer">我的应用</div>' +
'        </div>' +
'        <!-- 聊天主体区 -->' +
'        <div class="kxChatMain">' +
'            <div class="clearfix kxChatMainIn">' +
'                <div class="kxChatUserListWrap" data-sigil="barListWrap"></div>' +
'                <div class="kxChatTabs" data-sigil="barChatTabs"><!-- tab列表 --></div>' +
'            </div>' +
'        </div>' +
'        <!-- 聊天主体区 END -->' +
'    </div>' +
'</div>';



	return Handler;

});
