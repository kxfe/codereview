// vim: filetype=javascript
/**
 * @fileoverview 
 *    聊天好友列表
      需要与其他模块交互的内容，通过Controler发出消息并处理

 * @author  linfei@corp.kaixin001.com
 * @date    2012/10/26
 *
 */
define('apps/im/IMList', ['jQuery', 'doT', 'apps/im/IMControler', 'apps/im/IMSuggest'], function (require) {

	var $   = require('jQuery'),
		doT = require('doT'),
		Controler = require('apps/im/IMControler'),
		Suggest = require('apps/im/IMSuggest').Simple,
		
		jqWindow = $(window),
		Template,
		List, ListData;
	
	ListData = {
		'title': '聊天列表',
		'expand': false,
		'unread': 0, // 总的未读数
		'groups': {}
	};

	/**
	 * 好友列表
	 * @class List
	 * @singleton
	 */
	List = function (config) {
		// 合并配置
		$.extend(this, {
				'container': 'body',
				'statusInfo': {} // 从cookie的来的状态信息
			}, config);
		
		// 解析模板
		this.template = {};
		$.each(Template, $.proxy(function (key, val) {
			this.template[key] = doT.template(val);
		}, this));

		this.container = $(this.container);
	
		this._init();
	};

	// List fire events
	List.Events = {
		'GroupExpandChanged': 'list:groupExpandChanged',
		'ListExpandChanged':  'list:windowExpandChanged',
		'ClickItem':          'list:clickItemToOpenChatWindow'
	};

	/**
	 * 初始入口函数
	 * @method _init
	 * @private
	 */
	List.prototype._init = function () {
		// 初始化数据
		this._initData();

		// 创建Dom
		this._createListDom();

		// 注册事件
		this._initEvents();

		// 添加到页面
		this._appendToDom();
	};
	
	List.prototype.getListData = function () {
		return ListData;
	};
	/**
	 * 初始化数据
	 * @method _initData
	 * @private
	 */
	List.prototype._initData = function () {
		var listData = this.getListData(),
			groups = listData.groups,

			onlineUsers = [],
			friendUsers = [];
		// 过滤所有好友和在线好友
		$.each(Controler.getUsers(), function (uid, user) {
			if (!Controler.isMine(user.uid)) {
				friendUsers.push(user);
				if (user.online) {
					onlineUsers.push(user);
				}
			}
		});

		// 有好友时才放置分组数据
		if (friendUsers.length) {
			$.extend(groups, {
				// 最近联系人
				'recent':
				{
					id: K.uniqueId(),
					name: '最近联系人',
					expand: false,
					member: Controler.getRecentUsers(),
					type: 'recent',
					unread: 0,
					dom: null
				},
				// 在线好友
				'online':
				{
					id: K.uniqueId(),
					name: '在线好友',
					expand: false,
					member: onlineUsers,
					type: 'online', // 只有在线好友才此类型
					unread: 0,
					dom: null // 保持对实际分组dom对象的引用
				},
				// 全部好友
				'all':
				{
					id: K.uniqueId(),
					name: '全部好友',
					expand: false,
					member: friendUsers,
					type: 'all',
					unread: 0,
					dom: null
				},
				// 群组
				'group':
				{
					id: K.uniqueId(),
					name: '群聊',
					expand: false,
					member: K.toArray(Controler.getGroups()),
					type: 'group',
					unread: 0,
					dom: null
				},
				// 圈子
				'circle':
				{
					id: K.uniqueId(),
					name: '圈子',
					expand: false,
					member: K.toArray(Controler.getCircles()),
					type: 'circle',
					unread: 0,
					dom: null
				}
			});
			// 最近联系人、在线好友大于5人时默认展开
			groups.recent.member.length > 5 ? groups.recent.expand = true : void 0;
			groups.online.member.length > 5 ? groups.online.expand = true : void 0;
			// 圈子、群聊成员大于2时默认展开
			groups.group.member.length > 2 ? groups.group.expand = true : void 0;
			groups.circle.member.length > 2 ? groups.circle.expand = true : void 0;
			// 合并状态数据
			$.extend(true, listData, this.statusInfo);
			// 全部好友 默认不打开
			groups.all.expand = false;

			// 遍历获取总的未读数
			// 为优化，从unread中遍历
			// 参与者： online、all、group、circle，recent单独处理
			$.each(Controler.getAllUnread(), function (id, unreadInfo) {
				var length = unreadInfo.length || 0;
				// 单人
				if (id >> 0) {
					groups.all.unread += length;
					if (Controler.getUser(id).online) {
						groups.online.unread += length;
					}
				}
				// 组
				else {
					groups[id.slice(-1) === 'T' ? 'group' : 'circle'].unread += length;
				}
				listData.unread += length;
			});
			// ‘最近联系人’需单独遍历
			$.each(groups.recent.member, function (i, user) {
				groups.recent.unread += Controler.getUnread(user.uid).length || 0;
			});
		}
	};

	/**
	 * 创建list窗口
	 * @method _createListDom
	 * @private
	 */
	List.prototype._createListDom = function () {
		var data = this.getListData(),
			groups = data.groups,
			opts = {
				'title': data.title,
				'expand': data.expand
			},
			list;

		// 在线、总数、未读消息总数
		if (K.isEmpty(groups)) {
			opts.onlineNumber = opts.totalNumber = 0;
			opts.unreadHtml = '';
		}
		else {
			$.extend(opts, {
				'onlineNumber': groups.online.member.length,
				'totalNumber': groups.all.member.length,
				'unreadHtml': this.getUnreadHtml(data.unread) // 总数存在ListData.unread中
			});
		}
		
		list = $(this.template.list(opts));
		this.sigil('root', list, true);

		// 无任何好友提示
		if (K.isEmpty(groups)) {
			this.sigil('listWrap')
				.append(this.template.empty({}));
		}
		// 有分组数据时
		else {
			$.each(groups, $.proxy(function (type, group) {
				group.dom = this.addGroup(group);
			}, this));
		}

		return list;
	};

	/**
	 * 初始化List窗口事件
	 * @method _initEvents
	 * @private
	 */
	List.prototype._initEvents= function () {
		var list = this.getListDom(),
			me = this;

		list.delegate([ this.selector('listTitle'),
						this.selector('listButtonExpand'),
						this.selector('listMin')].join(','),
					  'click',
					  $.proxy(this._eToggleList, this))
			.delegate(this.selector('listButtonSet'), 'click', $.proxy(this._eToggleSetPanel, this))
			//.delegate(this.selector('listSetSound'), 'change', $.proxy(this._eSetSound, this))
			.delegate(this.selector('listSetDesktopNotify'), 'change', $.proxy(this._eSetDesktopNotify, this))
			.delegate(this.selector('listSetAlert'), 'change', $.proxy(this._eSetAlert, this))
			.delegate(this.selector('listBuddyGroup'), 'click', $.proxy(this._eToggleGroup, this))
			.delegate(this.selector('listBuddyItem'), 'click', $.proxy(this._eClickItem, this))
			.delegate(this.selector('listBuddyItem'), 'hover', $.proxy(this._eHoverItem, this))
			.delegate(this.selector('listSearchInput'), 'focus', $.proxy(this._eFocusSearch, this));

		// 窗口调整事件
		/*
		jqWindow.resize((function () {
			var timer;
			return function () {
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				timer = setTimeout($.proxy(me.resizeList, me), 100);
			};
		})());
		*/
	};

	/**
	 * 根据配置执行初始化操作，之后将list添加到页面上
	 * @method _appendToDom
	 * @private
	 */
	List.prototype._appendToDom = function () {

		// 展开状态判断
		// Manage
		// 根据窗口设置
		this.resizeList();
		

		// 加到页面
		this.getListDom().appendTo(this.container);
	};

	// 事件：窗口涉及到的所有事件操作
	// toggle 整个list窗口
	List.prototype._eToggleList = function (evt) {
		var panel = this.sigil('listPanel'),
			expand = panel.is(':visible');

		if (expand) {
			panel.hide();
		}
		else {
			panel.show();
			this.sigil('listSearchInput').focus();
		}
		this.getListData().expand = !expand;
		
		// 通知list expand状态改变
		Controler.fire(List.Events.ListExpandChanged);

		evt.preventDefault();
	};
	// toggle 设置面板
	List.prototype._eToggleSetPanel = function (evt) {
		var panel = this.sigil('listSetPanel'),
			openClass = 'kxChatUserListControl_setOpen',
			dnotify;

		if (!panel.length) {
			dnotify = Controler.DesktopNotify;
			panel = $(this.template.setpanel({
					//'forbidSound': Controler.getForbidSound(),
					'forbidAlert': Controler.getForbidAlert(),
					'canSetDesktopNotify': dnotify.isSupport,
					'isDesktopNotify': dnotify.isPermission()
				}))
				.hide(); // 默认不显示
			this.sigil('listButtonSet').before(panel);
			this.sigil('listSetPanel', panel, true);

			Controler.avoidShowSimultaneously(evt.currentTarget, panel, function () {
				panel.parent().removeClass(openClass).end().hide();
			});
		}

		panel.is(':visible') ?
			panel.parent().removeClass(openClass).end().hide() :
			panel.parent().addClass(openClass).end().show();

		evt.preventDefault();
	};
	/*
	List.prototype._eSetSound = function (evt) {
		var isForbid = this.sigil('listSetSound').is(':checked');
		Controler.setForbidSound(isForbid);
	};
	*/
	List.prototype._eSetAlert = function (evt) {
		var isForbid = !this.sigil('listSetAlert').is(':checked');
		Controler.setForbidAlert(isForbid);
		// 发送到服务器
		$.post('/chat/updatenotice.php', {
				'action': 'setstnotice',
				'stnotice': isForbid ? 1 : 0
			});
	};
	// 设置桌面提醒
	List.prototype._eSetDesktopNotify = function (evt) {
		var target = $(evt.currentTarget),
			isChecked = target.is(':checked'),
			dnotify = Controler.DesktopNotify,
			tip = '，你曾经设置过该项。\n\n请到“设置”-“隐私设置”-“内容设置”-“通知”-“管理例外情况”中重置该项功能。';

		dnotify.requestPermission(function () {
			if (dnotify.isPermission()) {
				if (!isChecked) {
					target.attr('checked', 'checked');
					alert('无法取消桌面通知' + tip);
				}
			} 
			else {
				if (isChecked) {
					target.removeAttr('checked');
					if (dnotify.getPermission() === 2) {
						alert('无法设置桌面通知' + tip);
					}
				}
			}
		});
	};
	// toggle 一个分组
	List.prototype._eToggleGroup = function (evt) {
		var target = $(evt.currentTarget),
			parentDom = target.parent(),	
			wrap = target.next(), // 盛放分组成员的wrap
			expandClass = 'kxChatUserListGroup_active',

			listData = this.getListData(),
			groupData = listData.groups[target.data('grouptype')],
			expand = wrap.css('display') !== 'none';

		// 删除unread
		target.find(this.selector('listUnread')).remove();
		if (expand) {
			wrap.hide();
			parentDom.removeClass(expandClass);
			 // 未读消息显示
			target.append(this.getUnreadHtml(groupData.unread));
		}
		else {
			// 初始未展开，没有列表数据
			if (!wrap.children().length) {
				this.addItem(groupData.member, wrap);
			}
			parentDom.addClass(expandClass);
			wrap.show();
		}
		groupData.expand = !expand;
		// 通知group状态改变
		Controler.fire(List.Events.GroupExpandChanged, {'id': target.data('id')});

		evt.preventDefault();
	};
	// 点击一个成员
	List.prototype._eClickItem = function (evt) {
		var id = $(evt.currentTarget).data('itemid');
		Controler.fire(List.Events.ClickItem, {'id': id});
		evt.preventDefault();
	};
	List.prototype._eHoverItem = function (evt) {
		$(evt.currentTarget).toggleClass('hover');
	};
	// 搜索
	List.prototype._eFocusSearch = function (evt) {
		if (!this._resistedSuggest) {
			this._resistedSuggest = new Suggest({
				'inputDom': this.sigil('listSearchInput'),
				'clearDom': this.sigil('listSearchDel'),
				'suggestWrap': this.sigil('listBuddy'),
				'isReplaceSuggestWrap': true,
				'isReverse': true
			});
			// 选中一项，可能是人，也可能是圈子
			this._resistedSuggest.on(Suggest.Events.SelectedItem, function (data) {
				K.log('list 捕获到选中了一个id：' + (data.uid || data.gid));
				var uid = data.uid,
					gid = data.gid,
					info;
				// 如果是人
				if (uid) {
					info = Controler.getUser(uid);
					if (!info) {
						Controler.addUser(data);
					}
				}
				else if (gid) {
					K.log('从 suggest 中打开一个圈子', data);
				}

				Controler.fire(List.Events.ClickItem, {'id': uid || gid || 0});
			});
		}
	};

	/**
	 * 好友在线状态改变(online/offline)时，更新相关dom
	 *   - 增删“在线好友”分组中的成员
	 *   - 修改“在线好友”分组上的数目 & 收缩后的list上的数目
	 *   - 修改所有分组中包含状态修改用户的online状态
	 * @method updateWhenOnlineChange 
	 * @param {Array} users online状态改变的好友数组
	 */
	List.prototype.updateWhenOnlineChange = function (users) {
		var me = this,
			buddy = this.sigil('listBuddy'),
			// 在线好友 节点
			onlineGroupTitle = buddy.find(this.selector('listBuddyGroup') + '[data-grouptype=online]'),
			onlineGroupWrap = onlineGroupTitle.next(),
			onlineGroupNumber = onlineGroupTitle.find(this.selector('listGroupMemberNumber')),

			diffOnline = 0,
			selectors = [],
			userMap = {},
			listMinNumber;
		
		// 改变“在线好友”中的成员及总数
		K.forEach(users, function (u, i) {
			var s = me.selector('listBuddyItem') + '[data-itemid=' + u.uid + ']';
			if (u.online) { // 新上线
				diffOnline += 1;
				me.addItem(u, onlineGroupWrap);
			}
			else { // 新下线
				diffOnline -= 1;
				onlineGroupWrap.find(s).remove();
			}
			selectors.push(s);
			userMap[u.uid] = Controler.getUser(u.uid);
		});
		onlineGroupNumber.text(onlineGroupNumber.text() - 0 + diffOnline);

		// 改变其他分组中的在线状态
		if (selectors.length) {
			buddy.find(selectors.join(',')).each(function (i, itemDom) {
				itemDom = $(itemDom);
				itemDom.replaceWith(me.getItemHtml(userMap[itemDom.data('itemid')]));
			});
		}

		// min时，list上的显示
		listMinNumber = this.sigil('listMin').find(this.selector('listMinOnlineNumber'));
		listMinNumber.text(listMinNumber.text() - 0 + diffOnline);
	};


	/**
	 * 获取list节点
	 * @method getListDom
	 * @return {jQuery Dom} list
	 */
	List.prototype.getListDom = function () {
		return this.sigil('root');
	};

	/**
	 * 添加一个组，包含组名称、组成员列表
	 * @method addGroup
	 * @param {Object} groupData 一个分组的数据
	 * @return {jQuery Dom} groupDom 
	 */
	List.prototype.addGroup = function (groupData) {
		var member = groupData.member || [],
			groupDom = $(this.template.group(
					$.extend({
						'number': member.length,
						// 展开时，不需要group标题上的未读数
						'unreadHtml': groupData.expand ? '' : this.getUnreadHtml(groupData.unread)
					}, groupData)
				));
		
		// 需要展开才放置节点
		if (groupData.expand) {
			this.addItem(member, groupDom.find(this.selector('listBuddyItemWrap')));
		}

		groupDom.appendTo(this.sigil('listBuddy'));

		return groupDom;
	};

	/**
	 * 添加成员项
	 * @method addItem
	 * @param {Object} member 成员的信息
	 * @param {jQuery Dom} itemWrap 用来盛放一组成员的容器
	 * @return
	 */
	List.prototype.addItem = function (member, itemWrap) {
		member = K.isArray(member) ? member : [member];

		$.each(member, $.proxy(function (index, item) {
			itemWrap.append(this.getItemHtml(item));
		}, this));
	};
	/**
	 * 删除成员项
	 * @method removeItem
	 * @param {String|Number} id 成员项的id值
	 */
	List.prototype.removeItem = function (id) {
		var itemDom = this.sigil('listBuddy')
				.find(this.selector('listBuddyItem') + '[data-itemid=' + id + ']'),
			groupTitle;

		if (itemDom.length) { 
			groupTitle = itemDom.parent().prev();
			// 修改标题的总数
			groupTitle.text(groupTitle.text().replace(
					/(\d+)(\)\s*)$/g,
					function (w, a, b) {return (a - 1) + b;}
				));
			// 移除
			itemDom.remove();
		}
	};
	/**
	 * 插入成员项（最前面）
	 * @method insertItem
	 * @param {Object} info 要插入的成员信息
	 * @param {String} groupType 要插入组的类型
	 */
	List.prototype.insertItem = function (info, groupType) {
		var groupTitle = this.sigil('listBuddy')
				.find(this.selector('listBuddyGroup') + '[data-grouptype=' + groupType + ']'),
			groupWrap,
			groupData;

		if (groupTitle.length) { 
			groupWrap = groupTitle.next();
			// 修改标题的总数
			groupTitle.text(groupTitle.text().replace(
					/(\d+)(\)\s*)$/g,
					function (w, a, b) {return (a - 0 + 1) + b;}
				));
			// 插入
			if (!groupWrap.children().length) { // 未插入item
				groupData = K.detect(this.getListData().groups, function (g) {return g.type === groupType;});
				groupData.member = [info].concat(groupData.member);
			}
			else {
				groupWrap.prepend(this.getItemHtml(info));
			}
		}
	};
	List.prototype.updateItemInGroup = function (gid) {
		var itemDom = this.sigil('listBuddy')
				.find(this.selector('listBuddyItem') + '[data-itemid=' + gid + ']');
		
		if (itemDom.length) {
			itemDom.replaceWith(this.getItemHtml(Controler.getGroup(gid)));
		}
	};
	/**
	 * 得到一个组成员的html
	 * @method getItemHtml
	 * @param {Object} info item所需的一些信息
	 * @return {String} item的html字符串
	 */
	List.prototype.getItemHtml = function (info) {
		// 获取未读数
		var unread = Controler.getUnread(info.id || info.gid || info.uid).length || 0;
		if (info.logo) {
			// 替换头像为50px的尺寸
			info.logo = info.logo.replace(/(?:\d+)(_\d+_\d+\.\w+)$/, '50$1');
		}
		return this.template.item($.extend({
					'unreadHtml': this.getUnreadHtml(unread)
				}, info));
	};
	/**
	 * 获取未读的html
	 */
	List.prototype.getUnreadHtml = function (n) {
		return this.template.unread({'unread': n || 0});
	};

	/**
	 * 调整list窗口，包含位置、高度变化
	 * @method resizeList
	 * @return
	 */
	List.prototype.resizeList = function () {
		/*
		this.sigil('listWrap').animate(
				{
					'height': Math.max(jqWindow.height() - 92, 120)
				},
				50
			);
		*/
	};
	/**
	 * 更新未读信息
	 * @param {String || Number} id itemid
	 * @param {Number} diff 未读数变化量
	 */
	List.prototype.updateUnread = function (id, diff) {
		diff = diff >> 0;
		if (!diff) {return;}

		var me = this,
			panel = this.sigil('listPanel'),
			unread = Controler.getUnread(id).length || 0,
			itemDom = this.sigil('listBuddy', panel)
				.find(this.selector('listBuddyItem') + '[data-itemid=' + id + ']'),
			listData = this.getListData();

		// 更新已经放到列表中的dom
		if (itemDom.length) {
			itemDom.find(this.selector('listUnread')).remove();
			itemDom.append(this.getUnreadHtml(unread));
		}
		// 查找分组中是否包含变化元素
		// 如果包含，则更新分组的数据
		$.each(listData.groups, function (type, group) {
			var item;
			// 个人
			if (id >> 0 && type !== 'group' && type !== 'circle') {
				item = K.detect(group.member, function (o) {
					return o.uid == id;
				});
			} 
			// 组
			else if (!(id >> 0) && (type === 'group' || type === 'circle')) {
				item = K.detect(group.member, function (o) {
					return o.gid == id;
				});
			} 

			// 该分组包含变化项
			if (item) {
				group.unread += diff;
				if (group.dom.find(me.selector('listBuddyItemWrap')).css('display') === 'none') {
					group.dom.find(me.selector('listBuddyGroup'))
						.find(me.selector('listUnread')).remove()
						.end()
						.append(me.getUnreadHtml(group.unread));
				}
			}
		});
		// 更新总的个数
		listData.unread += diff;
		this.sigil('listMin')
			.find(this.selector('listUnread')).remove()
			.end()
			.append(this.getUnreadHtml(listData.unread));
	};

	/**
	 * 得到selector
	 * 仅本程序中用到的[data-sigil=...]形式
	 *
	 * @method selector
	 * @private
	 * @param {String} sigil 具体内容
	 * @return {String} 组合成的选择符
	 */
	List.prototype.selector = function (sigil) {
		return '[data-sigil=' + sigil + ']';
	};
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
	List.prototype.sigil = function (sigil, context, isExecSet) {
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
	};




	/**
	 * 获取List的单一实例
	 * @static
	 * @method getInstance
	 * @param {Object} config 配置信息
	 * @return {List} list窗口对象
	 */
	List.getInstance = (function () {
		var instance;
		return function (config) {
			if (!instance) {
				instance = new List(config);
			}
			return instance;
		};
	})();



	Template = {
		// 好友列表框架HTML
		list: 
'<div class="kxChatUserListMain">' +
'	<div class="kxChatUserList" data-sigil="listPanel" {{=it.expand ? \'\' : \'style="display:none;"\'}}>' +
		// 列表头部
'		<div class="kxChatUserListHeader" data-sigil="listTitle">' +
'			<i class="kxChatIcon kxChatIcon_listHeader"></i> <b>{{=it.title}}</b>' +
'		</div>' +
		// 用户列表
'		<div class="kxChatUserListBd kx_scrollAble" data-sigil="listWrap">' +
			// 常规用户列表
'			<div class="kxChatUserList_AllUser" data-sigil="listBuddy"></div>' +
'		</div>' +
		// 列表搜索，设置，隐藏 操作区
'		<div class="clearfix kxChatUserListFunc">' +
'			<div class="kxChatUserListSearch">' +
'				<input type="text" placeholder="支持首字母搜索" data-sigil="listSearchInput"/>' +
'				<b data-sigil="listSearchDel" title="清空"></b>' +
'			</div>' +
'			<div class="kxChatUserListControl">' +
'				<div class="kxChatUserListControl_hide">' +
'					<a href="#" class="kxChatUserListControl_btn" data-sigil="listButtonExpand">收起</a>' +
'				</div>' +
'				<div class="kxChatUserListControl_set" data-sigil="listButtonSetWrap">' +
'					<a href="#" class="kxChatUserListControl_btn" data-sigil="listButtonSet">设置</a>' +
'				</div>' +
'			</div>' +
'		</div>' +
'	</div>' +
	// 列表开关
'	<div class="kxChatUserListToggle" data-sigil="listMin">' +
'		<i class="kxChatIcon kxChatIcon_icon"></i> <span class="zoom">聊天 (<span data-sigil="listMinOnlineNumber">{{=it.onlineNumber || 0}}</span>/{{=it.totalNumber || 0}})</span> {{=it.unreadHtml}}' +
'	</div>' +
'</div>',

		// 好友列表分组HTML
		group: 
// 一个列表组 展开后增加 'kxChatUserListGroup_active'
'<div class="kxChatUserListGroup{{=it.expand ? " kxChatUserListGroup_active" : ""}}">' +
'	<h3 data-sigil="listBuddyGroup" data-groupid="{{=it.id}}" data-grouptype="{{=it.type}}">{{=it.name}}(<span data-sigil="listGroupMemberNumber">{{=it.number||0}}</span>) {{=it.unreadHtml}}</h3>' +
	// 好友项分组
'	<ul class="kxChatUserListItem" data-sigil="listBuddyItemWrap"></ul>' +
'</div>',

		// 好友列表项HTML
		item:
'<li data-sigil="listBuddyItem" ' +
// 群聊或圈子
'{{if (it.gid) {}}' +
'	data-itemid="{{=it.gid}}">' +
	// 群聊
'	{{if (it.gid.slice(-1) === \'T\') {}}' +
'		<a href="#" class="kxAvatar_32 kxAvatar_group" title="{{=it.ginfo.name}} 共{{=it.ginfo.member}}人"></a><a href="#" title="{{=it.ginfo.name}} 共{{=it.ginfo.member}}人">{{=K.subByte(it.ginfo.name, 20, \'...等\')+it.ginfo.member+\'人\'}}</a>' +
	// 圈子
'	{{} else {}}' +
'		<a href="/rgroup/index.php?gid={{=it.gid.slice(0, -1)}}" class="kxAvatar_32 kxAvatar_circle" title="{{=it.ginfo.name}}"></a><a href="/rgroup/index.php?gid={{=it.gid.slice(0, -1)}}" title="{{=it.ginfo.name}}">{{=K.subByte(it.ginfo.name, 20, "...")}}</a>' +
'	{{}}}' +
// 个人
'{{} else {}}' +
'	data-itemid="{{=it.uid}}">' +
'		<a href="/home/{{=it.uid}}.html" class="kxAvatar_32"><img src="{{=it.logo}}" alt=""/></a><a href="/home/{{=it.uid}}.html" title="{{=it.real_name}}">{{=K.subByte(it.real_name, 18, "...")}}</a>' +
'		<i class="ico_status {{=it.online ? "ico_status_online" : ""}}"></i>' +
'{{}}}' +
'	&nbsp;{{=it.unreadHtml}}' +
'</li>',
		
		// 未读个数
		unread: 
'{{if (it.unread) {}}' +
'<b class="kxChatNewMsgNum" data-sigil="listUnread">{{=it.unread}}</b>' +
'{{}}}',
		// 没有好友时的替换内容
		empty:
'<div class="kxChatUserList_empty">' +
'	<p class="tac">你在开心网还没有好友，快去加好友吧</p>' +
'	<p class="tac mt10"><span class="kxbtn kxbtn_gray_s"><button class="normal"><em><span><b><i>加好友</i></b></span></em></button></span></p>' +
'</div>',
		
		// 设置面板
		setpanel:
'<div class="kxChatUserListControl_setSub" data-sigil="listSetPanel">' +
//'	<label for="kxChatMsgSound"><input type="checkbox" name="" id="kxChatMsgSound" class="checkbox" data-sigil="listSetSound" {{=it.forbidSound ? \'checked="checked"\' : \'\'}}/> 新消息提示音</label>' +
'	{{if (it.canSetDesktopNotify) {}}' +
'	<label for="kxChatDesktopNotify"><input type="checkbox" id="kxChatDesktopNotify" class="checkbox" data-sigil="listSetDesktopNotify" {{=it.isDesktopNotify ? \'checked="checked"\' : \'\'}}/> 桌面通知 <a href="/t/help_msg.html#q8" target="_blank">详情</a></label>' +
'	{{}}}' +
'	<label for="kxChatMsgPop"><input type="checkbox" id="kxChatMsgPop" class="checkbox" data-sigil="listSetAlert" {{=it.forbidAlert ? \'\' : \'checked="checked"\'}}/> 新消息弹框</label>' +
'</div>'
		
	};


	return List;

});
