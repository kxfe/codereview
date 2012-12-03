// vim: filetype=javascript
/**
 * @fileoverview 
 *    聊天窗口定义
 *    分成三种type: person/group/circle
 * 
 * 文件组成：
     - Window 是基本的聊天窗口各种功能和交互对象定义
	 - PersonWindow/CircleWindow/GroupWindow 是三种类型窗口自身的处理代码
	 - Common 对应三种类型代码需要公用的部分，该对象完全独立与上面三个对象。
	 当 Window 中的功能对不同类型窗口的处理不一致时，通过 adapter 方法根据当前窗口类型动态选择具体的处理方法。
	 sigil 方法用来访问所需的节点，但必须是唯一，一旦定义就不再查找。


 * @author  linfei@corp.kaixin001.com
 * @date    2012/10/26
 *
 */
define('apps/im/IMWindow', [
	'jQuery',
	'doT',
	'core/uploader/Uploader',
	'apps/im/IMControler',
	'apps/im/IMSuggest',
	'apps/common/FaceResource',
	'apps/common/EmoticonControl'
], function (require) {

	var $ =               require('jQuery'),
		doT =             require('doT'),
		Uploader =        require('core/uploader/Uploader'),
		Controler =       require('apps/im/IMControler'),
		Suggest =         require('apps/im/IMSuggest').AddFriend,
		FaceResource=     require('apps/common/FaceResource'),
		EmoticonControl = require('apps/common/EmoticonControl'),

		Window,             // 窗口类定义，内部需要不同类型处理时，用 this.adapter 适配
		CircleWindow = {},  // 圈子
		GroupWindow = {},   // 群聊
		PersonWindow = {},  // 个人
		Common = {},        // 三种窗口公用方法

		zIndex = 0,         // 每个窗口激活，递增zIndex值
		Template;           // 模板




	//**********************************************
	//* 聊天窗口
	//**********************************************/
	/**
	 * 聊天窗口类定义
	 * @class Window
	 * @param {Object} config
	 */
	Window = function (config) {
		$.extend(this, {
				'id': 0,
				'type': Window.TYPE.PERSON,
				'container': 'body',
				'useQuit': false,     // 群聊退出对话
				'useAddPerson': true, // 群聊加人
				'useForbid': false,   // 圈子禁止消息提醒
				'openFrom': Controler.getConf().openFrom.auto // 打开来源
			}, config);

		// 标记是否正在提交中
		this.submitLock = false;
		// 上次聊天记录的创建时间
		this.lastRecordTime = 0;
		// 每次对话间隔(ms)
		this._recordIntervalTime = 5 * 60 * 1000; 
		// typing间隔时间
		this._typingIntervalTime = 30000;

		// template解析
		this.template = {};
		$.each(Template, $.proxy(function (key, val) {
			this.template[key] = doT.template(val);
		}, this));

		// 成员信息，一般只在group中用到
		// - appendHistory 存储初始的成员信息
		// - addFriendComplete 存储转换时的邀请人+自己
		// - addFriendComplete 邀请加入时添加新的成员
		this.member = {}; 

		this.setAdapter(); // 设置适配器，确定 this.adapter 的引用对象

		this._init();
	};

	// 消息
	$.extend(Window, {
		// 事件
		'Events': {
			'Close': 'chat:windowClose',
			'Min':   'chat:windowMin',
			'Open':  'chat:windowOpen',
			'QuiteGroup': 'chat:windowQuiteGroup',
			'CreateGroup': 'chat:windowCreateGroup',
			'InviteInGroup': 'chat:windowInviteInGroup'
		},
		// 类型
		'TYPE': {
			'PERSON': 0,
			'GROUP':  1,
			'CIRCLE': 2
		}
	});

	/**
	 * Window初始化
	 * @method _init
	 * @private
	 */
	Window.prototype._init = function () {
		// 创建
		this.getWindowDom().sigil('winChat').hide();

		this._active();

		// 添加进历史记录
		this.appendHistory();

		// 注册事件
		this._initEvent();

		// 新消息打开的窗口，设置提醒
		if (this.openFrom === Controler.getConf().openFrom.msg) {
			this.notify();
		}
		// 插入页面
		this._appendToDom();
		
		this._initUpload();

		// 存入数据
		Controler.addWindow(this);
	};

	/**
	 * 注册事件
	 * @method _initEvent
	 * @private
	 */
	Window.prototype._initEvent = function () {
		this.sigil('root')
			// 打开
			// _eOpen 用delegate方式，防止直接绑定会先触发而不理会子级的阻止冒泡
			.delegate(this.selector('winChat'), 'click', $.proxy(this._eOpen, this))
			// 点击tab， toggle聊天窗口
			.delegate(this.selector('winTab'), 'click', $.proxy(this._eToggleChat, this))
			// 阻止records的点击事件
			.delegate(this.selector('winItemWrap'), 'click', $.proxy(this._eClickRecords, this))
			// 关闭
			.delegate(this.selector('winClose'), 'click', $.proxy(this._eClose, this))
			// 最小化
			.delegate([this.selector('winMin'), this.selector('winTitle')].join(','),
					  'click',
					  $.proxy(this._eMin, this))
			// 退出圈子
			.delegate(this.selector('winQuite'), 'click', $.proxy(this._eQuite, this))
			// 禁言圈子
			.delegate(this.selector('winForbid'), 'click', $.proxy(this._eForbid, this))
			// 表情
			.delegate(this.selector('winButtonFace'), 'click', $.proxy(this._eEmotionPanelShow, this))
			// 加好友
			.delegate(this.selector('winButtonAdd'), 'click', $.proxy(this._eToggleAddFriend, this))
			// 提交
			.delegate(this.selector('winButtonSubmit'), 'click', $.proxy(this._eSubmit, this))
			// 输入框键盘事件
			.delegate(this.selector('winTextarea'), 'keydown', $.proxy(this._eTextareaKeydown, this))
			.delegate(this.selector('winTextarea'), 'input', $.proxy(this._eTextareaInput, this))
				// ie输入改变
			.delegate(this.selector('winTextarea'), 'propertychange', $.proxy(this._eTextareaInput, this));
	};

	/**
	 * 将窗口插入页面
	 * @method _appendToDom
	 * @private
	 */
	Window.prototype._appendToDom = function () {
		this.sigil('root').appendTo($(this.container));
	};

	/**
	 * 事件处理函数
	 */
	// 关闭
	Window.prototype._eClose = function (evt) {
		this.adapter('close');
		this.close();
		evt.preventDefault();
		evt.stopPropagation();
	};
	// 最小化
	Window.prototype._eMin = function (evt) {
		var target = $(evt.target),
			href;
		target =  target.is('a') ?
				  target :
				  target.parentsUntil(this.sigil('winTitle'), 'a');
		href = target.attr('href');
		// 点击姓名链接跳转 
		if (!href || href === '#') {
			this.min();
			evt.preventDefault();
		}
		evt.stopPropagation();
	};
	// 退出群聊
	Window.prototype._eQuite = function (evt) {
		if (confirm('确定要退出群聊吗?')) {
			this.quit();
		}
		evt.preventDefault();
		evt.stopPropagation();
	};
	// 禁言圈子
	Window.prototype._eForbid = function (evt) {
		var forbidClass = 'kxChatBtn_blockActived',
			btn = this.sigil('winForbid'),
			tip = this.sigil('winForbidTip'),
			text = tip.children('i'),
			v = 0;

		// 取消上次缓动
		clearTimeout(this._circleForbidTimer);

		// 打开
		if (btn.hasClass(forbidClass)) {
			btn.removeClass(forbidClass);
			text.text('即时消息已被打开');
			v = 0;
		}
		// 关闭
		else {
			btn.addClass(forbidClass);
			text.text('即时消息已被关闭');
			v = 1;
		}

		// 保存设置结果
		Controler.setForbidCircle(this.id, v);
		$.post('/rgroup/aj_member_setting.php', {
				'gid':  this.id,
				'setting[forbid_imsg]': v
			});
		K.log('设置即时消息关闭：' + Controler.getForbidCircle(this.id));

		// 缓动展示，延期消失
		tip.fadeIn('fast');
		this._circleForbidTimer = setTimeout(function () {
				tip.fadeOut();
			}, 2000);

		evt.preventDefault();
		evt.stopPropagation();
	};
	// 打开
	Window.prototype._eOpen = function (evt) {
		this.open();
	};
	// toggle window
	Window.prototype._eToggleChat = function (evt) {
		if (this.isOpen()) {
			this.min();
		}
		else {
			this.open();
		}
	}
	// records点击事件阻止默认行为
	Window.prototype._eClickRecords = function (evt) {
		evt.preventDefault();
	};
	// 提交
	Window.prototype._eSubmit = function (evt) {
		this.submitRecord();

		evt.preventDefault();
	};
	// 输入键盘事件
	Window.prototype._eTextareaKeydown = function (evt) {
		if (evt.keyCode === 13 && !evt.shiftKey) {
			this.submitRecord();

			evt.preventDefault();
			evt.stopPropagation();
		}
	};

	Window.prototype._eTextareaInput = function (evt) {
		if (this.isInNotify()) {
			this.clearNotify();
		}
		this.sendTyping();
		this.checkInputLimit();
	};
	Window.prototype.checkInputLimit = function () {
		var diff = Controler.getConf().maxWords - this.sigil('winTextarea').val().length;

		if (diff <= 10) {
			this.sigil('winInputLimit')
				.html((diff < 0 ? '已超过' + Math.abs(diff) : '还可输入' + diff) + '个字')
				.show();
		}
		else {
			this.sigil('winInputLimit').hide();
		}
	};
	Window.prototype.sendTyping = function () {
		var now = new Date().getTime();
		if (now - (this._lastTypingTime || 0) > this._typingIntervalTime) {
			this.adapter('sendTyping');
			this._lastTypingTime = now;
		}
	};
	// 表情面板打开 
	Window.prototype._eEmotionPanelShow = function (evt) {
		var me = this,
			emotion = this._emotionPanel,
			editor, name, container, opts;
		if (!emotion) {
			editor = liteEditor(this.sigil('winTextarea').parent());
			name = 'chatPublish#' + this.id;
			container = this.sigil('winFacePanel');

			if (!container.length) {
				container = $(this.template.facePanel({}));
				container.insertBefore(this.sigil('winButtonFace'));
				this.sigil('winFacePanel', container, true);
			}
			// 加入互斥显示
			Controler.avoidShowSimultaneously(evt.currentTarget, container, function () {
				emotion.toggle();
			});

			opts = EmoticonControl.createOptions({
					emoticonContainerInsertion: {
						method: 'prependTo',
						where: null
					}
				});
			emotion= new EmoticonControl(name, container, this, opts);
			emotion.setEditor(editor);
			
			// 插入后隐藏
			emotion.bind(EmoticonControl.Events.inserted, function (data) {
				emotion.hide();
				me.checkInputLimit();
			});
			// 表情翻页
			this.sigil('winFacePrev').click(function(){emotion.prevPage();});
			this.sigil('winFaceNext').click(function(){emotion.nextPage();});

			this._emotionPanel = emotion;
		}

		this.sigil('winTextarea').blur();
		emotion.toggle();
		
		evt.preventDefault();
	};

	// 初始化上传
	Window.prototype._initUpload = function () {
		var me = this,
			uploader, uploadPercentId, uploadPercentDom;

		uploader = new Uploader({
			type:        'flash',
			maxSize:     '40 MB',
			fileType:    '*',
			serverURL:   '/file/upload_submit.php',
			btnWidth:    22,
			btnHeight:   22,
			btnWrapID:   'chatUploadFile_' + this.id,
			btnImgURL:   'http://' + K.Env.IMG_HOST + '/i2/chat/chatnew/swfuploadbg.png',
			postParam:   {'verify': Controler.getUploadVerify(), 
						  'attachment_type': 'chat'},
			enableDebug: false
		});

		uploader.on( 'available', function(){
			K.log( 'uploader: Upload Available' );
		}); 
		uploader.on('file_dialog_start', function () {
			K.log('uploader: file dialog start');
		});
		uploader.on( 'file_queue', function( e ){
			K.log('uploader: ' + e.file.name + '加入队列！' );
		});
		uploader.on('file_queue_error', function (evt) {
			K.log('uploader: queue_error ', evt);
		});
		uploader.on('before_upload', function () {
			K.log('uploader: before upload');
		});
		uploader.on('file_dialog_complete', function () {
			K.log('uploader: file dialog complete');
		});
		uploader.on('upload_start', function (e) {
			K.log('uploader: upload start');
			var ctime = K.formatDate(new Date(), 'yyyy-MM-dd hh:mm:ss');
			uploadPercentId = 'upload_' + (ctime + e.file.name).replace(/\W/g, '');
			me.addRecord({
				'uid': Controler.getMine().uid,
				'type': 'upload',
				'content': '',
				'ctime': ctime,
				'uploadName': e.file.name,
				'uploadId': uploadPercentId // 百分比变化元素特别标记
			});
			me.scrollRecords('bottom');
		});
		uploader.on( 'upload_progress', function( e ){
			var loaded = e.bytesLoaded || 0,
				total = e.bytesTotal,
				ratio;

			if( total ){
				if (!uploadPercentDom) {
					uploadPercentDom = me.sigil('winItemWrap').find('[data-uploadid='+uploadPercentId+']');
				}

				ratio = Math.round(( loaded / total ) * 100);
				uploadPercentDom.text(ratio);
				K.log('uploader: progress: ' +ratio + '%');
			}
		});
		uploader.on( 'upload_success', function(evt){
			K.log(['uploader: sucess: ', evt]);
			if (uploadPercentDom) {
				uploadPercentDom.parent()
					.html('文件：' + evt.file.name + ' 发送成功');
			}
			me.submitRecord(K.mix(evt.file, {
				// 解析出fileid值
				'fileid': evt.serverData.match(/(?:\("(?:\d+:)*)(\d+)(?:"\))/)[1]
			}), 'upload success');
			uploadPercentDom = uploadPercentId = void 0;
		});
		uploader.on('upload_error', function (evt) {
			K.log(['uploader: error ', evt, evt.errorCode]);
			if (uploadPercentDom) {
				uploadPercentDom.parent()
					.html('文件：' + evt.file.name + ' 发送失败');
			}
			uploadPercentDom = uploadPercentId = void 0;
		});

	};
	// 加人切换
	Window.prototype._eToggleAddFriend = function (evt) {
		var suggest = this._resistedSuggest,
			input = this.sigil('winTextarea');
		if (!suggest) {
			suggest = new Suggest({'isReserve': true});
			input.after(suggest.getPanel());
			Controler.avoidShowSimultaneously(evt.currentTarget, input.parent(), $.proxy(function () {
					if (suggest.isPanelOpen()) {
						suggest.closePanel();
					}
				}, this));

			// 关闭时，切换textarea显示
			suggest.on(Suggest.Events.CloseAddFriendPanel, function () { input.show(); });
			// 加人成功时
			suggest.on(Suggest.Events.AddFriendComplete, $.proxy(function (data) {
					this.adapter('addFriendComplete', data);
				}, this));

			this._resistedSuggest = suggest;
		}

		if (suggest.isPanelOpen()) {
			suggest.closePanel();
		}
		else {
			input.hide();
			suggest.openPanel();
		}

		evt.preventDefault();
	};
	
	/**
	 * 仅打开窗口，没有其他操作
	 */
	Window.prototype.max = function () {
		if (!this.isOpen()) {
			this.sigil('winChat').show();
			this.scrollRecords('bottom');
			this.adapter('max');
		}
	};
	/**
	 * 打开窗口，包含打开、激活
	 * @method open
	 */
	Window.prototype.open = function () {
		var isOpen = this.isOpen();

		this.max();
		if (!isOpen || !this.isActive() || this.isInNotify()) {
			this.clearNotify();
			this._active();
			Controler.fire(Window.Events.Open, this);
		}
		// 点击表情时，不允许光标还停留在input中，
		// 但是事件冒泡到最上面触发该方法，仍会回来。
		// 参照老版点击窗口并不自动定位到input中
		//this.sigil('winTextarea').focus();

		// 检查是否需要退出
		setTimeout($.proxy(function () {
			if (/T/.match(this.id)) {
				if (Controler.getGroup(this.id).ginfo.member < 2) {
					alert( '其他成员已全部退出群聊，群聊即将关闭。' );
					this.quit();
				}
			}
		}, this), 50);
	};
	/**
	 * 关闭窗口
	 * @method close
	 */
	Window.prototype.close = function () {
		// 清理注册的事件
		this.sigil('root').undelegate();
		// 移除dom节点
		this.sigil('root').remove();

		Controler.fire(Window.Events.Close, this);
	};
	/**
	 * 最小化窗口
	 */
	Window.prototype.min = function () {
		this.adapter('min');
		this.sigil('winChat').hide();
		Controler.fire(Window.Events.Min, this);
	};

	/**
	 * 激活
	 * @method _active
	 * @private
	 */
	Window.prototype._active = function () {
		this.setStyle({'z-index': ++zIndex});
	};
	/**
	 * 是否激活状态，同时必须是打开的
	 * @method isActive
	 * @return {Boolean}
	 */
	Window.prototype.isActive = function () {
		return this.isOpen() &&
			   this.sigil('root').css('z-index') >> 0 === zIndex;
	};

	/**
	 * 是否打开，仅指列表是否展开，而不管active状态
	 * @method isOpen
	 * @return {Boolean}
	 */
	Window.prototype.isOpen = function () {
		return this.sigil('winChat').is(':visible');
	};

	Window.prototype.quit = function () {
		if (this.type !== Window.TYPE.GROUP) {
			return;
		}
		// notify other member
		$.post('/rgroup/aj_chat_send.php', {
			'gid':     this.id,
			'content': '{#系统消息(TG_QUIT):' + Controler.getMine().real_name + '退出群聊#}',
			'chatid':  Controler.getChatId()
		});
		// save to the server
		$.post('/rgroup/aj_quit_tgroup.php', {'gid': this.id});
		// notify the list
		Controler.fire(Window.Events.QuiteGroup, this);
		// close the chat window
		this.close();
	};

	/**
	 * 获取windowdom元素
	 * @method getWindowDom
	 * @return {jQuery Dom} win 窗口jquery dom对象
	 */
	Window.prototype.getWindowDom = function () {
		var win = this.sigil('root');

		if (win.selector !== '') {
			win = $(this.template.win(this._getTitleData()));
			this.sigil('root', win, true);
			this.updateTitle();
		}
		
		return win;
	};

	/**
	 * 设置样式，通常是位置、zIndex
	 * @method setStyle
	 * @param {Object} obj 样式对象
	 */
	Window.prototype.setStyle = function (obj) {
		this.getWindowDom().css(obj);
	};

	/**
	 * 添加对话记录
	 * @method addRecord
	 * @param {Object} record 
	 		{
				uid: record所属的人的id
				content: 内容
				time: 创建时间
			}
	 */
	Window.prototype.addRecord = function (record) {
		var user = Controler.getUser(record.uid),
			resultHtml = '',
			sysReg = /^{#[^:]*:(.+)#}$/;

		// 系统通知
		if (sysReg.test(record.content)) {
			record.type = 'info';
			record.content = this.template.sysmsg({'sysmsg': record.content.replace(sysReg, '$1')});
		}

		// 加人、退出
		if (record.type === 'info') {
			// 对退出的通知进行解析
			resultHtml = record.content;
		}
		else {
			this.checkRecordTime(record.ctime);

			K.mix(record, {
				'name': user.real_name,
				'logo': user.logo || '',
				'isMe': Controler.isMine(record.uid)
			});

			// 附件
			if (record.attachment) {
				record.type = 'attachment';
				// 改变大小为转换后的值
				record.attachment.size = Controler.getFileSize(record.attachment.size);
			}
			// 一般内容
			else {
				record.content = record.content
					// 解析换行
					.replace(/\n+/g, function (c) {
						return c.length > 1 ? '<br/><br/>' : '<br/>';
					})
					// 解析表情: (#表情)，//smile，:), :(
					.replace(/\(#[^\s\)]+\)|\/\/\w+|\:\)|\:\(/g, function (c) {
						var fs = FaceResource.faceResource[c];
						if (fs) {
							c = '<img src="' + (FaceResource.baseURL + fs.path) +
								'" title="' + fs.title + '" alt="' + fs.title + '" />';
						}
						return c;
					});
			}

			resultHtml = this.template.item(record);
		}

		this.sigil('winItemWrap').append(resultHtml);
	};
	
	/**
	 * 添加历史记录
	 * @method appendHistory
	 *   history格式：
	 		{
				msgs:[],
				online: 1
			}
	     msg格式：
			{
				cmid: 12761
				content: "asdfa"
				ctime: "11-01 10:34:59"
				direction: "receive|send"
				msg: "{"ver":1,"content":"asdfa"}"
				t: 1351737299
			}
	 */
	Window.prototype.appendHistory = function () {
		this.adapter('appendHistory');
	};

	/**
	 * 滚动聊天记录到某个位置，默认是底部
	 * @method scrollRecords
	 * @param {String} pos 指定位置，默认是‘bottom’
	 */
	Window.prototype.scrollRecords = function (pos) {
		var records = this.sigil('winItemWrap');

		switch (pos) {
		case 'bottom':
			records.scrollTop(records.get(0).scrollHeight - records.height());
			break;
		}
	};

	/**
	 * 提交聊天记录
	 * @method submitRecord
	 * @method recordContent 提交的内容
	 */
	Window.prototype.submitRecord = function (file, recordContent) {
		// 默认发布内容为文本框中的内容
		if (!recordContent) {
			recordContent = $.trim(this.sigil('winTextarea').val());
		}
		
		// 空串不予执行
		if (recordContent) {
			this.adapter(
				'submitRecord',
				file,
				recordContent.slice(0, Controler.getConf().maxWords)
			);
		}
	};
	/**
	 * 设置提醒
	 * @method notify
	 */
	Window.prototype.notify = function () {
		var notifyClass = 'kxChatNewMsgBg';

		if (this.isOpen()) {
			this.sigil('winTitle').addClass(notifyClass);
		}
		else {
			this.sigil('winTab').addClass(notifyClass);
			this.sigil('winTabNew')
				.html(Controler.getUnread(this.id).length)
				.show();
		}

		// 声音提示
		if (!Controler.getForbidSound()) {
			Controler.makeSound();
		}
		K.log('提醒：----有新消息了----');
	};
	/**
	 * 是否在提醒中
	 */
	Window.prototype.isInNotify = function () {
		var notifyClass = 'kxChatNewMsgBg';
		return this.sigil('winTab').hasClass(notifyClass) ||
				this.sigil('winTitle').hasClass(notifyClass);
	};

	/**
	 * 清空提醒标识
	 * @method clearNotify
	 */
	Window.prototype.clearNotify = function () {
		var notifyClass = 'kxChatNewMsgBg';

		this.sigil('winTitle').removeClass(notifyClass);
		this.sigil('winTab').removeClass(notifyClass);
		this.sigil('winTabNew').html('0').hide();
	};

	/**
	 * 处理新收到的消息
	 * @method dealNewMsg
	 * @param {Object} info 新消息数据
	 */
	Window.prototype.dealNewMsg = function (info) {
		this.addRecord(K.mix({
			'uid':     info.uid,
			'ctime':   info.ctime,
			'cmid':    info.cmid
		}, $.parseJSON(info.msg)));

		this.hideTip();
		this.notify();
		this.scrollRecords('bottom');
	};

	/**
	 * 显示各种类型窗口提示
	 * @method showTip
	 * @param {String} type 提示类型
	 *     typing、offline、sendfail
	 * @param {Object} data 需要的其他信息
	 */
	Window.prototype.showTip = function (type, data) {
		var me = this;
		me.sigil('winChatTip')
			.html(me.template.tips($.extend({'type': type}, data || {})))
			.fadeIn();

		clearTimeout(me._showTipTimer);
		me.showTipTimer = setTimeout(function () {
				me.hideTip();
			}, me._typingIntervalTime);
	};
	Window.prototype.hideTip = function () {
		this.sigil('winChatTip').fadeOut();
	};

	/**
	 * 在线状态改变
	 * @param {Array} users 状态改变的用户信息
	 */
	Window.prototype.onlineStatusChange = function (users) {
		this.adapter('onlineStatusChange', users);
	};

	/**
	 * 检查记录时间
	 * @method checkRecordTime
	 * @param {String} time 要检查的时间表示
	 *     - 2012-11-19 12:34:53
	 *     - 08-14 23:32:43
	 *  结果：
	 *     - 三天内，用前天、昨天、今天表示
	 *     - 同一周内，用星期几表示
	 *     - 同年内不显示年
	 *     - 其他以完整的年月日表示
	 */
	Window.prototype.checkRecordTime = function (time) {
		var t, now, dayDiff;

		// 解析time
		if (K.isString(time)) {
			t = time.replace(
				/(?:(\d{2,4})-)?(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})/g,
				function (str, y, m, d, H, M, S) {
					var date = new Date();
					// y存在才设置
					if (y) {
						date.setFullYear(y.length === 4 ? y : '20' + y); // 本世纪有效:P
					}
					date.setMonth(m - 1);
					date.setDate(d);
					date.setHours(H);
					date.setMinutes(M);
					date.setSeconds(S);
					date.setMilliseconds(0);

					return date.getTime();
				}
			);

			// 和上次记录比，时间足够长，需要输出时间
			t = new Date(t - 0);
			if (t - this.lastRecordTime >= this._recordIntervalTime) {
				this.addRecord({
					'type': 'info',
					'content': this.template.time({'time': getDateStr(t)})
				})
				this.lastRecordTime = t;
			}
		}

		// 得到一个日期的字符串表示
		function getDateStr(d) {
			var n = new Date(),
				result = 'yyyy-MM-dd',
				weekDay, dateDiff;
				
			if (n.getFullYear() === d.getFullYear()) {// 同年
				result = 'MM-dd';
				if (n.getMonth() === d.getMonth() && // 同月
					(dateDiff = n.getDate() - d.getDate()) < 7) { // 7天内

					weekDay = [7,1,2,3,4,5,6];
					// 三天内
					if (dateDiff < 3) {
						result = ['今天', '昨天', '前天'][dateDiff];
					}
					// 处在同一周
					else if (weekDay[n.getDay()] > weekDay[d.getDay()]) {
						result = '星期' + ['日','一','二','三','四','五','六'][d.getDay()];
					}
				} // 7天内
			} // 一年

			return K.formatDate(d, result + ' hh:mm:ss');
		}
	};
	/**
	 * 根据当前窗口的信息，更新标题
	 */
	Window.prototype.updateTitle = function () {
		var data = this._getTitleData();

		this.sigil('winTitle').html(this.template.title(data));
		// tab更新
		this.sigil('winTab').html(this.template.tab($.extend(data, {
			'unread': 0
		})));
	};
	Window.prototype._getTitleData = function () {
		// title的基本数据
		var data = {
				'id':           this.id,
				'useForbid':    this.useForbid,
				'useQuit':      this.useQuit,
				'useAddPerson': this.useAddPerson,
				'type':         this.type
			};

		$.extend(data, this.adapter('getTitleData'));

		return data;
	};

	/**
	 * 设置适配器，初始化时改变一次，变为群聊时再改变
	 * @method setAdapter
	 * @private
	 */
	Window.prototype.setAdapter = function () {
		var name, obj;

		switch (this.type) {
		// 圈子
		case Window.TYPE.CIRCLE:
			obj = CircleWindow;
			name = 'CircleWindow';
			break;
		// 群聊
		case Window.TYPE.GROUP:
			obj = GroupWindow;
			name = 'GroupWindow';
			break;
		// 单人
		case Window.TYPE.PERSON:
			obj = PersonWindow;
			name = 'PersonWindow';
			break;
		}

		// @param {String} funcName 方法名
		// @param {Array} args 原参数
		// @return 将代理函数执行结果返回
		this.adapter = $.proxy(function (funcName) {
			var func;
			if (K.isString(funcName)) {
				func = obj[funcName];
				if (func && K.isFunction(func)) {
					return func.apply(this, [].slice.call(arguments, 1));
				}
				else {
					K.error('Adapter Error：can not find the method `' + funcName + '` in [' + name + ']');
					return false;
				}
			}
		}, this);
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
	Window.prototype.selector = function (sigil) {
		return '[data-sigil=' + sigil + ']';
	};
	/**
	 * 获取data-sigil形式的对象
	 *   - root 是根目录的名称，*必须先设*
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
	Window.prototype.sigil = function (sigil, context, isExecSet) {
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



	// ========================Adapter==============================
	// -----PersonWindow----
	// 得到标题数据
	PersonWindow.getTitleData = function () {
		var user = Controler.getUser(this.id),
			name = user.name,
			suffix = '...';
		return $.extend({
			'title': name,
			'longTitle': K.subByte(name, 26, suffix),
			'shortTitle': K.subByte(name, 16, suffix)
		}, user);
	};
	// 添加历史记录
	PersonWindow.appendHistory = function () {
		var me = this;
		$.when($.post('/chat/start.php',
				{
					'otheruid': this.id,
					'chatid': Controler.getChatId(),
					'oflag': 0,
					'open_from': this.openFrom
				}
			))
		.then(function (history) {
			// loading隐藏
			me.sigil('winChatLoading').hide();
			// 放置聊天记录
			history = K.isString(history) ? $.parseJSON(history) : history;
			K.log(['person 获取了聊天的history', history]);
			if (history.msgs && history.msgs.length) {
				K.forEach(history.msgs.reverse(), function (msg) {
					me.addRecord({
						'uid':     msg.direction === 'send' ? Controler.getMine().uid : me.id,
						'content': msg.content,
						'ctime':   msg.ctime
					});
				});
				me.scrollRecords('bottom');
			}
		});
	};
	PersonWindow.sendTyping = function () {
		$.post('/chat/typing.php', {'otheruid': this.id});
	};
	PersonWindow.min = function () {
		$.post('/chat/min.php', {
			'otheruid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	PersonWindow.max = function () {
		if (!Controler.getUser(this.id).online) {
			this.showTip('offline');
		}
		$.post('/chat/max.php', {
			'otheruid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	PersonWindow.close = function () {
		$.post('/chat/close.php', {
			'otheruid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	PersonWindow.submitRecord = function (file, recordContent) {
		var me = this,
			val, opts;

		if (!this.submitLock) {
			opts = {'chatid': Controler.getChatId(), 'otheruid': this.id};

			val = recordContent;
			// 如果是文件发送成功
			if (file) {
				val = '';
				opts.fileid = file.fileid;
			}
			else {
				opts.content = val;
			}
			// 提交数据
			if (file || val) { // 至少满足一个不为空
				Common.dealWithSubmitRecord(me, $.post('/chat/send.php', opts), val);
			}
		}
	};
	// 由一对一加人完成后变为群聊
	PersonWindow.addFriendComplete = function (data) {
		var me = this,
			len, cur, names, ids;

		data = data || []; // 包含用户信息的数组
		len  = data.length;
		if (!len) {
			return;
		}
		else if (len >= 99) {
			if (!(len === 99 && K.some(data, function (d) {return d.uid == this.id;}))) {
				alert( '创建群聊失败！\n群聊最多只能添加99人' );
				return;
			}
		}
		K.log(['加人数据：', data]);

		// 获得姓名和id列表array
		names = []; ids = [];
		Controler.addUser(data);
		$.each(data, function (i, item) {
			item = Controler.getUser(item.uid);
			// 添加到成员中
			if (!me.member[item.uid]) {
				me.member[item.uid] = item;
				ids.push(item.uid);
				names.push(item.name);
			}
		});
		// ids要加上当前对话人
		if (!me.member[me.id]) {
			cur = Controler.getUser(me.id);
			// 添加到成员中
			me.member[cur.uid] = cur;
			ids.push(cur.uid);
			names.push(cur.real_name);
		}

		// 转化窗口类型，创建群聊
		$.post('/rgroup/aj_create_tgroup.php', 
			{'uids': ids.join(' '), 'chatid': Controler.getChatId()})
		.done(function (rep) {
			rep = $.parseJSON(rep);
			// 创建失败提示
			if (rep.succ !== 1) {
				K.log('请求创建群聊成功，但是，Sorry, 创建失败！', rep);
				return;
			}

			rep = rep.data;
			me.id = rep.gid;
			me.type = Window.TYPE.GROUP;
			me.useQuit = true;
			// 存储group数据到DS，与初始加载结构保持一致
			Controler.addGroup($.extend(rep, {'ginfo': {
					'gid': rep.gid.slice(0, -1),
					'mtime': rep.ctime,
					'name': rep.name,
					'member': rep.member
				}}));
			// 更新adapter
			me.setAdapter();

			// 更新标题
			me.updateTitle();
			// 清空原有的聊天记录
			me.sigil('winItemWrap')
				.children().remove()
				.end()
				.append(me.sigil('winChatLoading'));

			// 将加人创建信息作为聊天的一条记录发出
			// 作为群聊的第一条
			me.submitRecord(
				null, 
				'{#系统消息(TG_JOIN):' + Controler.getMine().real_name + '邀请' + names.join('、') + '加入群聊#}'
			);
			// 通知新创建了一个分组
			Controler.fire(Window.Events.CreateGroup, {'gid': me.id});
		})
		.fail(function (rep) {K.log('创建群聊失败！', rep)});
	};
	PersonWindow.onlineStatusChange = function (users) {
		var me = this,
			otherone;

		otherone = K.detect(users, function (u, i) {return u.uid == me.id;});
		if (otherone) {
			// 改变在线状态
			me.sigil('root').find(me.selector('winOnlineStatus'))
				.removeClass('ico_status_online ico_status_offline')
				.addClass('ico_status_' + (otherone.online ? 'online' : 'offline'));
			// 提示
			if (otherone.online) {
				me.hideTip();
			}
			else {
				me.showTip('offline'); // 对方下线
			}
		}
	};


	// -----CircleWindow----
	CircleWindow.getTitleData = function () {
		var info = Controler.getCircle(this.id),
			name = info.ginfo.name,
			suffix = '...';
		return {
			'title':     name,
			'longTitle': K.subByte(name, 26, suffix),
			'shortTitle': K.subByte(name, 16, suffix)
		};
	};
	CircleWindow.appendHistory = function () {
		var me = this;

		$.post('/rgroup/aj_chat_start.php', {
			'gid':       me.id,
			'open_from': me.openFrom,
			'chatid':    Controler.getChatId()
		})
		.done(function (history) {
			var onlineNumber = 0,
				totalNumber = 0;
			// loading隐藏
			me.sigil('winChatLoading').hide();
			// 放置聊天记录
			history = K.isString(history) ? $.parseJSON(history) : history;
			if (history.succ === 1) {
				K.log(['组 获取了聊天的history', history]);
				history = history.data;
				// 添加新用户
				Controler.addUser(history.users);
				$.each(history.users, function (k, u) {
					u = Controler.getUser(u.uid);
					me.member[u.uid] = u;
					totalNumber += 1;
					onlineNumber += u.online ? 1 : 0;
				});
				// 更新成员数目显示
				me.sigil('root')
					.find(me.selector('winOnlineNumber')).text(onlineNumber)
					.end()
					.find(me.selector('winTotalNumber')).text(totalNumber);
				// 添加聊天记录
				if (history.msgs && history.msgs.length) {
					K.forEach(history.msgs.reverse(), function (msg) {
						me.addRecord({
							'uid':     msg.uid,
							'content': msg.content,
							'ctime':   msg.ctime
						});
					});
					me.scrollRecords('bottom');
				}
			}
		});
	};
	CircleWindow.sendTyping = function () {
		$.post('/rgroup/aj_chat_typing.php', {
			'gid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	CircleWindow.min = function () {
		$.post('/rgroup/aj_chat_min.php', {
			'gid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	CircleWindow.max = function () {
		$.post('/rgroup/aj_chat_max.php', {
			'gid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	CircleWindow.close = function () {
		$.post('/rgroup/aj_chat_close.php', {
			'gid': this.id,
			'chatid': Controler.getChatId()
		});
	};
	CircleWindow.submitRecord = function (file, recordContent) {
		var val, opts;

		if (!this.submitLock) {

			opts = {'chatid': Controler.getChatId(), 'gid': this.id};

			val = recordContent;
			// 如果是文件上传成功
			if (file) {
				val = '';
				opts.fileid = file.fileid;
			}
			else {
				// 如果有内容传入
				opts.content = val;
			}
			// 提交数据
			if (file || val) {
				Common.dealWithSubmitRecord(this, $.post('/rgroup/aj_chat_send.php', opts), val);
			}
		}
	};
	// online状态已经在Controler中修改。member对象都与DS中的保持同一个引用
	CircleWindow.onlineStatusChange = function () {
		var me = this,
			onlineNum = 0;

		$.each(this.member, function (i, member) {
			onlineNum += member.online ? 1 : 0;
		});

		this.sigil('root').find(this.selector('winOnlineNumber')).text(onlineNum);
	};

	
	// -----GroupWindow----
	GroupWindow.getTitleData = function () {
		var info = Controler.getGroup(this.id),
			name = info.ginfo.name,
			suffix = '...等',
			num = info.ginfo.member + '人';
		return {
			'title':      name + num,
			'longTitle':  K.subByte(name, 26, suffix) + num,
			'shortTitle': K.subByte(name, 16, suffix) + num
		};
	};
	GroupWindow.appendHistory = CircleWindow.appendHistory;
	GroupWindow.sendTyping = CircleWindow.sendTyping;
	GroupWindow.min = CircleWindow.min;
	GroupWindow.max = CircleWindow.max;
	GroupWindow.close = CircleWindow.close;
	GroupWindow.submitRecord = CircleWindow.submitRecord;
	GroupWindow.onlineStatusChange = $.noop;
	// group加入新成员
	GroupWindow.addFriendComplete = function (data) {
		var me = this,
			len, names, ids, groupInfo;

		data = data || []; // 包含用户信息的数组
		len  = data.length;
		if (!len) {
			return;
		}
		K.log(['邀请数据：', data]);

		// 获得姓名和id列表array
		names = []; ids = [];
		$.each(data, function (i, item) {
			if (!me.member[item.uid]) {
				Controler.addUser(item);
				item = Controler.getUser(item.uid);

				me.member[item.uid] = item;
				ids.push(item.uid);
				names.push(item.name);
			}
		});

		len = ids.length;
		groupInfo = Controler.getGroup(this.id);
		// 都已包含，不用再邀请
		if (!len) {
			return;
		}
		else {
			if (groupInfo.ginfo.member + len > 100) {
				alert('群聊邀请失败！\n群聊成员最多100个，你还能再邀请' +
						(100 - groupInfo.ginfo.member) +
						'个人');
				return;
			}
		}

		$.post('/rgroup/aj_invite_tgroup.php', 
			{'uids': ids.join(' '), 'gid': me.id})
		.done(function (rep) {
			rep = $.parseJSON(rep);
			// 邀请失败提示
			if (rep.succ !== 1) {
				K.log('invite group none!', rep);
				return;
			}

			rep = rep.data;
			// 更新group数据
			groupInfo.ginfo.member = rep.member;
			groupInfo.ginfo.name = rep.name;

			// 更新标题
			me.updateTitle();
			// 将消息作为记录发布
			me.submitRecord(
				null, 
				'{#系统消息(TG_JOIN):' + Controler.getMine().real_name + '邀请' + names.join('、') + '加入群聊#}'
			);
			// 通知新邀请了人
			Controler.fire(Window.Events.InviteInGroup, {'gid': me.id});
		})
		.fail(function () {alert('Sorry. 邀请好友失败！\n可能是网络问题，请稍后再试。');K.log('invite group fail')});
	};



	// ---------Common-------
	// @param ajaxRequest jquery ajax请求对象
	// @param val 实际要显示到列表中的内容
	Common.dealWithSubmitRecord = function (me, ajaxRequest, val) {
		// 标记正在提交
		this.submitLock = true;

		$.when(ajaxRequest)
		// 提交成功
		.done(function (data) { // 返回数据：{cmid:12771,ctime:"",fileid:0,isread:0}
			if (!val) {return;}
			K.isString(data) ? data = $.parseJSON(data) : void 0;
			data.cmid ? void 0 : data = data.data; // group时返回结构不同

			// 解析html标记 
			val = val.replace(/([<>&])/g, function (w) { 
					var s = '';
					switch (w) {
					case '<':
						s = '&lt;'; break;
					case '>':
						s = '&gt;'; break;
					case '&':
						s = '&amp;'; break;
					}
					return s;
				});
			me.addRecord({
				'cmid':    data.cmid,
				'ctime':   data.ctime,
				'content': val,
				'uid':     Controler.getMine().uid
			});
			me.scrollRecords('bottom');
			
			// 复位
			me.sigil('winTextarea').val('');
			me.sigil('winInputLimit').hide();
		})
		// 提交失败
		.fail(function () {
			me.showTip('sendfail', Controler.getUser(me.id));
		})
		// 提交完成，修改提交锁定
		.then(function () {
			me.submitLock = false;
		});
	};



	// ==========================Template========================
	Template = {
		win:
'<div class="kxChatTabItem">' +
'	<div class="kxChatTabItem_toggle" data-sigil="winTab"></div>' +
'	<div class="kxChatMsgBox" data-sigil="winChat">' +
'		<div class="clearfix kxChatMsgBox_hd" data-sigil="winTitle">' +
'			{{=it.titleHtml}}' + 
'		</div>' +
		// 聊天列表
'		<div class="kxChatMsg kx_scrollAble" data-sigil="winItemWrap">' +
			// loading
'			<div class="kxChatLoadDiv tac" data-sigil="winChatLoading"><i class="ico_loading"></i></div>' +
'		</div>' +
'		<div class="kxChatMsgTipBox dn" data-sigil="winChatTip"></div>' +
'		<div class="kxChatPublish">' +
			// 输入区
'			<div class="kxChatPublish_typeWrap">' +
'				<div class="kxChatPublish_typeBox">' +
'					<textarea class="scrollAble" placeholder="说点什么吧..." data-sigil="winTextarea"></textarea>' +
'				</div>' +
'			</div>' +
			// 按钮区
'			<div class="clearfix kxChatPublish_ActionWrap">' +
'				<div class="kxChatPublish_ActionFunc">' +
'					<a href="#" class="kxPublishActionBtn" data-sigil="winButtonFace"><i class="kxChatBtn kxChatBtn_face"></i></a>' +
'					<a href="#" class="kxPublishActionBtn"><i class="kxChatBtn kxChatBtn_attachment"><i id="chatUploadFile_{{=it.id}}"></i></i></a>' +
'					{{if (it.useAddPerson) {}}' +
'					<a href="#" class="kxPublishActionBtn" data-sigil="winButtonAdd"><i class="kxChatBtn kxChatBtn_addUser"></i></a>' +
'					{{}}}' +
'				</div>' +
'				<div class="kxChatPublish_ActionSend">' +
'					<span class="kxChatPublish_tips"><i class="kxChatTips kxChatTips_error" style="display:none;" data-sigil="winInputLimit"></i></span>' +
'					<span class="kxbtn kxbtn_gray_s"><button class="normal" data-sigil="winButtonSubmit"><em><span><b><i>发送</i></b></span></em></button></span>' +
'				</div>' +
'			</div>' +
'		</div>' +
'	</div><!-- 聊天区域 END -->' +
'</div>',
		title: 
'<div class="kxChatMsgBox_hdMain">' +
'	{{if (it.type === 0) {}}' + // 单人
'		<a href="/home/{{=it.uid}}.html" class="kxChatAvatar" title="{{=it.title}}"><img src="{{=it.logo}}" alt=""/></a>&nbsp;' +
'		<a href="/home/{{=it.uid}}.html" class="sl2" title="{{=it.title}}">{{=it.longTitle}}</a>&nbsp;' +
'		<i class="ico_status ico_status_{{=it.online ? "online" : "offline"}}" data-sigil="winOnlineStatus"></i>' +
'	{{} else if (it.type === 1) {}}' + // 群聊
'		<img src="http://{{=K.Env.IMG_HOST}}/i2/chat/chatnew/icon_chatgroup_s.png" class="vm" alt=""/> <span title="{{=it.title}}">{{=it.longTitle}}</span>' +
'	{{} else if (it.type === 2) {}}' + // 圈子
'		<a href="/rgroup/index.php?gid={{=it.id.slice(0, -1)}}"><img src="http://{{=K.Env.IMG_HOST}}/i2/chat/chatnew/icon_chatcircle_s.png" class="vm" alt=""/></a>&nbsp;' +
'		<a href="/rgroup/index.php?gid={{=it.id.slice(0, -1)}}" class="sl2"><span title="{{=it.title}}">{{=it.longTitle}} <span class="c9">(<span data-sigil="winOnlineNumber">{{=it.onlineNumber || 0}}</span>/<span data-sigil="winTotalNumber">{{=it.totalNumber || 0}}</span>)</span></span></a>' +
'	{{}}}' +
'</div>' +
'<div class="kxChatMsgBox_hdFunc">' +
'	{{if (it.useQuit) {}}' +
'		<a href="#" class="kxChatBtn kxChatBtn_quit" title="退出群聊" data-sigil="winQuite"></a>' +
'	{{} else if (it.useForbid) {}}' +
'		<span class="kxChatMsgBox_hdTips" data-sigil="winForbidTip" style="display:none;"><i class="kxChatTips kxChatTips_warn"></i></span>' +
'		<a href="#" class="kxChatBtn kxChatBtn_block" title="屏蔽圈子" data-sigil="winForbid"></a>' +
'	{{}}}' +
'	<a href="#" class="kxChatBtn kxChatBtn_mini" title="最小化" data-sigil="winMin"></a>' +
'	<a href="#" class="kxChatBtn kxChatBtn_close" title="关闭" data-sigil="winClose"></a>' +
'</div>',

		tab:
'<span class="kxChatTabItem_toggleIn" title="{{=it.title}}">' +
'{{=it.shortTitle}}&nbsp;' +
'{{if (it.type === 0) {}}' + // 个人
'	<i class="ico_status ico_status_{{=it.online ? "online" : "offline"}}" data-sigil="winOnlineStatus"></i>&nbsp;' +
'{{} else if (it.type === 2) {}}' + // 圈子
'	<span class="c9">(<span data-sigil="winOnlineNumber">{{=it.onlineNumber || 0}}</span>/<span data-sigil="winTotalNumber">{{=it.totalNumber || 0}}</span>)</span>' +
'{{}}}' +
	// 无论哪个都需要显示新消息
'	<b class="kxChatNewMsgNum" data-sigil="winTabNew" {{=it.unread ? \'\' : \'style="display:none;"\'}}>{{=it.unread || 0}}</b>' +
'</span>',
		
		facePanel:
'<div class="kxChatPublish_faceBox dn" data-sigil="winFacePanel">' +
'	<b class="kxChatFaceArrow"></b>' +
'	<div class="kxChatFacePage">' +
'		<a rel="prev-page" href="#" title="上一页" class="kxChatFacePagePrev kxChatFacePagePrev_dis" data-sigil="winFacePrev"></a>' +
'		<a rel="next-page" href="#" title="下一页" class="kxChatFacePageNext" data-sigil="winFaceNext"></a>' +
'	</div>' +
'</div>',

		item:
'<div class="kxChatMsgItem{{=it.isMe ? " kxChatMsgItem_me" : ""}}">' +
'	<div class="kxChatMsgItem_user"><a href="/home/{{=it.uid}}.html" class="kxChatAvatar" title="{{=it.name}}"><img src="{{=it.logo}}" alt=""></a><b class="kxChatMsgArrow"><i></i></b></div>' +
'	<div class="kxChatMsgItem_txt">' +
'		<div>' +
			// 一般记录
'			{{if (!it.type) {}}' +
'				{{=it.content}}' +
			// 上传文件过程
'			{{} else if (it.type === "upload") {}}' +
'				上传文件：{{=it.uploadName}} <em data-uploadid="{{=it.uploadId}}">0</em>%' +
'			{{} else if (it.type === "attachment") {}}' +
'				<p class="hasAttachment">文件：{{=it.attachment.filename}} <a href="javascript:ChatDownloader({{=it.attachment.uid}}, {{=it.attachment.fileid}}, 1)" class="sl2">下载</a></p>' +
'			{{}}}' +
'		</div>' +
'	</div>' +
'</div>',

		tips: 
'{{if (it.type === "typing") {}}' +
'<span class="kxChatTips kxChatTips_tip" style="width:auto;">{{=it.real_name}}正在输入...</span>' +
'{{} else if (it.type === "offline") {}}' +
'<span class="kxChatTips kxChatTips_warn">对方已下线，聊天内容下次登录时会看到</span>' +
'{{} else if (it.type === "sendfail") {}}' +
'<span class="kxChatTips kxChatTips_error">给{{=it.real_name}}发送消息失败</span>' +
'{{}}}',

		sysmsg:
'<div class="kxChatMsgEvent"><span>{{=it.sysmsg}}</span></div>',

		time:
'<div class="kxChatMsgTime" data-sigil="winItemTime">{{=it.time}}</div>'


	};


	return Window;

});
