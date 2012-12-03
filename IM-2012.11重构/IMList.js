// vim: filetype=javascript
/**
 * @fileoverview 
 *    ��������б�
      ��Ҫ������ģ�齻�������ݣ�ͨ��Controler������Ϣ������

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
		'title': '�����б�',
		'expand': false,
		'unread': 0, // �ܵ�δ����
		'groups': {}
	};

	/**
	 * �����б�
	 * @class List
	 * @singleton
	 */
	List = function (config) {
		// �ϲ�����
		$.extend(this, {
				'container': 'body',
				'statusInfo': {} // ��cookie������״̬��Ϣ
			}, config);
		
		// ����ģ��
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
	 * ��ʼ��ں���
	 * @method _init
	 * @private
	 */
	List.prototype._init = function () {
		// ��ʼ������
		this._initData();

		// ����Dom
		this._createListDom();

		// ע���¼�
		this._initEvents();

		// ��ӵ�ҳ��
		this._appendToDom();
	};
	
	List.prototype.getListData = function () {
		return ListData;
	};
	/**
	 * ��ʼ������
	 * @method _initData
	 * @private
	 */
	List.prototype._initData = function () {
		var listData = this.getListData(),
			groups = listData.groups,

			onlineUsers = [],
			friendUsers = [];
		// �������к��Ѻ����ߺ���
		$.each(Controler.getUsers(), function (uid, user) {
			if (!Controler.isMine(user.uid)) {
				friendUsers.push(user);
				if (user.online) {
					onlineUsers.push(user);
				}
			}
		});

		// �к���ʱ�ŷ��÷�������
		if (friendUsers.length) {
			$.extend(groups, {
				// �����ϵ��
				'recent':
				{
					id: K.uniqueId(),
					name: '�����ϵ��',
					expand: false,
					member: Controler.getRecentUsers(),
					type: 'recent',
					unread: 0,
					dom: null
				},
				// ���ߺ���
				'online':
				{
					id: K.uniqueId(),
					name: '���ߺ���',
					expand: false,
					member: onlineUsers,
					type: 'online', // ֻ�����ߺ��ѲŴ�����
					unread: 0,
					dom: null // ���ֶ�ʵ�ʷ���dom���������
				},
				// ȫ������
				'all':
				{
					id: K.uniqueId(),
					name: 'ȫ������',
					expand: false,
					member: friendUsers,
					type: 'all',
					unread: 0,
					dom: null
				},
				// Ⱥ��
				'group':
				{
					id: K.uniqueId(),
					name: 'Ⱥ��',
					expand: false,
					member: K.toArray(Controler.getGroups()),
					type: 'group',
					unread: 0,
					dom: null
				},
				// Ȧ��
				'circle':
				{
					id: K.uniqueId(),
					name: 'Ȧ��',
					expand: false,
					member: K.toArray(Controler.getCircles()),
					type: 'circle',
					unread: 0,
					dom: null
				}
			});
			// �����ϵ�ˡ����ߺ��Ѵ���5��ʱĬ��չ��
			groups.recent.member.length > 5 ? groups.recent.expand = true : void 0;
			groups.online.member.length > 5 ? groups.online.expand = true : void 0;
			// Ȧ�ӡ�Ⱥ�ĳ�Ա����2ʱĬ��չ��
			groups.group.member.length > 2 ? groups.group.expand = true : void 0;
			groups.circle.member.length > 2 ? groups.circle.expand = true : void 0;
			// �ϲ�״̬����
			$.extend(true, listData, this.statusInfo);
			// ȫ������ Ĭ�ϲ���
			groups.all.expand = false;

			// ������ȡ�ܵ�δ����
			// Ϊ�Ż�����unread�б���
			// �����ߣ� online��all��group��circle��recent��������
			$.each(Controler.getAllUnread(), function (id, unreadInfo) {
				var length = unreadInfo.length || 0;
				// ����
				if (id >> 0) {
					groups.all.unread += length;
					if (Controler.getUser(id).online) {
						groups.online.unread += length;
					}
				}
				// ��
				else {
					groups[id.slice(-1) === 'T' ? 'group' : 'circle'].unread += length;
				}
				listData.unread += length;
			});
			// �������ϵ�ˡ��赥������
			$.each(groups.recent.member, function (i, user) {
				groups.recent.unread += Controler.getUnread(user.uid).length || 0;
			});
		}
	};

	/**
	 * ����list����
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

		// ���ߡ�������δ����Ϣ����
		if (K.isEmpty(groups)) {
			opts.onlineNumber = opts.totalNumber = 0;
			opts.unreadHtml = '';
		}
		else {
			$.extend(opts, {
				'onlineNumber': groups.online.member.length,
				'totalNumber': groups.all.member.length,
				'unreadHtml': this.getUnreadHtml(data.unread) // ��������ListData.unread��
			});
		}
		
		list = $(this.template.list(opts));
		this.sigil('root', list, true);

		// ���κκ�����ʾ
		if (K.isEmpty(groups)) {
			this.sigil('listWrap')
				.append(this.template.empty({}));
		}
		// �з�������ʱ
		else {
			$.each(groups, $.proxy(function (type, group) {
				group.dom = this.addGroup(group);
			}, this));
		}

		return list;
	};

	/**
	 * ��ʼ��List�����¼�
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

		// ���ڵ����¼�
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
	 * ��������ִ�г�ʼ��������֮��list��ӵ�ҳ����
	 * @method _appendToDom
	 * @private
	 */
	List.prototype._appendToDom = function () {

		// չ��״̬�ж�
		// Manage
		// ���ݴ�������
		this.resizeList();
		

		// �ӵ�ҳ��
		this.getListDom().appendTo(this.container);
	};

	// �¼��������漰���������¼�����
	// toggle ����list����
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
		
		// ֪ͨlist expand״̬�ı�
		Controler.fire(List.Events.ListExpandChanged);

		evt.preventDefault();
	};
	// toggle �������
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
				.hide(); // Ĭ�ϲ���ʾ
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
		// ���͵�������
		$.post('/chat/updatenotice.php', {
				'action': 'setstnotice',
				'stnotice': isForbid ? 1 : 0
			});
	};
	// ������������
	List.prototype._eSetDesktopNotify = function (evt) {
		var target = $(evt.currentTarget),
			isChecked = target.is(':checked'),
			dnotify = Controler.DesktopNotify,
			tip = '�����������ù����\n\n�뵽�����á�-����˽���á�-���������á�-��֪ͨ��-��������������������ø���ܡ�';

		dnotify.requestPermission(function () {
			if (dnotify.isPermission()) {
				if (!isChecked) {
					target.attr('checked', 'checked');
					alert('�޷�ȡ������֪ͨ' + tip);
				}
			} 
			else {
				if (isChecked) {
					target.removeAttr('checked');
					if (dnotify.getPermission() === 2) {
						alert('�޷���������֪ͨ' + tip);
					}
				}
			}
		});
	};
	// toggle һ������
	List.prototype._eToggleGroup = function (evt) {
		var target = $(evt.currentTarget),
			parentDom = target.parent(),	
			wrap = target.next(), // ʢ�ŷ����Ա��wrap
			expandClass = 'kxChatUserListGroup_active',

			listData = this.getListData(),
			groupData = listData.groups[target.data('grouptype')],
			expand = wrap.css('display') !== 'none';

		// ɾ��unread
		target.find(this.selector('listUnread')).remove();
		if (expand) {
			wrap.hide();
			parentDom.removeClass(expandClass);
			 // δ����Ϣ��ʾ
			target.append(this.getUnreadHtml(groupData.unread));
		}
		else {
			// ��ʼδչ����û���б�����
			if (!wrap.children().length) {
				this.addItem(groupData.member, wrap);
			}
			parentDom.addClass(expandClass);
			wrap.show();
		}
		groupData.expand = !expand;
		// ֪ͨgroup״̬�ı�
		Controler.fire(List.Events.GroupExpandChanged, {'id': target.data('id')});

		evt.preventDefault();
	};
	// ���һ����Ա
	List.prototype._eClickItem = function (evt) {
		var id = $(evt.currentTarget).data('itemid');
		Controler.fire(List.Events.ClickItem, {'id': id});
		evt.preventDefault();
	};
	List.prototype._eHoverItem = function (evt) {
		$(evt.currentTarget).toggleClass('hover');
	};
	// ����
	List.prototype._eFocusSearch = function (evt) {
		if (!this._resistedSuggest) {
			this._resistedSuggest = new Suggest({
				'inputDom': this.sigil('listSearchInput'),
				'clearDom': this.sigil('listSearchDel'),
				'suggestWrap': this.sigil('listBuddy'),
				'isReplaceSuggestWrap': true,
				'isReverse': true
			});
			// ѡ��һ��������ˣ�Ҳ������Ȧ��
			this._resistedSuggest.on(Suggest.Events.SelectedItem, function (data) {
				K.log('list ����ѡ����һ��id��' + (data.uid || data.gid));
				var uid = data.uid,
					gid = data.gid,
					info;
				// �������
				if (uid) {
					info = Controler.getUser(uid);
					if (!info) {
						Controler.addUser(data);
					}
				}
				else if (gid) {
					K.log('�� suggest �д�һ��Ȧ��', data);
				}

				Controler.fire(List.Events.ClickItem, {'id': uid || gid || 0});
			});
		}
	};

	/**
	 * ��������״̬�ı�(online/offline)ʱ���������dom
	 *   - ��ɾ�����ߺ��ѡ������еĳ�Ա
	 *   - �޸ġ����ߺ��ѡ������ϵ���Ŀ & �������list�ϵ���Ŀ
	 *   - �޸����з����а���״̬�޸��û���online״̬
	 * @method updateWhenOnlineChange 
	 * @param {Array} users online״̬�ı�ĺ�������
	 */
	List.prototype.updateWhenOnlineChange = function (users) {
		var me = this,
			buddy = this.sigil('listBuddy'),
			// ���ߺ��� �ڵ�
			onlineGroupTitle = buddy.find(this.selector('listBuddyGroup') + '[data-grouptype=online]'),
			onlineGroupWrap = onlineGroupTitle.next(),
			onlineGroupNumber = onlineGroupTitle.find(this.selector('listGroupMemberNumber')),

			diffOnline = 0,
			selectors = [],
			userMap = {},
			listMinNumber;
		
		// �ı䡰���ߺ��ѡ��еĳ�Ա������
		K.forEach(users, function (u, i) {
			var s = me.selector('listBuddyItem') + '[data-itemid=' + u.uid + ']';
			if (u.online) { // ������
				diffOnline += 1;
				me.addItem(u, onlineGroupWrap);
			}
			else { // ������
				diffOnline -= 1;
				onlineGroupWrap.find(s).remove();
			}
			selectors.push(s);
			userMap[u.uid] = Controler.getUser(u.uid);
		});
		onlineGroupNumber.text(onlineGroupNumber.text() - 0 + diffOnline);

		// �ı����������е�����״̬
		if (selectors.length) {
			buddy.find(selectors.join(',')).each(function (i, itemDom) {
				itemDom = $(itemDom);
				itemDom.replaceWith(me.getItemHtml(userMap[itemDom.data('itemid')]));
			});
		}

		// minʱ��list�ϵ���ʾ
		listMinNumber = this.sigil('listMin').find(this.selector('listMinOnlineNumber'));
		listMinNumber.text(listMinNumber.text() - 0 + diffOnline);
	};


	/**
	 * ��ȡlist�ڵ�
	 * @method getListDom
	 * @return {jQuery Dom} list
	 */
	List.prototype.getListDom = function () {
		return this.sigil('root');
	};

	/**
	 * ���һ���飬���������ơ����Ա�б�
	 * @method addGroup
	 * @param {Object} groupData һ�����������
	 * @return {jQuery Dom} groupDom 
	 */
	List.prototype.addGroup = function (groupData) {
		var member = groupData.member || [],
			groupDom = $(this.template.group(
					$.extend({
						'number': member.length,
						// չ��ʱ������Ҫgroup�����ϵ�δ����
						'unreadHtml': groupData.expand ? '' : this.getUnreadHtml(groupData.unread)
					}, groupData)
				));
		
		// ��Ҫչ���ŷ��ýڵ�
		if (groupData.expand) {
			this.addItem(member, groupDom.find(this.selector('listBuddyItemWrap')));
		}

		groupDom.appendTo(this.sigil('listBuddy'));

		return groupDom;
	};

	/**
	 * ��ӳ�Ա��
	 * @method addItem
	 * @param {Object} member ��Ա����Ϣ
	 * @param {jQuery Dom} itemWrap ����ʢ��һ���Ա������
	 * @return
	 */
	List.prototype.addItem = function (member, itemWrap) {
		member = K.isArray(member) ? member : [member];

		$.each(member, $.proxy(function (index, item) {
			itemWrap.append(this.getItemHtml(item));
		}, this));
	};
	/**
	 * ɾ����Ա��
	 * @method removeItem
	 * @param {String|Number} id ��Ա���idֵ
	 */
	List.prototype.removeItem = function (id) {
		var itemDom = this.sigil('listBuddy')
				.find(this.selector('listBuddyItem') + '[data-itemid=' + id + ']'),
			groupTitle;

		if (itemDom.length) { 
			groupTitle = itemDom.parent().prev();
			// �޸ı��������
			groupTitle.text(groupTitle.text().replace(
					/(\d+)(\)\s*)$/g,
					function (w, a, b) {return (a - 1) + b;}
				));
			// �Ƴ�
			itemDom.remove();
		}
	};
	/**
	 * �����Ա���ǰ�棩
	 * @method insertItem
	 * @param {Object} info Ҫ����ĳ�Ա��Ϣ
	 * @param {String} groupType Ҫ�����������
	 */
	List.prototype.insertItem = function (info, groupType) {
		var groupTitle = this.sigil('listBuddy')
				.find(this.selector('listBuddyGroup') + '[data-grouptype=' + groupType + ']'),
			groupWrap,
			groupData;

		if (groupTitle.length) { 
			groupWrap = groupTitle.next();
			// �޸ı��������
			groupTitle.text(groupTitle.text().replace(
					/(\d+)(\)\s*)$/g,
					function (w, a, b) {return (a - 0 + 1) + b;}
				));
			// ����
			if (!groupWrap.children().length) { // δ����item
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
	 * �õ�һ�����Ա��html
	 * @method getItemHtml
	 * @param {Object} info item�����һЩ��Ϣ
	 * @return {String} item��html�ַ���
	 */
	List.prototype.getItemHtml = function (info) {
		// ��ȡδ����
		var unread = Controler.getUnread(info.id || info.gid || info.uid).length || 0;
		if (info.logo) {
			// �滻ͷ��Ϊ50px�ĳߴ�
			info.logo = info.logo.replace(/(?:\d+)(_\d+_\d+\.\w+)$/, '50$1');
		}
		return this.template.item($.extend({
					'unreadHtml': this.getUnreadHtml(unread)
				}, info));
	};
	/**
	 * ��ȡδ����html
	 */
	List.prototype.getUnreadHtml = function (n) {
		return this.template.unread({'unread': n || 0});
	};

	/**
	 * ����list���ڣ�����λ�á��߶ȱ仯
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
	 * ����δ����Ϣ
	 * @param {String || Number} id itemid
	 * @param {Number} diff δ�����仯��
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

		// �����Ѿ��ŵ��б��е�dom
		if (itemDom.length) {
			itemDom.find(this.selector('listUnread')).remove();
			itemDom.append(this.getUnreadHtml(unread));
		}
		// ���ҷ������Ƿ�����仯Ԫ��
		// �������������·��������
		$.each(listData.groups, function (type, group) {
			var item;
			// ����
			if (id >> 0 && type !== 'group' && type !== 'circle') {
				item = K.detect(group.member, function (o) {
					return o.uid == id;
				});
			} 
			// ��
			else if (!(id >> 0) && (type === 'group' || type === 'circle')) {
				item = K.detect(group.member, function (o) {
					return o.gid == id;
				});
			} 

			// �÷�������仯��
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
		// �����ܵĸ���
		listData.unread += diff;
		this.sigil('listMin')
			.find(this.selector('listUnread')).remove()
			.end()
			.append(this.getUnreadHtml(listData.unread));
	};

	/**
	 * �õ�selector
	 * �����������õ���[data-sigil=...]��ʽ
	 *
	 * @method selector
	 * @private
	 * @param {String} sigil ��������
	 * @return {String} ��ϳɵ�ѡ���
	 */
	List.prototype.selector = function (sigil) {
		return '[data-sigil=' + sigil + ']';
	};
	/**
	 * ��ȡdata-sigil��ʽ�Ķ���
	 *
	 *   - ��ȡ����������
	 *   - һ�����ھͲ�����ȥ����
	 *   - �����趨ĳ��ֵ
	 *
	 * @method sigil
	 * @private
	 * @param {String} sigil Ҫ���ʵ�Ԫ��sigilֵ
	 * @param {jQuery Dom} context ����Ԫ�أ��ӿ�����ٶ� 
	 * @param {Boolean} isExecSet �Ƿ�ִ�и�ֵ����
	 * @return {jQuery Dom} returnDom
	 */
	List.prototype.sigil = function (sigil, context, isExecSet) {
		var dom = this._dom || (this._dom = {}),
			root, returnDom;
		
		// ִ�и�ֵ�洢����
		if (isExecSet) {
			returnDom = dom[sigil] = context;
		}
		else {
			dom.root ? void 0 : dom.root = $('body');
			root = dom.root; // ���ø�Ԫ��
			// ����Ԫ��
			if (sigil && K.isString(sigil)) {
				returnDom = dom[sigil];
				// û�л���ģ������²��ң�������
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
	 * ��ȡList�ĵ�һʵ��
	 * @static
	 * @method getInstance
	 * @param {Object} config ������Ϣ
	 * @return {List} list���ڶ���
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
		// �����б���HTML
		list: 
'<div class="kxChatUserListMain">' +
'	<div class="kxChatUserList" data-sigil="listPanel" {{=it.expand ? \'\' : \'style="display:none;"\'}}>' +
		// �б�ͷ��
'		<div class="kxChatUserListHeader" data-sigil="listTitle">' +
'			<i class="kxChatIcon kxChatIcon_listHeader"></i> <b>{{=it.title}}</b>' +
'		</div>' +
		// �û��б�
'		<div class="kxChatUserListBd kx_scrollAble" data-sigil="listWrap">' +
			// �����û��б�
'			<div class="kxChatUserList_AllUser" data-sigil="listBuddy"></div>' +
'		</div>' +
		// �б����������ã����� ������
'		<div class="clearfix kxChatUserListFunc">' +
'			<div class="kxChatUserListSearch">' +
'				<input type="text" placeholder="֧������ĸ����" data-sigil="listSearchInput"/>' +
'				<b data-sigil="listSearchDel" title="���"></b>' +
'			</div>' +
'			<div class="kxChatUserListControl">' +
'				<div class="kxChatUserListControl_hide">' +
'					<a href="#" class="kxChatUserListControl_btn" data-sigil="listButtonExpand">����</a>' +
'				</div>' +
'				<div class="kxChatUserListControl_set" data-sigil="listButtonSetWrap">' +
'					<a href="#" class="kxChatUserListControl_btn" data-sigil="listButtonSet">����</a>' +
'				</div>' +
'			</div>' +
'		</div>' +
'	</div>' +
	// �б���
'	<div class="kxChatUserListToggle" data-sigil="listMin">' +
'		<i class="kxChatIcon kxChatIcon_icon"></i> <span class="zoom">���� (<span data-sigil="listMinOnlineNumber">{{=it.onlineNumber || 0}}</span>/{{=it.totalNumber || 0}})</span> {{=it.unreadHtml}}' +
'	</div>' +
'</div>',

		// �����б����HTML
		group: 
// һ���б��� չ�������� 'kxChatUserListGroup_active'
'<div class="kxChatUserListGroup{{=it.expand ? " kxChatUserListGroup_active" : ""}}">' +
'	<h3 data-sigil="listBuddyGroup" data-groupid="{{=it.id}}" data-grouptype="{{=it.type}}">{{=it.name}}(<span data-sigil="listGroupMemberNumber">{{=it.number||0}}</span>) {{=it.unreadHtml}}</h3>' +
	// ���������
'	<ul class="kxChatUserListItem" data-sigil="listBuddyItemWrap"></ul>' +
'</div>',

		// �����б���HTML
		item:
'<li data-sigil="listBuddyItem" ' +
// Ⱥ�Ļ�Ȧ��
'{{if (it.gid) {}}' +
'	data-itemid="{{=it.gid}}">' +
	// Ⱥ��
'	{{if (it.gid.slice(-1) === \'T\') {}}' +
'		<a href="#" class="kxAvatar_32 kxAvatar_group" title="{{=it.ginfo.name}} ��{{=it.ginfo.member}}��"></a><a href="#" title="{{=it.ginfo.name}} ��{{=it.ginfo.member}}��">{{=K.subByte(it.ginfo.name, 20, \'...��\')+it.ginfo.member+\'��\'}}</a>' +
	// Ȧ��
'	{{} else {}}' +
'		<a href="/rgroup/index.php?gid={{=it.gid.slice(0, -1)}}" class="kxAvatar_32 kxAvatar_circle" title="{{=it.ginfo.name}}"></a><a href="/rgroup/index.php?gid={{=it.gid.slice(0, -1)}}" title="{{=it.ginfo.name}}">{{=K.subByte(it.ginfo.name, 20, "...")}}</a>' +
'	{{}}}' +
// ����
'{{} else {}}' +
'	data-itemid="{{=it.uid}}">' +
'		<a href="/home/{{=it.uid}}.html" class="kxAvatar_32"><img src="{{=it.logo}}" alt=""/></a><a href="/home/{{=it.uid}}.html" title="{{=it.real_name}}">{{=K.subByte(it.real_name, 18, "...")}}</a>' +
'		<i class="ico_status {{=it.online ? "ico_status_online" : ""}}"></i>' +
'{{}}}' +
'	&nbsp;{{=it.unreadHtml}}' +
'</li>',
		
		// δ������
		unread: 
'{{if (it.unread) {}}' +
'<b class="kxChatNewMsgNum" data-sigil="listUnread">{{=it.unread}}</b>' +
'{{}}}',
		// û�к���ʱ���滻����
		empty:
'<div class="kxChatUserList_empty">' +
'	<p class="tac">���ڿ�������û�к��ѣ���ȥ�Ӻ��Ѱ�</p>' +
'	<p class="tac mt10"><span class="kxbtn kxbtn_gray_s"><button class="normal"><em><span><b><i>�Ӻ���</i></b></span></em></button></span></p>' +
'</div>',
		
		// �������
		setpanel:
'<div class="kxChatUserListControl_setSub" data-sigil="listSetPanel">' +
//'	<label for="kxChatMsgSound"><input type="checkbox" name="" id="kxChatMsgSound" class="checkbox" data-sigil="listSetSound" {{=it.forbidSound ? \'checked="checked"\' : \'\'}}/> ����Ϣ��ʾ��</label>' +
'	{{if (it.canSetDesktopNotify) {}}' +
'	<label for="kxChatDesktopNotify"><input type="checkbox" id="kxChatDesktopNotify" class="checkbox" data-sigil="listSetDesktopNotify" {{=it.isDesktopNotify ? \'checked="checked"\' : \'\'}}/> ����֪ͨ <a href="/t/help_msg.html#q8" target="_blank">����</a></label>' +
'	{{}}}' +
'	<label for="kxChatMsgPop"><input type="checkbox" id="kxChatMsgPop" class="checkbox" data-sigil="listSetAlert" {{=it.forbidAlert ? \'\' : \'checked="checked"\'}}/> ����Ϣ����</label>' +
'</div>'
		
	};


	return List;

});
