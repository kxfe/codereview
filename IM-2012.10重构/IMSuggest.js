// vim: filetype=javascript
/**
 * @fileoverview 
 *    聊天搜索好友 和 加好友
 		
 * 文件组成：
 	 - BaseSuggest      完成基本的搜索suggest功能，是下面两个的父类
	 				    会fire三种事件：请求空串、suggest结果放置完成、选中一个项
	 - SimpleSuggest    IM List 列表下面的搜索框
	 				    继承BaseSuggest，处理三种事件，并有自己的特别定制，与dom结合严密
						需要List关联内容变化时，发出事件
	 - AddFriendSuggest IM 聊天窗口上的加人功能
	 				    继承BaseSuggest，处理三种事件，并有自己的特别定制，与dom结合严密
						需要聊天窗口关联内容变化时，发出事件

 * 模块返回
     该模块返回 SimpleSuggest 和 AddFriendSuggest 组合的对象
	 具体调用需要用到哪个在应用中选取

 * 示例
     参见 apps/im/IMList.js 和 apps/im/IMWindow.js 中的 `Suggest` 调用。
	 参数传递的对象属性要同时参考本模块中的子类和父类。

 * @author  linfei@corp.kaixin001.com
 * @date    2012/11/15
 *
 */
define('apps/im/IMSuggest', ['jQuery', 'doT'], function (require) {

	var $ = require('jQuery'),
		doT = require('doT'),
		
		BaseSuggest, SimpleSuggest, AddFriendSuggest,
		Template,
		Events = {
			// 请求空字符串
			'RequestNull': 'request_null_to_suggest',
			// 结果填入完成
			'DisplayedResult': 'after_display_result',
			// 选中一个选项
			'SelectedItem': 'after_selected_result_item'
		};
	

	// ================================BaseSuggest=================================
	/**
	 * 基本suggest类
	 * 
	 * 基本Dom节点：
	 *     - 输入框
	 *     - 列表面板
	 *     - 列表容器
	 *
	 * 功能：
	 *     - 支持反序排列
	 *     - 上下键、mouseover切换列表选项，回车、点击选择
	 *     - ajax请求保证上次的已经返回，并缓存不需要再请求的数据
	 *     - 选中后发出通知
	 *
	 * 注意点：
	 *     - 构建每个suggest项的html时，严重依赖固定结构，即it对象属性的定义是固定的
	 *     - 选中一个suggest项时，要取它的data-id值
	 *
	 * @class BaseSuggest
	 */
	BaseSuggest = function (config) {
		$.extend(this, {
			// 输入框
			'inputDom': '',
			// 结果列表容器
			'resultPanelDom': '',
			// 列表父级
			'resultListDom': '',

			// 每个suggest项的选择符
			'resultItemSelector': 'li',
			// 每个suggest项hover时的类
			'resultItemHoverClass': 'hover',
			// 每项的模板
			'resultItemTemplate': Template.resultItem || '',
			// 是否反序排列
			'isReverse': false,
			// ajax地址
			'postUrl': '/interface/suggestfriend.php',
			'postParam': {'pars': 'f1_f2_rs', 'from': 'im', 'text': ''}
		}, new K.Pubsub(), config);

		if (!this.inputDom || !this.resultPanelDom || !this.resultListDom) {
			throw new Error('IMSuggest 缺少所需的输入或展示节点');
		}

		// 变量防止上次未返回时再次执行suggest
		this._lockSuggestBeforeReceive = 'ready';
		// 缓存请求过的数据(key:请求时输入的文字，value:返回的数组对象)
		this._suggestedData = {};
		// 缓存请求过的对象信息（key:uid/gid, value: 对象引用）
		this._suggestedMap= {};

		if (K.isString(this.resultItemTemplate)) {
			this.resultItemTemplate = doT.template(this.resultItemTemplate);
		}
		this._init();
	};
	BaseSuggest.prototype._init = function () {
		// 确保dom是jQuery对象
		this.inputDom = $(this.inputDom);
		this.resultPanelDom = $(this.resultPanelDom);
		this.resultListDom = $(this.resultListDom);

		// 注册必要的事件
		this.inputDom
			// 内容改变开始请求新的suggest
			.bind('input.suggest', $.proxy(this._eInputChange, this)) // IE6/7/8不会触发
			.bind('propertychange.suggest', $.proxy(this._eInputChange, this)) // 所有IE都会触发
			// 上下选择键 & 回车选择键
			.bind('keydown.suggest', $.proxy(this._eInputKeydown, this));
		this.resultPanelDom
			// hover某一项
			.delegate(this.resultItemSelector, 'mouseenter.suggest', $.proxy(this._eResultItemHover, this))
			.delegate(this.resultItemSelector, 'mouseleave.suggest', $.proxy(this._eResultItemHover, this))
			// 点击某一项
			.delegate(this.resultItemSelector, 'click.suggest', $.proxy(this._eResultItemClick, this));
	}
	BaseSuggest.prototype._eInputChange = function (evt) {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
		// 延时加载
		this._timer = setTimeout($.proxy(this.doSuggestRequest, this), 10);
	};
	BaseSuggest.prototype._eInputKeydown = function (evt) {
		var key = evt.keyCode,
			hoverClass = this.resultItemHoverClass,
			listDom = this.resultListDom,
			cur, next;

		// 回车选择某一项
		if (key === 13) {
			this.selectResultItem(listDom.children('.' + hoverClass));
		}
		// 上下按键
		else if (key === 38 || key === 40) {
			cur = listDom.children('.' + hoverClass).removeClass(hoverClass);
			// up
			if (key === 38) {
				next = cur.is(':first-child') ?
						listDom.children(':last-child') :
						cur.prev();
			}
			// down
			else {
				next = cur.is(':last-child') ?
						listDom.children(':first-child') :
						cur.next();
			}
			next.addClass(hoverClass);
			evt.preventDefault();
		}

	};
	BaseSuggest.prototype._eResultItemHover = function (evt) {
		var cur = $(evt.currentTarget),
			hoverClass = this.resultItemHoverClass;

		if (evt.type === 'mouseenter') {
			if (!cur.hasClass(hoverClass)) {
				this.resultListDom
					.children('.' + hoverClass)
					.removeClass(hoverClass);
				cur.addClass(hoverClass);
			}
		}
	};
	BaseSuggest.prototype._eResultItemClick= function (evt) {
		this.selectResultItem($(evt.currentTarget));
		evt.preventDefault();
	};
	/**
	 * 获取input中的值
	 * @method getInputValue
	 * @return {String} input中的value值
	 */
	BaseSuggest.prototype.getInputValue = function () {
		return $.trim(this.inputDom.val());
	};
	/**
	 * 设置input中的值
	 * @method setInputValue
	 * @return {jQuery} inputDom 输入框
	 */
	BaseSuggest.prototype.setInputValue = function (s) {
		return this.inputDom.val(s);
	};
	/**
	 * 执行请求新的suggest数据
	 *   - 会将请求结果缓存，以供下次同样的值使用
	 *   - 只有一次请求完成后才会开始下一次请求
	 * @method doSuggestRequest
	 */
	BaseSuggest.prototype.doSuggestRequest = function () {
		var value, storedData;
		// 在上次请求结束前不再请求
		if (this._lockSuggestBeforeReceive !== 'ready') {
			this._lockSuggestBeforeReceive = 'recall'; // 标记需要再次请求
			return;
		}

		value = this.getInputValue();
		if (value) {
			// 已经缓存过数据，则用原来的数据
			storedData = this._suggestedData[value];
			if (storedData) {
				this.dealSuggestData(storedData);
			}
			// 否则请求新的数据
			else {
				this._lockSuggestBeforeReceive = 'requesting'; // 标记正在请求
				$.when($.post(this.postUrl, $.extend(this.postParam, {'text': value})))
				.done($.proxy(function (data) {
						data = (K.isString(data) ? $.parseJSON(data) : data) || [];
						// 缓存数据
						this._suggestedData[value] = this.isReverse ? data.reverse() : data;
						// 处理数据
						this.dealSuggestData(data);
					}, this))
				.then($.proxy(function () {
						// 再次请求
						if (this._lockSuggestBeforeReceive === 'recall') {
							this._lockSuggestBeforeReceive = 'ready';
							this.doSuggestRequest();
						}
						// 不再请求
						else {
							this._lockSuggestBeforeReceive = 'ready';
						}
					}, this));
			} // storedData end if
		}
		// 搜索空值
		else {
			this.fire(Events.RequestNull);
		}
	};
	/**
	 * 处理suggest数据
	 * @method dealSuggestData
	 * @param {Array} data 待处理的数据
	 */
	BaseSuggest.prototype.dealSuggestData = function (data) {
		var result = [],
			// 默认第一项的下标
			opts = {
				'hoverClass': this.resultItemHoverClass,
				'start': this.isReverse ? data.length - 1 : 0
			};

		$.each(data, $.proxy(function (i, item) {
			// 存储到map中
			this._suggestedMap[item.uid || item.gid] = item;
			opts.index = i;
			// 人
			if (item.uid) {
				$.extend(opts, {
					'uid':    item.uid,
					'name':   item.real_name,
					'logo':   item.icon20,
					'online': item.online ? 'online' : 'offline'
				});
			}
			// 圈子
			else if (item.gid) {
				$.extend(opts, {
					'gid':   item.gid,
					'name':  item.name
				});
			}
			result.push(this.resultItemTemplate(opts));
		}, this));

		this.resultListDom.html(result.join(''));
		
		// 结果处理完成
		this.fire(Events.DisplayedResult, {'resultData': data});
	};
	/**
	 * 选中某一项
	 * @method selectResultItem
	 * @param {jQueryDom} resultItemDom 被选中的suggest项jquery对象
	 */
	BaseSuggest.prototype.selectResultItem = function (resultItemDom) {
		if (resultItemDom.length) {
			// 选中一个后
			this.fire(Events.SelectedItem, this._suggestedMap[resultItemDom.data('id')]);
		}
	};



	// ================================SmipleSuggest=================================
	/**
	 * @class
	 * @extend BaseSuggest
	 */
	SimpleSuggest = K.extend(function (config) {
		var panelDom = $(Template.resultWrap);
		config = $.extend({
			'resultPanelDom': panelDom,
			'resultListDom': panelDom.find('[data-sigil="resultList"]'),
			'clearDom': '', // 清空输入按钮 (optional)
			'suggestWrap': '', // 建议列表容器 (required)
			'isReplaceSuggestWrap': false, // 是清空容器再显示，还是直接添加
			'resultItemTemplate': doT.template(Template.resultItem),
			'postParam': {'pars': 'f1_f2_rs', 'from': 'im'}
		}, config);

		SimpleSuggest.$super.call(this, config);
		
		// 放置dom
		this._initDom();
		// 注册事件
		this._initEvents();
	}, BaseSuggest);

	SimpleSuggest.prototype._initDom = function () {
		// 非BaseSuggest dom元素初始化
		this.clearDom = $(this.clearDom);
		this.suggestWrap = $(this.suggestWrap);
		this.resultEmptyDom = $(Template.resultEmpty);

		// 加载到wrap中
		this.suggestWrap
			.append(this.resultPanelDom.hide())
			.append(this.resultEmptyDom.hide());
	};
	SimpleSuggest.prototype._initEvents = function () {
		// dom事件注册
		// 空内容上的处理
		this.resultEmptyDom
			.delegate('[data-sigil="emptyButtonCancel"],[data-sigil="emptyButtonConfirm"]',
						'click',
						$.proxy(this._eClickEmptyButton, this));
		// input内容变化时，改变clear按钮状态
		this.inputDom
			.bind('input', $.proxy(this._eToggleClear, this))
			.bind('propertychange', $.proxy(this._eToggleClear, this));
		// 点击清除按钮
		this.clearDom
			.bind('click', $.proxy(this._eClickClear, this));

		// 监控fire事件
		this.on(Events.RequestNull, $.proxy(this._onRequestNull, this));
		this.on(Events.DisplayedResult, $.proxy(this._onDisplayedResult, this));
		this.on(Events.SelectedItem, $.proxy(this._onSelectedItem, this));
	};
	// 点击空白提示上的按钮
	SimpleSuggest.prototype._eClickEmptyButton = function (evt) {
		var target = $(evt.currentTarget),
			value = this.getInputValue();
		// confirm 查找好友
		if (target.attr('data-sigil') === 'emptyButtonConfirm') {
			// 顶部搜索
			$('#headsearchuser').val(value).focus();
		}
		// 清空，并替换
		this.setInputValue('');
		this.doSuggestRequest();
		evt.preventDefault();
	};
	// 改变clear按钮状态
	SimpleSuggest.prototype._eToggleClear = function () {
		if (this.getInputValue()) {
			this.clearDom.show();
		}
		else {
			this.clearDom.hide();
		}
	};
	// 点击clear，清除内容
	SimpleSuggest.prototype._eClickClear = function (evt) {
		this.clearDom.hide();
		this.setInputValue('');
		this.doSuggestRequest();
		this.inputDom.focus();
		evt.preventDefault();
	};
	// 请求一个空的内容
	SimpleSuggest.prototype._onRequestNull = function () {
		// 回退
		this.resultPanelDom.hide();
		this.resultListDom.html(''); // 清空
		this.resultEmptyDom.hide();
		if (this._replacedDom) {
			this._replacedDom.show();
			this._replacedDom = void 0; // 本次suggest结束
		}
	};
	// suggest数据放置到列表面板后
	SimpleSuggest.prototype._onDisplayedResult = function (data) {
		// 只在第一次记录将要隐藏的元素
		if (this.isReplaceSuggestWrap && !this._replacedDom) {
			this._replacedDom = this.suggestWrap.children(':visible').hide();
		}
		// 有数据
		if (data.resultData.length) {
			this.resultPanelDom.show();
			this.resultEmptyDom.hide();
		}
		// 空
		else {
			this.resultPanelDom.hide();
			this.resultEmptyDom.show();
		}
	};
	// 选中某个元素
	SimpleSuggest.prototype._onSelectedItem = function (data) {
		K.log('SmipleSuggest-selectedItem: ', data);
		// 重置恢复到原始搜索前
		this.setInputValue('');
		this._onRequestNull();
		this.inputDom.blur();
	};


	// ================================AddFriendSuggest=================================
	AddFriendSuggest = K.extend(function (config) {
		this._initDom();
		config = $.extend({
			'tipEmpty': '你想邀请谁加入对话',
			'tipNotFound': '姓名不在好友列表，请重新输入',
			// 输入框
			'inputDom': this.inputDom,
			// 结果列表容器
			'resultPanelDom': this.resultListDom,
			// 列表父级
			'resultListDom': this.resultListDom,
			// 每项的模板
			'resultItemTemplate': Template.friendSuggestItem || '',
			// 最大高度限定
			'maxHeight': 80,
			// 是否反序排列
			'isReverse': true,
			'postParam': {'pars': 'gf_rs_rc_ri', 'maxnum': 0}
		}, config);
		AddFriendSuggest.$super.call(this, config);
		
		this.tip.html(this.tipEmpty);
		this.selectedResultDom.css('max-height', this.maxHeight);

		// 被加入的人的信息Map
		this._addedMap = {};

		this._initEvents();
	}, BaseSuggest);

	AddFriendSuggest.Events = {
		'AddFriendComplete': 'after_complete_add_friend',
		'CloseAddFriendPanel': 'after_close_friend_panel'
	};
	/**
	 * 初始化dom节点
	 * @method _initDom
	 * @private
	 */
	AddFriendSuggest.prototype._initDom = function () {
		this.panel = $(Template.friendPanel).hide();
		this.inputDom = this.panel.find('[data-sigil="friendInput"]');
		this.tip = this.panel.find('[data-sigil="friendTip"]');
		this.resultListDom = this.panel.find('[data-sigil="friendResultList"]').hide();
		this.selectedResultDom = this.panel.find('[data-sigil="friendInputArea"]');

		// 选中的结构模板
		this.selectedItemTemplate = doT.template(Template.friendSelectedItem);
	};
	/**
	 * 初始化dom事件
	 * @method _initEvents
	 * @private
	 */
	AddFriendSuggest.prototype._initEvents = function () {
		this.panel
			// 确认/取消加人 
			.delegate('[data-sigil="friendAddConfirm"]', 'click', $.proxy(this._eAddConfirm, this))
			.delegate('[data-sigil="friendAddCancel"]', 'click', $.proxy(this._eAddCancel, this))
			// 删除一个候选者
			.delegate('[data-sigil="friendDelete"]', 'click', $.proxy(this._eDeleteOne, this))
			// 点击输入区，控制光标都在input中
			.delegate('[data-sigil="friendInputArea"]', 'click', $.proxy(this._eClickInputArea, this))
			// input 获得焦点时提示
			.delegate('[data-sigil="friendInput"]', 'focus', $.proxy(this._eFocusInput, this))
			// input 退格键删除一个候选项
			.delegate('[data-sigil="friendInput"]', 'keydown', $.proxy(this._eKeydownDelete, this));

		// 监控fire事件
		this.on(Events.RequestNull, $.proxy(this._onRequestNull, this));
		this.on(Events.DisplayedResult, $.proxy(this._onDisplayedResult, this));
		this.on(Events.SelectedItem, $.proxy(this._onAddOneFriend, this));
	};

	/**
	 * 事件处理函数
	 */
	// 加人确认完成
	AddFriendSuggest.prototype._eAddConfirm = function (evt) {
		var data = [];
		$.each(this._addedMap, function (uid, user) {
			data.push(user);
		});

		// 有数据时加人完成
		if (data.length) {
			this.fire(AddFriendSuggest.Events.AddFriendComplete, data)
		}
		this.closePanel();
		evt.preventDefault();
	};
	// 加人取消
	AddFriendSuggest.prototype._eAddCancel = function (evt) {
		this.closePanel();
		evt.preventDefault();
	};
	// 删除一个候选者
	AddFriendSuggest.prototype._eDeleteOne = function (evt) {
		this.deleteAddedOne($(evt.currentTarget).parent());
		evt.preventDefault();
	};
	// 点击输入区，控制光标
	AddFriendSuggest.prototype._eClickInputArea = function (evt) {
		this.inputDom.focus();
		evt.preventDefault();
	};
	// input focus 不存在值时提醒
	AddFriendSuggest.prototype._eFocusInput = function (evt) {
		if (this.getInputValue()) {
			this._eInputChange(evt);
		}
		else {
			this.resultListDom.hide();
			this.resultListDom.html('');
			this.tip.html(this.tipEmpty).show();
		}
	};
	// Input中退格键删除一项
	AddFriendSuggest.prototype._eKeydownDelete = function (evt) {
		var del;
		if (evt.keyCode === 8 && this.getInputValue().length === 0) {
			del = this.inputDom.parent().prev();
			if (del.attr('data-sigil') === 'friendSelected') {
				this.deleteAddedOne(del);
			}
		}
	};

	/**
	 * 添加一个候选者
	 * @method _onAddOneFriend
	 */
	AddFriendSuggest.prototype._onAddOneFriend = function (data) {
		var wrap = this.selectedResultDom;

		this.inputDom.parent().before(this.selectedItemTemplate({
			'uid': data.uid,
			'name': data.real_name
		}));
		// 缓存加入的信息
		this._addedMap[data.uid] = data;

		// 检查高度（只有ie6不支持max-height，这里需要设定高度，以便足够高后滚动）
		if (K.Browser.ie6) {
			if (wrap.height > this.maxHeight) {
				wrap.height(this.maxHeight);
			}
			else {
				wrap.height('auto');
			}
		}
		// 滚动到底部
		wrap.scrollTop(wrap.get(0).scrollHeight);
		// 重置input
		this.setInputValue('').focus();
	};
	// 空内容，提示tipEmpty
	AddFriendSuggest.prototype._onRequestNull = function () {
		this.tip.html(this.tipEmpty).show();
		this.resultListDom.hide();
		K.log('请求了一个空的内容');
	};
	AddFriendSuggest.prototype._onDisplayedResult = function (data) {
		if (data.resultData.length) {
			this.tip.hide();
			this.resultListDom.show();
		}
		// not found
		else {
			this.tip.html(this.tipNotFound).show();
			this.resultListDom.hide();
		}
		K.log('suggest结果放置完成', data);
	};
	/**
	 * 关闭 panel
	 * @method closePanel
	 */
	AddFriendSuggest.prototype.closePanel = function () {
		var wrap = this.selectedResultDom;

		this.panel.hide();
		// 清除上次的记录
		this._addedMap = {};
		this.setInputValue('');
		wrap.find('[data-sigil="friendSelected"]').remove();
		wrap.height('auto');

		this.fire(AddFriendSuggest.Events.CloseAddFriendPanel);
	};
	/**
	 * 删除一个加入的人
	 * @method deleteAddedOne
	 * @param {jQuery dom} dom 要删除的加人的节点
	 */
	AddFriendSuggest.prototype.deleteAddedOne = function (dom) {
		var uid = dom.data('uid') || 0;
		dom.remove();
		// 不再包含该id的元素
		if (!this.selectedResultDom.find('[data-sigil="friendSelected"][data-uid="' + uid + '"]').length) {
			delete this._addedMap[uid];
		}
	};
	/**
	 * 打开 panel
	 * @method openPanel 
	 */
	AddFriendSuggest.prototype.openPanel = function () {
		this.panel.show();
		this.inputDom.focus();
	};
	/**
	 * panel 是否打开
	 * @method isPanelOpen
	 */
	AddFriendSuggest.prototype.isPanelOpen = function () {
		return this.panel.is(':visible');
	};
	/**
	 * 得到 panel Dom 对象
	 * @method getPanel
	 */
	AddFriendSuggest.prototype.getPanel = function () {
		return this.panel;
	};






	Template = {
		// 结果容器
		'resultWrap':
'<div class="kxChatUserList_Result dn">' +
'	<ul class="kxChatUserListItem" data-sigil="resultList"></ul>' +
'</div>',
		// suggest项
		'resultItem':
'<li{{=it.index === it.start ? \' class="\' + it.hoverClass + \'"\' : \'\'}} data-id="{{=it.uid || it.gid}}">' +
// 好友
'{{if (it.uid) {}}' +
'	<a href="/home/{{=it.uid}}.html" class="kxAvatar_32"><img src="{{=it.logo}}" alt=""></a>' +
'	<a href="/home/{{=it.uid}}.html">{{=it.name}}</a>' +
'	<i class="ico_status ico_status_{{=it.online}}"></i>' +
// 圈子
'{{} else if (it.gid) {}}' +
'	<a href="/rgroup/index.php?gid={{=it.gid}}" class="kxAvatar_32 kxAvatar_circle"></a>' +
'	<a href="/rgroup/index.php?gid={{=it.gid}}">开心篮球俱乐部</a>' +
'{{}}}' +
'</li>',
		// 空结果提示
		'resultEmpty': 
'<div class="kxChatUserList_ResultEmpty">' +
'	<div class="kxChatUserList_empty">' +
'		<p class="tac">没有找到用户名，是否在全开心网搜索用户名？</p>' +
'		<p class="tac mt10"><span class="kxbtn kxbtn_gray_s" data-sigil="emptyButtonCancel"><button class="normal"><em><span><b><i>不，谢谢</i></b></span></em></button></span><span class="kxbtn kxbtn_gray_s ml10" data-sigil="emptyButtonConfirm"><button class="normal"><em><span><b><i>好的</i></b></span></em></button></span></p>' +
'	</div>' +
'</div>',

		// ==========================添加好友搜索======================
		// addFriendSuggest Panel
		'friendPanel': 
'<div class="clearfix kxChatUserSuggest">' +
'	<div class="kxSuggestUserFakerel">' +
'		<div class="kxChatTips kxChatTips_tip" data-sigil="friendTip"></div>' +
'		<ul class="userMatchedList kx_scrollAble" data-sigil="friendResultList"></ul>' +
'	</div>' +
'	<div class="clearfix kxSuggestUserToken kx_scrollAble" data-sigil="friendInputArea">' +
		// 本行位置插入选中的好友
'		<div class="userTakeBox"><input type="text" style="width:20px" data-sigil="friendInput"/></div>' +
'	</div>' +
'	<span class="kxChatUserSuggest_confirm" data-sigil="friendAddConfirm">' +
'		<input type="button" value="">' +
'	</span>' +
'	<span class="kxChatUserSuggest_cancel" data-sigil="friendAddCancel">' +
'		<input type="button" value="">' +
'	</span>' +
'</div>',
		// 选中后的展示
		'friendSelectedItem':
'<span class="userToken" data-sigil="friendSelected" data-uid="{{=it.uid}}">{{=it.name}}<a href="#" class="kxChatDel" data-sigil="friendDelete"></a></span>',
		// suggest 好友列表项
		'friendSuggestItem':
'<li{{=it.index === it.start ? \' class="\' + it.hoverClass + \'"\' : \'\'}} data-id="{{=it.uid}}">{{=it.name}} <span class="kxChatAvatar"><img src="{{=it.logo}}" alt=""/></span></li>'
	};

	SimpleSuggest.Events = Events;
	$.extend(AddFriendSuggest.Events, Events);

	return {'Simple': SimpleSuggest, 'AddFriend': AddFriendSuggest};
});
