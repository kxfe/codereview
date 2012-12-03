// vim: filetype=javascript
/**
 * @fileoverview 
 *    ������������ �� �Ӻ���
 		
 * �ļ���ɣ�
 	 - BaseSuggest      ��ɻ���������suggest���ܣ������������ĸ���
	 				    ��fire�����¼�������մ���suggest���������ɡ�ѡ��һ����
	 - SimpleSuggest    IM List �б������������
	 				    �̳�BaseSuggest�����������¼��������Լ����ر��ƣ���dom�������
						��ҪList�������ݱ仯ʱ�������¼�
	 - AddFriendSuggest IM ���촰���ϵļ��˹���
	 				    �̳�BaseSuggest�����������¼��������Լ����ر��ƣ���dom�������
						��Ҫ���촰�ڹ������ݱ仯ʱ�������¼�

 * ģ�鷵��
     ��ģ�鷵�� SimpleSuggest �� AddFriendSuggest ��ϵĶ���
	 ���������Ҫ�õ��ĸ���Ӧ����ѡȡ

 * ʾ��
     �μ� apps/im/IMList.js �� apps/im/IMWindow.js �е� `Suggest` ���á�
	 �������ݵĶ�������Ҫͬʱ�ο���ģ���е�����͸��ࡣ

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
			// ������ַ���
			'RequestNull': 'request_null_to_suggest',
			// ����������
			'DisplayedResult': 'after_display_result',
			// ѡ��һ��ѡ��
			'SelectedItem': 'after_selected_result_item'
		};
	

	// ================================BaseSuggest=================================
	/**
	 * ����suggest��
	 * 
	 * ����Dom�ڵ㣺
	 *     - �����
	 *     - �б����
	 *     - �б�����
	 *
	 * ���ܣ�
	 *     - ֧�ַ�������
	 *     - ���¼���mouseover�л��б�ѡ��س������ѡ��
	 *     - ajax����֤�ϴε��Ѿ����أ������治��Ҫ�����������
	 *     - ѡ�к󷢳�֪ͨ
	 *
	 * ע��㣺
	 *     - ����ÿ��suggest���htmlʱ�����������̶��ṹ����it�������ԵĶ����ǹ̶���
	 *     - ѡ��һ��suggest��ʱ��Ҫȡ����data-idֵ
	 *
	 * @class BaseSuggest
	 */
	BaseSuggest = function (config) {
		$.extend(this, {
			// �����
			'inputDom': '',
			// ����б�����
			'resultPanelDom': '',
			// �б���
			'resultListDom': '',

			// ÿ��suggest���ѡ���
			'resultItemSelector': 'li',
			// ÿ��suggest��hoverʱ����
			'resultItemHoverClass': 'hover',
			// ÿ���ģ��
			'resultItemTemplate': Template.resultItem || '',
			// �Ƿ�������
			'isReverse': false,
			// ajax��ַ
			'postUrl': '/interface/suggestfriend.php',
			'postParam': {'pars': 'f1_f2_rs', 'from': 'im', 'text': ''}
		}, new K.Pubsub(), config);

		if (!this.inputDom || !this.resultPanelDom || !this.resultListDom) {
			throw new Error('IMSuggest ȱ������������չʾ�ڵ�');
		}

		// ������ֹ�ϴ�δ����ʱ�ٴ�ִ��suggest
		this._lockSuggestBeforeReceive = 'ready';
		// ���������������(key:����ʱ��������֣�value:���ص��������)
		this._suggestedData = {};
		// ����������Ķ�����Ϣ��key:uid/gid, value: �������ã�
		this._suggestedMap= {};

		if (K.isString(this.resultItemTemplate)) {
			this.resultItemTemplate = doT.template(this.resultItemTemplate);
		}
		this._init();
	};
	BaseSuggest.prototype._init = function () {
		// ȷ��dom��jQuery����
		this.inputDom = $(this.inputDom);
		this.resultPanelDom = $(this.resultPanelDom);
		this.resultListDom = $(this.resultListDom);

		// ע���Ҫ���¼�
		this.inputDom
			// ���ݸı俪ʼ�����µ�suggest
			.bind('input.suggest', $.proxy(this._eInputChange, this)) // IE6/7/8���ᴥ��
			.bind('propertychange.suggest', $.proxy(this._eInputChange, this)) // ����IE���ᴥ��
			// ����ѡ��� & �س�ѡ���
			.bind('keydown.suggest', $.proxy(this._eInputKeydown, this));
		this.resultPanelDom
			// hoverĳһ��
			.delegate(this.resultItemSelector, 'mouseenter.suggest', $.proxy(this._eResultItemHover, this))
			.delegate(this.resultItemSelector, 'mouseleave.suggest', $.proxy(this._eResultItemHover, this))
			// ���ĳһ��
			.delegate(this.resultItemSelector, 'click.suggest', $.proxy(this._eResultItemClick, this));
	}
	BaseSuggest.prototype._eInputChange = function (evt) {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
		// ��ʱ����
		this._timer = setTimeout($.proxy(this.doSuggestRequest, this), 10);
	};
	BaseSuggest.prototype._eInputKeydown = function (evt) {
		var key = evt.keyCode,
			hoverClass = this.resultItemHoverClass,
			listDom = this.resultListDom,
			cur, next;

		// �س�ѡ��ĳһ��
		if (key === 13) {
			this.selectResultItem(listDom.children('.' + hoverClass));
		}
		// ���°���
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
	 * ��ȡinput�е�ֵ
	 * @method getInputValue
	 * @return {String} input�е�valueֵ
	 */
	BaseSuggest.prototype.getInputValue = function () {
		return $.trim(this.inputDom.val());
	};
	/**
	 * ����input�е�ֵ
	 * @method setInputValue
	 * @return {jQuery} inputDom �����
	 */
	BaseSuggest.prototype.setInputValue = function (s) {
		return this.inputDom.val(s);
	};
	/**
	 * ִ�������µ�suggest����
	 *   - �Ὣ���������棬�Թ��´�ͬ����ֵʹ��
	 *   - ֻ��һ��������ɺ�ŻῪʼ��һ������
	 * @method doSuggestRequest
	 */
	BaseSuggest.prototype.doSuggestRequest = function () {
		var value, storedData;
		// ���ϴ��������ǰ��������
		if (this._lockSuggestBeforeReceive !== 'ready') {
			this._lockSuggestBeforeReceive = 'recall'; // �����Ҫ�ٴ�����
			return;
		}

		value = this.getInputValue();
		if (value) {
			// �Ѿ���������ݣ�����ԭ��������
			storedData = this._suggestedData[value];
			if (storedData) {
				this.dealSuggestData(storedData);
			}
			// ���������µ�����
			else {
				this._lockSuggestBeforeReceive = 'requesting'; // �����������
				$.when($.post(this.postUrl, $.extend(this.postParam, {'text': value})))
				.done($.proxy(function (data) {
						data = (K.isString(data) ? $.parseJSON(data) : data) || [];
						// ��������
						this._suggestedData[value] = this.isReverse ? data.reverse() : data;
						// ��������
						this.dealSuggestData(data);
					}, this))
				.then($.proxy(function () {
						// �ٴ�����
						if (this._lockSuggestBeforeReceive === 'recall') {
							this._lockSuggestBeforeReceive = 'ready';
							this.doSuggestRequest();
						}
						// ��������
						else {
							this._lockSuggestBeforeReceive = 'ready';
						}
					}, this));
			} // storedData end if
		}
		// ������ֵ
		else {
			this.fire(Events.RequestNull);
		}
	};
	/**
	 * ����suggest����
	 * @method dealSuggestData
	 * @param {Array} data �����������
	 */
	BaseSuggest.prototype.dealSuggestData = function (data) {
		var result = [],
			// Ĭ�ϵ�һ����±�
			opts = {
				'hoverClass': this.resultItemHoverClass,
				'start': this.isReverse ? data.length - 1 : 0
			};

		$.each(data, $.proxy(function (i, item) {
			// �洢��map��
			this._suggestedMap[item.uid || item.gid] = item;
			opts.index = i;
			// ��
			if (item.uid) {
				$.extend(opts, {
					'uid':    item.uid,
					'name':   item.real_name,
					'logo':   item.icon20,
					'online': item.online ? 'online' : 'offline'
				});
			}
			// Ȧ��
			else if (item.gid) {
				$.extend(opts, {
					'gid':   item.gid,
					'name':  item.name
				});
			}
			result.push(this.resultItemTemplate(opts));
		}, this));

		this.resultListDom.html(result.join(''));
		
		// ����������
		this.fire(Events.DisplayedResult, {'resultData': data});
	};
	/**
	 * ѡ��ĳһ��
	 * @method selectResultItem
	 * @param {jQueryDom} resultItemDom ��ѡ�е�suggest��jquery����
	 */
	BaseSuggest.prototype.selectResultItem = function (resultItemDom) {
		if (resultItemDom.length) {
			// ѡ��һ����
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
			'clearDom': '', // ������밴ť (optional)
			'suggestWrap': '', // �����б����� (required)
			'isReplaceSuggestWrap': false, // �������������ʾ������ֱ�����
			'resultItemTemplate': doT.template(Template.resultItem),
			'postParam': {'pars': 'f1_f2_rs', 'from': 'im'}
		}, config);

		SimpleSuggest.$super.call(this, config);
		
		// ����dom
		this._initDom();
		// ע���¼�
		this._initEvents();
	}, BaseSuggest);

	SimpleSuggest.prototype._initDom = function () {
		// ��BaseSuggest domԪ�س�ʼ��
		this.clearDom = $(this.clearDom);
		this.suggestWrap = $(this.suggestWrap);
		this.resultEmptyDom = $(Template.resultEmpty);

		// ���ص�wrap��
		this.suggestWrap
			.append(this.resultPanelDom.hide())
			.append(this.resultEmptyDom.hide());
	};
	SimpleSuggest.prototype._initEvents = function () {
		// dom�¼�ע��
		// �������ϵĴ���
		this.resultEmptyDom
			.delegate('[data-sigil="emptyButtonCancel"],[data-sigil="emptyButtonConfirm"]',
						'click',
						$.proxy(this._eClickEmptyButton, this));
		// input���ݱ仯ʱ���ı�clear��ť״̬
		this.inputDom
			.bind('input', $.proxy(this._eToggleClear, this))
			.bind('propertychange', $.proxy(this._eToggleClear, this));
		// ��������ť
		this.clearDom
			.bind('click', $.proxy(this._eClickClear, this));

		// ���fire�¼�
		this.on(Events.RequestNull, $.proxy(this._onRequestNull, this));
		this.on(Events.DisplayedResult, $.proxy(this._onDisplayedResult, this));
		this.on(Events.SelectedItem, $.proxy(this._onSelectedItem, this));
	};
	// ����հ���ʾ�ϵİ�ť
	SimpleSuggest.prototype._eClickEmptyButton = function (evt) {
		var target = $(evt.currentTarget),
			value = this.getInputValue();
		// confirm ���Һ���
		if (target.attr('data-sigil') === 'emptyButtonConfirm') {
			// ��������
			$('#headsearchuser').val(value).focus();
		}
		// ��գ����滻
		this.setInputValue('');
		this.doSuggestRequest();
		evt.preventDefault();
	};
	// �ı�clear��ť״̬
	SimpleSuggest.prototype._eToggleClear = function () {
		if (this.getInputValue()) {
			this.clearDom.show();
		}
		else {
			this.clearDom.hide();
		}
	};
	// ���clear���������
	SimpleSuggest.prototype._eClickClear = function (evt) {
		this.clearDom.hide();
		this.setInputValue('');
		this.doSuggestRequest();
		this.inputDom.focus();
		evt.preventDefault();
	};
	// ����һ���յ�����
	SimpleSuggest.prototype._onRequestNull = function () {
		// ����
		this.resultPanelDom.hide();
		this.resultListDom.html(''); // ���
		this.resultEmptyDom.hide();
		if (this._replacedDom) {
			this._replacedDom.show();
			this._replacedDom = void 0; // ����suggest����
		}
	};
	// suggest���ݷ��õ��б�����
	SimpleSuggest.prototype._onDisplayedResult = function (data) {
		// ֻ�ڵ�һ�μ�¼��Ҫ���ص�Ԫ��
		if (this.isReplaceSuggestWrap && !this._replacedDom) {
			this._replacedDom = this.suggestWrap.children(':visible').hide();
		}
		// ������
		if (data.resultData.length) {
			this.resultPanelDom.show();
			this.resultEmptyDom.hide();
		}
		// ��
		else {
			this.resultPanelDom.hide();
			this.resultEmptyDom.show();
		}
	};
	// ѡ��ĳ��Ԫ��
	SimpleSuggest.prototype._onSelectedItem = function (data) {
		K.log('SmipleSuggest-selectedItem: ', data);
		// ���ûָ���ԭʼ����ǰ
		this.setInputValue('');
		this._onRequestNull();
		this.inputDom.blur();
	};


	// ================================AddFriendSuggest=================================
	AddFriendSuggest = K.extend(function (config) {
		this._initDom();
		config = $.extend({
			'tipEmpty': '��������˭����Ի�',
			'tipNotFound': '�������ں����б�����������',
			// �����
			'inputDom': this.inputDom,
			// ����б�����
			'resultPanelDom': this.resultListDom,
			// �б���
			'resultListDom': this.resultListDom,
			// ÿ���ģ��
			'resultItemTemplate': Template.friendSuggestItem || '',
			// ���߶��޶�
			'maxHeight': 80,
			// �Ƿ�������
			'isReverse': true,
			'postParam': {'pars': 'gf_rs_rc_ri', 'maxnum': 0}
		}, config);
		AddFriendSuggest.$super.call(this, config);
		
		this.tip.html(this.tipEmpty);
		this.selectedResultDom.css('max-height', this.maxHeight);

		// ��������˵���ϢMap
		this._addedMap = {};

		this._initEvents();
	}, BaseSuggest);

	AddFriendSuggest.Events = {
		'AddFriendComplete': 'after_complete_add_friend',
		'CloseAddFriendPanel': 'after_close_friend_panel'
	};
	/**
	 * ��ʼ��dom�ڵ�
	 * @method _initDom
	 * @private
	 */
	AddFriendSuggest.prototype._initDom = function () {
		this.panel = $(Template.friendPanel).hide();
		this.inputDom = this.panel.find('[data-sigil="friendInput"]');
		this.tip = this.panel.find('[data-sigil="friendTip"]');
		this.resultListDom = this.panel.find('[data-sigil="friendResultList"]').hide();
		this.selectedResultDom = this.panel.find('[data-sigil="friendInputArea"]');

		// ѡ�еĽṹģ��
		this.selectedItemTemplate = doT.template(Template.friendSelectedItem);
	};
	/**
	 * ��ʼ��dom�¼�
	 * @method _initEvents
	 * @private
	 */
	AddFriendSuggest.prototype._initEvents = function () {
		this.panel
			// ȷ��/ȡ������ 
			.delegate('[data-sigil="friendAddConfirm"]', 'click', $.proxy(this._eAddConfirm, this))
			.delegate('[data-sigil="friendAddCancel"]', 'click', $.proxy(this._eAddCancel, this))
			// ɾ��һ����ѡ��
			.delegate('[data-sigil="friendDelete"]', 'click', $.proxy(this._eDeleteOne, this))
			// ��������������ƹ�궼��input��
			.delegate('[data-sigil="friendInputArea"]', 'click', $.proxy(this._eClickInputArea, this))
			// input ��ý���ʱ��ʾ
			.delegate('[data-sigil="friendInput"]', 'focus', $.proxy(this._eFocusInput, this))
			// input �˸��ɾ��һ����ѡ��
			.delegate('[data-sigil="friendInput"]', 'keydown', $.proxy(this._eKeydownDelete, this));

		// ���fire�¼�
		this.on(Events.RequestNull, $.proxy(this._onRequestNull, this));
		this.on(Events.DisplayedResult, $.proxy(this._onDisplayedResult, this));
		this.on(Events.SelectedItem, $.proxy(this._onAddOneFriend, this));
	};

	/**
	 * �¼�������
	 */
	// ����ȷ�����
	AddFriendSuggest.prototype._eAddConfirm = function (evt) {
		var data = [];
		$.each(this._addedMap, function (uid, user) {
			data.push(user);
		});

		// ������ʱ�������
		if (data.length) {
			this.fire(AddFriendSuggest.Events.AddFriendComplete, data)
		}
		this.closePanel();
		evt.preventDefault();
	};
	// ����ȡ��
	AddFriendSuggest.prototype._eAddCancel = function (evt) {
		this.closePanel();
		evt.preventDefault();
	};
	// ɾ��һ����ѡ��
	AddFriendSuggest.prototype._eDeleteOne = function (evt) {
		this.deleteAddedOne($(evt.currentTarget).parent());
		evt.preventDefault();
	};
	// ��������������ƹ��
	AddFriendSuggest.prototype._eClickInputArea = function (evt) {
		this.inputDom.focus();
		evt.preventDefault();
	};
	// input focus ������ֵʱ����
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
	// Input���˸��ɾ��һ��
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
	 * ���һ����ѡ��
	 * @method _onAddOneFriend
	 */
	AddFriendSuggest.prototype._onAddOneFriend = function (data) {
		var wrap = this.selectedResultDom;

		this.inputDom.parent().before(this.selectedItemTemplate({
			'uid': data.uid,
			'name': data.real_name
		}));
		// ����������Ϣ
		this._addedMap[data.uid] = data;

		// ���߶ȣ�ֻ��ie6��֧��max-height��������Ҫ�趨�߶ȣ��Ա��㹻�ߺ������
		if (K.Browser.ie6) {
			if (wrap.height > this.maxHeight) {
				wrap.height(this.maxHeight);
			}
			else {
				wrap.height('auto');
			}
		}
		// �������ײ�
		wrap.scrollTop(wrap.get(0).scrollHeight);
		// ����input
		this.setInputValue('').focus();
	};
	// �����ݣ���ʾtipEmpty
	AddFriendSuggest.prototype._onRequestNull = function () {
		this.tip.html(this.tipEmpty).show();
		this.resultListDom.hide();
		K.log('������һ���յ�����');
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
		K.log('suggest����������', data);
	};
	/**
	 * �ر� panel
	 * @method closePanel
	 */
	AddFriendSuggest.prototype.closePanel = function () {
		var wrap = this.selectedResultDom;

		this.panel.hide();
		// ����ϴεļ�¼
		this._addedMap = {};
		this.setInputValue('');
		wrap.find('[data-sigil="friendSelected"]').remove();
		wrap.height('auto');

		this.fire(AddFriendSuggest.Events.CloseAddFriendPanel);
	};
	/**
	 * ɾ��һ���������
	 * @method deleteAddedOne
	 * @param {jQuery dom} dom Ҫɾ���ļ��˵Ľڵ�
	 */
	AddFriendSuggest.prototype.deleteAddedOne = function (dom) {
		var uid = dom.data('uid') || 0;
		dom.remove();
		// ���ٰ�����id��Ԫ��
		if (!this.selectedResultDom.find('[data-sigil="friendSelected"][data-uid="' + uid + '"]').length) {
			delete this._addedMap[uid];
		}
	};
	/**
	 * �� panel
	 * @method openPanel 
	 */
	AddFriendSuggest.prototype.openPanel = function () {
		this.panel.show();
		this.inputDom.focus();
	};
	/**
	 * panel �Ƿ��
	 * @method isPanelOpen
	 */
	AddFriendSuggest.prototype.isPanelOpen = function () {
		return this.panel.is(':visible');
	};
	/**
	 * �õ� panel Dom ����
	 * @method getPanel
	 */
	AddFriendSuggest.prototype.getPanel = function () {
		return this.panel;
	};






	Template = {
		// �������
		'resultWrap':
'<div class="kxChatUserList_Result dn">' +
'	<ul class="kxChatUserListItem" data-sigil="resultList"></ul>' +
'</div>',
		// suggest��
		'resultItem':
'<li{{=it.index === it.start ? \' class="\' + it.hoverClass + \'"\' : \'\'}} data-id="{{=it.uid || it.gid}}">' +
// ����
'{{if (it.uid) {}}' +
'	<a href="/home/{{=it.uid}}.html" class="kxAvatar_32"><img src="{{=it.logo}}" alt=""></a>' +
'	<a href="/home/{{=it.uid}}.html">{{=it.name}}</a>' +
'	<i class="ico_status ico_status_{{=it.online}}"></i>' +
// Ȧ��
'{{} else if (it.gid) {}}' +
'	<a href="/rgroup/index.php?gid={{=it.gid}}" class="kxAvatar_32 kxAvatar_circle"></a>' +
'	<a href="/rgroup/index.php?gid={{=it.gid}}">����������ֲ�</a>' +
'{{}}}' +
'</li>',
		// �ս����ʾ
		'resultEmpty': 
'<div class="kxChatUserList_ResultEmpty">' +
'	<div class="kxChatUserList_empty">' +
'		<p class="tac">û���ҵ��û������Ƿ���ȫ�����������û�����</p>' +
'		<p class="tac mt10"><span class="kxbtn kxbtn_gray_s" data-sigil="emptyButtonCancel"><button class="normal"><em><span><b><i>����лл</i></b></span></em></button></span><span class="kxbtn kxbtn_gray_s ml10" data-sigil="emptyButtonConfirm"><button class="normal"><em><span><b><i>�õ�</i></b></span></em></button></span></p>' +
'	</div>' +
'</div>',

		// ==========================��Ӻ�������======================
		// addFriendSuggest Panel
		'friendPanel': 
'<div class="clearfix kxChatUserSuggest">' +
'	<div class="kxSuggestUserFakerel">' +
'		<div class="kxChatTips kxChatTips_tip" data-sigil="friendTip"></div>' +
'		<ul class="userMatchedList kx_scrollAble" data-sigil="friendResultList"></ul>' +
'	</div>' +
'	<div class="clearfix kxSuggestUserToken kx_scrollAble" data-sigil="friendInputArea">' +
		// ����λ�ò���ѡ�еĺ���
'		<div class="userTakeBox"><input type="text" style="width:20px" data-sigil="friendInput"/></div>' +
'	</div>' +
'	<span class="kxChatUserSuggest_confirm" data-sigil="friendAddConfirm">' +
'		<input type="button" value="">' +
'	</span>' +
'	<span class="kxChatUserSuggest_cancel" data-sigil="friendAddCancel">' +
'		<input type="button" value="">' +
'	</span>' +
'</div>',
		// ѡ�к��չʾ
		'friendSelectedItem':
'<span class="userToken" data-sigil="friendSelected" data-uid="{{=it.uid}}">{{=it.name}}<a href="#" class="kxChatDel" data-sigil="friendDelete"></a></span>',
		// suggest �����б���
		'friendSuggestItem':
'<li{{=it.index === it.start ? \' class="\' + it.hoverClass + \'"\' : \'\'}} data-id="{{=it.uid}}">{{=it.name}} <span class="kxChatAvatar"><img src="{{=it.logo}}" alt=""/></span></li>'
	};

	SimpleSuggest.Events = Events;
	$.extend(AddFriendSuggest.Events, Events);

	return {'Simple': SimpleSuggest, 'AddFriend': AddFriendSuggest};
});
