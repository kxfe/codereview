// vim: filetype=javascript
/**
 * @fileoverview 
 *    ���촰�ڶ���
 *    �ֳ�����type: person/group/circle
 * 
 * �ļ���ɣ�
     - Window �ǻ��������촰�ڸ��ֹ��ܺͽ���������
	 - PersonWindow/CircleWindow/GroupWindow ���������ʹ�������Ĵ������
	 - Common ��Ӧ�������ʹ�����Ҫ���õĲ��֣��ö�����ȫ������������������
	 �� Window �еĹ��ܶԲ�ͬ���ʹ��ڵĴ���һ��ʱ��ͨ�� adapter �������ݵ�ǰ�������Ͷ�̬ѡ�����Ĵ�������
	 sigil ����������������Ľڵ㣬��������Ψһ��һ������Ͳ��ٲ��ҡ�


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

		Window,             // �����ඨ�壬�ڲ���Ҫ��ͬ���ʹ���ʱ���� this.adapter ����
		CircleWindow = {},  // Ȧ��
		GroupWindow = {},   // Ⱥ��
		PersonWindow = {},  // ����
		Common = {},        // ���ִ��ڹ��÷���

		zIndex = 0,         // ÿ�����ڼ������zIndexֵ
		Template;           // ģ��




	//**********************************************
	//* ���촰��
	//**********************************************/
	/**
	 * ���촰���ඨ��
	 * @class Window
	 * @param {Object} config
	 */
	Window = function (config) {
		$.extend(this, {
				'id': 0,
				'type': Window.TYPE.PERSON,
				'container': 'body',
				'useQuit': false,     // Ⱥ���˳��Ի�
				'useAddPerson': true, // Ⱥ�ļ���
				'useForbid': false,   // Ȧ�ӽ�ֹ��Ϣ����
				'openFrom': Controler.getConf().openFrom.auto // ����Դ
			}, config);

		// ����Ƿ������ύ��
		this.submitLock = false;
		// �ϴ������¼�Ĵ���ʱ��
		this.lastRecordTime = 0;
		// ÿ�ζԻ����(ms)
		this._recordIntervalTime = 5 * 60 * 1000; 
		// typing���ʱ��
		this._typingIntervalTime = 30000;

		// template����
		this.template = {};
		$.each(Template, $.proxy(function (key, val) {
			this.template[key] = doT.template(val);
		}, this));

		// ��Ա��Ϣ��һ��ֻ��group���õ�
		// - appendHistory �洢��ʼ�ĳ�Ա��Ϣ
		// - addFriendComplete �洢ת��ʱ��������+�Լ�
		// - addFriendComplete �������ʱ����µĳ�Ա
		this.member = {}; 

		this.setAdapter(); // ������������ȷ�� this.adapter �����ö���

		this._init();
	};

	// ��Ϣ
	$.extend(Window, {
		// �¼�
		'Events': {
			'Close': 'chat:windowClose',
			'Min':   'chat:windowMin',
			'Open':  'chat:windowOpen',
			'QuiteGroup': 'chat:windowQuiteGroup',
			'CreateGroup': 'chat:windowCreateGroup',
			'InviteInGroup': 'chat:windowInviteInGroup'
		},
		// ����
		'TYPE': {
			'PERSON': 0,
			'GROUP':  1,
			'CIRCLE': 2
		}
	});

	/**
	 * Window��ʼ��
	 * @method _init
	 * @private
	 */
	Window.prototype._init = function () {
		// ����
		this.getWindowDom().sigil('winChat').hide();

		this._active();

		// ��ӽ���ʷ��¼
		this.appendHistory();

		// ע���¼�
		this._initEvent();

		// ����Ϣ�򿪵Ĵ��ڣ���������
		if (this.openFrom === Controler.getConf().openFrom.msg) {
			this.notify();
		}
		// ����ҳ��
		this._appendToDom();
		
		this._initUpload();

		// ��������
		Controler.addWindow(this);
	};

	/**
	 * ע���¼�
	 * @method _initEvent
	 * @private
	 */
	Window.prototype._initEvent = function () {
		this.sigil('root')
			// ��
			// _eOpen ��delegate��ʽ����ֱֹ�Ӱ󶨻��ȴ�����������Ӽ�����ֹð��
			.delegate(this.selector('winChat'), 'click', $.proxy(this._eOpen, this))
			// ���tab�� toggle���촰��
			.delegate(this.selector('winTab'), 'click', $.proxy(this._eToggleChat, this))
			// ��ֹrecords�ĵ���¼�
			.delegate(this.selector('winItemWrap'), 'click', $.proxy(this._eClickRecords, this))
			// �ر�
			.delegate(this.selector('winClose'), 'click', $.proxy(this._eClose, this))
			// ��С��
			.delegate([this.selector('winMin'), this.selector('winTitle')].join(','),
					  'click',
					  $.proxy(this._eMin, this))
			// �˳�Ȧ��
			.delegate(this.selector('winQuite'), 'click', $.proxy(this._eQuite, this))
			// ����Ȧ��
			.delegate(this.selector('winForbid'), 'click', $.proxy(this._eForbid, this))
			// ����
			.delegate(this.selector('winButtonFace'), 'click', $.proxy(this._eEmotionPanelShow, this))
			// �Ӻ���
			.delegate(this.selector('winButtonAdd'), 'click', $.proxy(this._eToggleAddFriend, this))
			// �ύ
			.delegate(this.selector('winButtonSubmit'), 'click', $.proxy(this._eSubmit, this))
			// ���������¼�
			.delegate(this.selector('winTextarea'), 'keydown', $.proxy(this._eTextareaKeydown, this))
			.delegate(this.selector('winTextarea'), 'input', $.proxy(this._eTextareaInput, this))
				// ie����ı�
			.delegate(this.selector('winTextarea'), 'propertychange', $.proxy(this._eTextareaInput, this));
	};

	/**
	 * �����ڲ���ҳ��
	 * @method _appendToDom
	 * @private
	 */
	Window.prototype._appendToDom = function () {
		this.sigil('root').appendTo($(this.container));
	};

	/**
	 * �¼�������
	 */
	// �ر�
	Window.prototype._eClose = function (evt) {
		this.adapter('close');
		this.close();
		evt.preventDefault();
		evt.stopPropagation();
	};
	// ��С��
	Window.prototype._eMin = function (evt) {
		var target = $(evt.target),
			href;
		target =  target.is('a') ?
				  target :
				  target.parentsUntil(this.sigil('winTitle'), 'a');
		href = target.attr('href');
		// �������������ת 
		if (!href || href === '#') {
			this.min();
			evt.preventDefault();
		}
		evt.stopPropagation();
	};
	// �˳�Ⱥ��
	Window.prototype._eQuite = function (evt) {
		if (confirm('ȷ��Ҫ�˳�Ⱥ����?')) {
			this.quit();
		}
		evt.preventDefault();
		evt.stopPropagation();
	};
	// ����Ȧ��
	Window.prototype._eForbid = function (evt) {
		var forbidClass = 'kxChatBtn_blockActived',
			btn = this.sigil('winForbid'),
			tip = this.sigil('winForbidTip'),
			text = tip.children('i'),
			v = 0;

		// ȡ���ϴλ���
		clearTimeout(this._circleForbidTimer);

		// ��
		if (btn.hasClass(forbidClass)) {
			btn.removeClass(forbidClass);
			text.text('��ʱ��Ϣ�ѱ���');
			v = 0;
		}
		// �ر�
		else {
			btn.addClass(forbidClass);
			text.text('��ʱ��Ϣ�ѱ��ر�');
			v = 1;
		}

		// �������ý��
		Controler.setForbidCircle(this.id, v);
		$.post('/rgroup/aj_member_setting.php', {
				'gid':  this.id,
				'setting[forbid_imsg]': v
			});
		K.log('���ü�ʱ��Ϣ�رգ�' + Controler.getForbidCircle(this.id));

		// ����չʾ��������ʧ
		tip.fadeIn('fast');
		this._circleForbidTimer = setTimeout(function () {
				tip.fadeOut();
			}, 2000);

		evt.preventDefault();
		evt.stopPropagation();
	};
	// ��
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
	// records����¼���ֹĬ����Ϊ
	Window.prototype._eClickRecords = function (evt) {
		evt.preventDefault();
	};
	// �ύ
	Window.prototype._eSubmit = function (evt) {
		this.submitRecord();

		evt.preventDefault();
	};
	// ��������¼�
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
				.html((diff < 0 ? '�ѳ���' + Math.abs(diff) : '��������' + diff) + '����')
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
	// �������� 
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
			// ���뻥����ʾ
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
			
			// ���������
			emotion.bind(EmoticonControl.Events.inserted, function (data) {
				emotion.hide();
				me.checkInputLimit();
			});
			// ���鷭ҳ
			this.sigil('winFacePrev').click(function(){emotion.prevPage();});
			this.sigil('winFaceNext').click(function(){emotion.nextPage();});

			this._emotionPanel = emotion;
		}

		this.sigil('winTextarea').blur();
		emotion.toggle();
		
		evt.preventDefault();
	};

	// ��ʼ���ϴ�
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
			K.log('uploader: ' + e.file.name + '������У�' );
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
				'uploadId': uploadPercentId // �ٷֱȱ仯Ԫ���ر���
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
					.html('�ļ���' + evt.file.name + ' ���ͳɹ�');
			}
			me.submitRecord(K.mix(evt.file, {
				// ������fileidֵ
				'fileid': evt.serverData.match(/(?:\("(?:\d+:)*)(\d+)(?:"\))/)[1]
			}), 'upload success');
			uploadPercentDom = uploadPercentId = void 0;
		});
		uploader.on('upload_error', function (evt) {
			K.log(['uploader: error ', evt, evt.errorCode]);
			if (uploadPercentDom) {
				uploadPercentDom.parent()
					.html('�ļ���' + evt.file.name + ' ����ʧ��');
			}
			uploadPercentDom = uploadPercentId = void 0;
		});

	};
	// �����л�
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

			// �ر�ʱ���л�textarea��ʾ
			suggest.on(Suggest.Events.CloseAddFriendPanel, function () { input.show(); });
			// ���˳ɹ�ʱ
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
	 * ���򿪴��ڣ�û����������
	 */
	Window.prototype.max = function () {
		if (!this.isOpen()) {
			this.sigil('winChat').show();
			this.scrollRecords('bottom');
			this.adapter('max');
		}
	};
	/**
	 * �򿪴��ڣ������򿪡�����
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
		// �������ʱ���������껹ͣ����input�У�
		// �����¼�ð�ݵ������津���÷������Ի������
		// �����ϰ������ڲ����Զ���λ��input��
		//this.sigil('winTextarea').focus();

		// ����Ƿ���Ҫ�˳�
		setTimeout($.proxy(function () {
			if (/T/.match(this.id)) {
				if (Controler.getGroup(this.id).ginfo.member < 2) {
					alert( '������Ա��ȫ���˳�Ⱥ�ģ�Ⱥ�ļ����رա�' );
					this.quit();
				}
			}
		}, this), 50);
	};
	/**
	 * �رմ���
	 * @method close
	 */
	Window.prototype.close = function () {
		// ����ע����¼�
		this.sigil('root').undelegate();
		// �Ƴ�dom�ڵ�
		this.sigil('root').remove();

		Controler.fire(Window.Events.Close, this);
	};
	/**
	 * ��С������
	 */
	Window.prototype.min = function () {
		this.adapter('min');
		this.sigil('winChat').hide();
		Controler.fire(Window.Events.Min, this);
	};

	/**
	 * ����
	 * @method _active
	 * @private
	 */
	Window.prototype._active = function () {
		this.setStyle({'z-index': ++zIndex});
	};
	/**
	 * �Ƿ񼤻�״̬��ͬʱ�����Ǵ򿪵�
	 * @method isActive
	 * @return {Boolean}
	 */
	Window.prototype.isActive = function () {
		return this.isOpen() &&
			   this.sigil('root').css('z-index') >> 0 === zIndex;
	};

	/**
	 * �Ƿ�򿪣���ָ�б��Ƿ�չ����������active״̬
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
			'content': '{#ϵͳ��Ϣ(TG_QUIT):' + Controler.getMine().real_name + '�˳�Ⱥ��#}',
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
	 * ��ȡwindowdomԪ��
	 * @method getWindowDom
	 * @return {jQuery Dom} win ����jquery dom����
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
	 * ������ʽ��ͨ����λ�á�zIndex
	 * @method setStyle
	 * @param {Object} obj ��ʽ����
	 */
	Window.prototype.setStyle = function (obj) {
		this.getWindowDom().css(obj);
	};

	/**
	 * ��ӶԻ���¼
	 * @method addRecord
	 * @param {Object} record 
	 		{
				uid: record�������˵�id
				content: ����
				time: ����ʱ��
			}
	 */
	Window.prototype.addRecord = function (record) {
		var user = Controler.getUser(record.uid),
			resultHtml = '',
			sysReg = /^{#[^:]*:(.+)#}$/;

		// ϵͳ֪ͨ
		if (sysReg.test(record.content)) {
			record.type = 'info';
			record.content = this.template.sysmsg({'sysmsg': record.content.replace(sysReg, '$1')});
		}

		// ���ˡ��˳�
		if (record.type === 'info') {
			// ���˳���֪ͨ���н���
			resultHtml = record.content;
		}
		else {
			this.checkRecordTime(record.ctime);

			K.mix(record, {
				'name': user.real_name,
				'logo': user.logo || '',
				'isMe': Controler.isMine(record.uid)
			});

			// ����
			if (record.attachment) {
				record.type = 'attachment';
				// �ı��СΪת�����ֵ
				record.attachment.size = Controler.getFileSize(record.attachment.size);
			}
			// һ������
			else {
				record.content = record.content
					// ��������
					.replace(/\n+/g, function (c) {
						return c.length > 1 ? '<br/><br/>' : '<br/>';
					})
					// ��������: (#����)��//smile��:), :(
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
	 * �����ʷ��¼
	 * @method appendHistory
	 *   history��ʽ��
	 		{
				msgs:[],
				online: 1
			}
	     msg��ʽ��
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
	 * ���������¼��ĳ��λ�ã�Ĭ���ǵײ�
	 * @method scrollRecords
	 * @param {String} pos ָ��λ�ã�Ĭ���ǡ�bottom��
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
	 * �ύ�����¼
	 * @method submitRecord
	 * @method recordContent �ύ������
	 */
	Window.prototype.submitRecord = function (file, recordContent) {
		// Ĭ�Ϸ�������Ϊ�ı����е�����
		if (!recordContent) {
			recordContent = $.trim(this.sigil('winTextarea').val());
		}
		
		// �մ�����ִ��
		if (recordContent) {
			this.adapter(
				'submitRecord',
				file,
				recordContent.slice(0, Controler.getConf().maxWords)
			);
		}
	};
	/**
	 * ��������
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

		// ������ʾ
		if (!Controler.getForbidSound()) {
			Controler.makeSound();
		}
		K.log('���ѣ�----������Ϣ��----');
	};
	/**
	 * �Ƿ���������
	 */
	Window.prototype.isInNotify = function () {
		var notifyClass = 'kxChatNewMsgBg';
		return this.sigil('winTab').hasClass(notifyClass) ||
				this.sigil('winTitle').hasClass(notifyClass);
	};

	/**
	 * ������ѱ�ʶ
	 * @method clearNotify
	 */
	Window.prototype.clearNotify = function () {
		var notifyClass = 'kxChatNewMsgBg';

		this.sigil('winTitle').removeClass(notifyClass);
		this.sigil('winTab').removeClass(notifyClass);
		this.sigil('winTabNew').html('0').hide();
	};

	/**
	 * �������յ�����Ϣ
	 * @method dealNewMsg
	 * @param {Object} info ����Ϣ����
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
	 * ��ʾ�������ʹ�����ʾ
	 * @method showTip
	 * @param {String} type ��ʾ����
	 *     typing��offline��sendfail
	 * @param {Object} data ��Ҫ��������Ϣ
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
	 * ����״̬�ı�
	 * @param {Array} users ״̬�ı���û���Ϣ
	 */
	Window.prototype.onlineStatusChange = function (users) {
		this.adapter('onlineStatusChange', users);
	};

	/**
	 * ����¼ʱ��
	 * @method checkRecordTime
	 * @param {String} time Ҫ����ʱ���ʾ
	 *     - 2012-11-19 12:34:53
	 *     - 08-14 23:32:43
	 *  �����
	 *     - �����ڣ���ǰ�졢���졢�����ʾ
	 *     - ͬһ���ڣ������ڼ���ʾ
	 *     - ͬ���ڲ���ʾ��
	 *     - �����������������ձ�ʾ
	 */
	Window.prototype.checkRecordTime = function (time) {
		var t, now, dayDiff;

		// ����time
		if (K.isString(time)) {
			t = time.replace(
				/(?:(\d{2,4})-)?(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})/g,
				function (str, y, m, d, H, M, S) {
					var date = new Date();
					// y���ڲ�����
					if (y) {
						date.setFullYear(y.length === 4 ? y : '20' + y); // ��������Ч:P
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

			// ���ϴμ�¼�ȣ�ʱ���㹻������Ҫ���ʱ��
			t = new Date(t - 0);
			if (t - this.lastRecordTime >= this._recordIntervalTime) {
				this.addRecord({
					'type': 'info',
					'content': this.template.time({'time': getDateStr(t)})
				})
				this.lastRecordTime = t;
			}
		}

		// �õ�һ�����ڵ��ַ�����ʾ
		function getDateStr(d) {
			var n = new Date(),
				result = 'yyyy-MM-dd',
				weekDay, dateDiff;
				
			if (n.getFullYear() === d.getFullYear()) {// ͬ��
				result = 'MM-dd';
				if (n.getMonth() === d.getMonth() && // ͬ��
					(dateDiff = n.getDate() - d.getDate()) < 7) { // 7����

					weekDay = [7,1,2,3,4,5,6];
					// ������
					if (dateDiff < 3) {
						result = ['����', '����', 'ǰ��'][dateDiff];
					}
					// ����ͬһ��
					else if (weekDay[n.getDay()] > weekDay[d.getDay()]) {
						result = '����' + ['��','һ','��','��','��','��','��'][d.getDay()];
					}
				} // 7����
			} // һ��

			return K.formatDate(d, result + ' hh:mm:ss');
		}
	};
	/**
	 * ���ݵ�ǰ���ڵ���Ϣ�����±���
	 */
	Window.prototype.updateTitle = function () {
		var data = this._getTitleData();

		this.sigil('winTitle').html(this.template.title(data));
		// tab����
		this.sigil('winTab').html(this.template.tab($.extend(data, {
			'unread': 0
		})));
	};
	Window.prototype._getTitleData = function () {
		// title�Ļ�������
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
	 * ��������������ʼ��ʱ�ı�һ�Σ���ΪȺ��ʱ�ٸı�
	 * @method setAdapter
	 * @private
	 */
	Window.prototype.setAdapter = function () {
		var name, obj;

		switch (this.type) {
		// Ȧ��
		case Window.TYPE.CIRCLE:
			obj = CircleWindow;
			name = 'CircleWindow';
			break;
		// Ⱥ��
		case Window.TYPE.GROUP:
			obj = GroupWindow;
			name = 'GroupWindow';
			break;
		// ����
		case Window.TYPE.PERSON:
			obj = PersonWindow;
			name = 'PersonWindow';
			break;
		}

		// @param {String} funcName ������
		// @param {Array} args ԭ����
		// @return ��������ִ�н������
		this.adapter = $.proxy(function (funcName) {
			var func;
			if (K.isString(funcName)) {
				func = obj[funcName];
				if (func && K.isFunction(func)) {
					return func.apply(this, [].slice.call(arguments, 1));
				}
				else {
					K.error('Adapter Error��can not find the method `' + funcName + '` in [' + name + ']');
					return false;
				}
			}
		}, this);
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
	Window.prototype.selector = function (sigil) {
		return '[data-sigil=' + sigil + ']';
	};
	/**
	 * ��ȡdata-sigil��ʽ�Ķ���
	 *   - root �Ǹ�Ŀ¼�����ƣ�*��������*
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
	Window.prototype.sigil = function (sigil, context, isExecSet) {
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



	// ========================Adapter==============================
	// -----PersonWindow----
	// �õ���������
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
	// �����ʷ��¼
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
			// loading����
			me.sigil('winChatLoading').hide();
			// ���������¼
			history = K.isString(history) ? $.parseJSON(history) : history;
			K.log(['person ��ȡ�������history', history]);
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
			// ������ļ����ͳɹ�
			if (file) {
				val = '';
				opts.fileid = file.fileid;
			}
			else {
				opts.content = val;
			}
			// �ύ����
			if (file || val) { // ��������һ����Ϊ��
				Common.dealWithSubmitRecord(me, $.post('/chat/send.php', opts), val);
			}
		}
	};
	// ��һ��һ������ɺ��ΪȺ��
	PersonWindow.addFriendComplete = function (data) {
		var me = this,
			len, cur, names, ids;

		data = data || []; // �����û���Ϣ������
		len  = data.length;
		if (!len) {
			return;
		}
		else if (len >= 99) {
			if (!(len === 99 && K.some(data, function (d) {return d.uid == this.id;}))) {
				alert( '����Ⱥ��ʧ�ܣ�\nȺ�����ֻ�����99��' );
				return;
			}
		}
		K.log(['�������ݣ�', data]);

		// ���������id�б�array
		names = []; ids = [];
		Controler.addUser(data);
		$.each(data, function (i, item) {
			item = Controler.getUser(item.uid);
			// ��ӵ���Ա��
			if (!me.member[item.uid]) {
				me.member[item.uid] = item;
				ids.push(item.uid);
				names.push(item.name);
			}
		});
		// idsҪ���ϵ�ǰ�Ի���
		if (!me.member[me.id]) {
			cur = Controler.getUser(me.id);
			// ��ӵ���Ա��
			me.member[cur.uid] = cur;
			ids.push(cur.uid);
			names.push(cur.real_name);
		}

		// ת���������ͣ�����Ⱥ��
		$.post('/rgroup/aj_create_tgroup.php', 
			{'uids': ids.join(' '), 'chatid': Controler.getChatId()})
		.done(function (rep) {
			rep = $.parseJSON(rep);
			// ����ʧ����ʾ
			if (rep.succ !== 1) {
				K.log('���󴴽�Ⱥ�ĳɹ������ǣ�Sorry, ����ʧ�ܣ�', rep);
				return;
			}

			rep = rep.data;
			me.id = rep.gid;
			me.type = Window.TYPE.GROUP;
			me.useQuit = true;
			// �洢group���ݵ�DS�����ʼ���ؽṹ����һ��
			Controler.addGroup($.extend(rep, {'ginfo': {
					'gid': rep.gid.slice(0, -1),
					'mtime': rep.ctime,
					'name': rep.name,
					'member': rep.member
				}}));
			// ����adapter
			me.setAdapter();

			// ���±���
			me.updateTitle();
			// ���ԭ�е������¼
			me.sigil('winItemWrap')
				.children().remove()
				.end()
				.append(me.sigil('winChatLoading'));

			// �����˴�����Ϣ��Ϊ�����һ����¼����
			// ��ΪȺ�ĵĵ�һ��
			me.submitRecord(
				null, 
				'{#ϵͳ��Ϣ(TG_JOIN):' + Controler.getMine().real_name + '����' + names.join('��') + '����Ⱥ��#}'
			);
			// ֪ͨ�´�����һ������
			Controler.fire(Window.Events.CreateGroup, {'gid': me.id});
		})
		.fail(function (rep) {K.log('����Ⱥ��ʧ�ܣ�', rep)});
	};
	PersonWindow.onlineStatusChange = function (users) {
		var me = this,
			otherone;

		otherone = K.detect(users, function (u, i) {return u.uid == me.id;});
		if (otherone) {
			// �ı�����״̬
			me.sigil('root').find(me.selector('winOnlineStatus'))
				.removeClass('ico_status_online ico_status_offline')
				.addClass('ico_status_' + (otherone.online ? 'online' : 'offline'));
			// ��ʾ
			if (otherone.online) {
				me.hideTip();
			}
			else {
				me.showTip('offline'); // �Է�����
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
			// loading����
			me.sigil('winChatLoading').hide();
			// ���������¼
			history = K.isString(history) ? $.parseJSON(history) : history;
			if (history.succ === 1) {
				K.log(['�� ��ȡ�������history', history]);
				history = history.data;
				// ������û�
				Controler.addUser(history.users);
				$.each(history.users, function (k, u) {
					u = Controler.getUser(u.uid);
					me.member[u.uid] = u;
					totalNumber += 1;
					onlineNumber += u.online ? 1 : 0;
				});
				// ���³�Ա��Ŀ��ʾ
				me.sigil('root')
					.find(me.selector('winOnlineNumber')).text(onlineNumber)
					.end()
					.find(me.selector('winTotalNumber')).text(totalNumber);
				// ��������¼
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
			// ������ļ��ϴ��ɹ�
			if (file) {
				val = '';
				opts.fileid = file.fileid;
			}
			else {
				// ��������ݴ���
				opts.content = val;
			}
			// �ύ����
			if (file || val) {
				Common.dealWithSubmitRecord(this, $.post('/rgroup/aj_chat_send.php', opts), val);
			}
		}
	};
	// online״̬�Ѿ���Controler���޸ġ�member������DS�еı���ͬһ������
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
			suffix = '...��',
			num = info.ginfo.member + '��';
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
	// group�����³�Ա
	GroupWindow.addFriendComplete = function (data) {
		var me = this,
			len, names, ids, groupInfo;

		data = data || []; // �����û���Ϣ������
		len  = data.length;
		if (!len) {
			return;
		}
		K.log(['�������ݣ�', data]);

		// ���������id�б�array
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
		// ���Ѱ���������������
		if (!len) {
			return;
		}
		else {
			if (groupInfo.ginfo.member + len > 100) {
				alert('Ⱥ������ʧ�ܣ�\nȺ�ĳ�Ա���100�����㻹��������' +
						(100 - groupInfo.ginfo.member) +
						'����');
				return;
			}
		}

		$.post('/rgroup/aj_invite_tgroup.php', 
			{'uids': ids.join(' '), 'gid': me.id})
		.done(function (rep) {
			rep = $.parseJSON(rep);
			// ����ʧ����ʾ
			if (rep.succ !== 1) {
				K.log('invite group none!', rep);
				return;
			}

			rep = rep.data;
			// ����group����
			groupInfo.ginfo.member = rep.member;
			groupInfo.ginfo.name = rep.name;

			// ���±���
			me.updateTitle();
			// ����Ϣ��Ϊ��¼����
			me.submitRecord(
				null, 
				'{#ϵͳ��Ϣ(TG_JOIN):' + Controler.getMine().real_name + '����' + names.join('��') + '����Ⱥ��#}'
			);
			// ֪ͨ����������
			Controler.fire(Window.Events.InviteInGroup, {'gid': me.id});
		})
		.fail(function () {alert('Sorry. �������ʧ�ܣ�\n�������������⣬���Ժ����ԡ�');K.log('invite group fail')});
	};



	// ---------Common-------
	// @param ajaxRequest jquery ajax�������
	// @param val ʵ��Ҫ��ʾ���б��е�����
	Common.dealWithSubmitRecord = function (me, ajaxRequest, val) {
		// ��������ύ
		this.submitLock = true;

		$.when(ajaxRequest)
		// �ύ�ɹ�
		.done(function (data) { // �������ݣ�{cmid:12771,ctime:"",fileid:0,isread:0}
			if (!val) {return;}
			K.isString(data) ? data = $.parseJSON(data) : void 0;
			data.cmid ? void 0 : data = data.data; // groupʱ���ؽṹ��ͬ

			// ����html��� 
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
			
			// ��λ
			me.sigil('winTextarea').val('');
			me.sigil('winInputLimit').hide();
		})
		// �ύʧ��
		.fail(function () {
			me.showTip('sendfail', Controler.getUser(me.id));
		})
		// �ύ��ɣ��޸��ύ����
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
		// �����б�
'		<div class="kxChatMsg kx_scrollAble" data-sigil="winItemWrap">' +
			// loading
'			<div class="kxChatLoadDiv tac" data-sigil="winChatLoading"><i class="ico_loading"></i></div>' +
'		</div>' +
'		<div class="kxChatMsgTipBox dn" data-sigil="winChatTip"></div>' +
'		<div class="kxChatPublish">' +
			// ������
'			<div class="kxChatPublish_typeWrap">' +
'				<div class="kxChatPublish_typeBox">' +
'					<textarea class="scrollAble" placeholder="˵��ʲô��..." data-sigil="winTextarea"></textarea>' +
'				</div>' +
'			</div>' +
			// ��ť��
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
'					<span class="kxbtn kxbtn_gray_s"><button class="normal" data-sigil="winButtonSubmit"><em><span><b><i>����</i></b></span></em></button></span>' +
'				</div>' +
'			</div>' +
'		</div>' +
'	</div><!-- �������� END -->' +
'</div>',
		title: 
'<div class="kxChatMsgBox_hdMain">' +
'	{{if (it.type === 0) {}}' + // ����
'		<a href="/home/{{=it.uid}}.html" class="kxChatAvatar" title="{{=it.title}}"><img src="{{=it.logo}}" alt=""/></a>&nbsp;' +
'		<a href="/home/{{=it.uid}}.html" class="sl2" title="{{=it.title}}">{{=it.longTitle}}</a>&nbsp;' +
'		<i class="ico_status ico_status_{{=it.online ? "online" : "offline"}}" data-sigil="winOnlineStatus"></i>' +
'	{{} else if (it.type === 1) {}}' + // Ⱥ��
'		<img src="http://{{=K.Env.IMG_HOST}}/i2/chat/chatnew/icon_chatgroup_s.png" class="vm" alt=""/> <span title="{{=it.title}}">{{=it.longTitle}}</span>' +
'	{{} else if (it.type === 2) {}}' + // Ȧ��
'		<a href="/rgroup/index.php?gid={{=it.id.slice(0, -1)}}"><img src="http://{{=K.Env.IMG_HOST}}/i2/chat/chatnew/icon_chatcircle_s.png" class="vm" alt=""/></a>&nbsp;' +
'		<a href="/rgroup/index.php?gid={{=it.id.slice(0, -1)}}" class="sl2"><span title="{{=it.title}}">{{=it.longTitle}} <span class="c9">(<span data-sigil="winOnlineNumber">{{=it.onlineNumber || 0}}</span>/<span data-sigil="winTotalNumber">{{=it.totalNumber || 0}}</span>)</span></span></a>' +
'	{{}}}' +
'</div>' +
'<div class="kxChatMsgBox_hdFunc">' +
'	{{if (it.useQuit) {}}' +
'		<a href="#" class="kxChatBtn kxChatBtn_quit" title="�˳�Ⱥ��" data-sigil="winQuite"></a>' +
'	{{} else if (it.useForbid) {}}' +
'		<span class="kxChatMsgBox_hdTips" data-sigil="winForbidTip" style="display:none;"><i class="kxChatTips kxChatTips_warn"></i></span>' +
'		<a href="#" class="kxChatBtn kxChatBtn_block" title="����Ȧ��" data-sigil="winForbid"></a>' +
'	{{}}}' +
'	<a href="#" class="kxChatBtn kxChatBtn_mini" title="��С��" data-sigil="winMin"></a>' +
'	<a href="#" class="kxChatBtn kxChatBtn_close" title="�ر�" data-sigil="winClose"></a>' +
'</div>',

		tab:
'<span class="kxChatTabItem_toggleIn" title="{{=it.title}}">' +
'{{=it.shortTitle}}&nbsp;' +
'{{if (it.type === 0) {}}' + // ����
'	<i class="ico_status ico_status_{{=it.online ? "online" : "offline"}}" data-sigil="winOnlineStatus"></i>&nbsp;' +
'{{} else if (it.type === 2) {}}' + // Ȧ��
'	<span class="c9">(<span data-sigil="winOnlineNumber">{{=it.onlineNumber || 0}}</span>/<span data-sigil="winTotalNumber">{{=it.totalNumber || 0}}</span>)</span>' +
'{{}}}' +
	// �����ĸ�����Ҫ��ʾ����Ϣ
'	<b class="kxChatNewMsgNum" data-sigil="winTabNew" {{=it.unread ? \'\' : \'style="display:none;"\'}}>{{=it.unread || 0}}</b>' +
'</span>',
		
		facePanel:
'<div class="kxChatPublish_faceBox dn" data-sigil="winFacePanel">' +
'	<b class="kxChatFaceArrow"></b>' +
'	<div class="kxChatFacePage">' +
'		<a rel="prev-page" href="#" title="��һҳ" class="kxChatFacePagePrev kxChatFacePagePrev_dis" data-sigil="winFacePrev"></a>' +
'		<a rel="next-page" href="#" title="��һҳ" class="kxChatFacePageNext" data-sigil="winFaceNext"></a>' +
'	</div>' +
'</div>',

		item:
'<div class="kxChatMsgItem{{=it.isMe ? " kxChatMsgItem_me" : ""}}">' +
'	<div class="kxChatMsgItem_user"><a href="/home/{{=it.uid}}.html" class="kxChatAvatar" title="{{=it.name}}"><img src="{{=it.logo}}" alt=""></a><b class="kxChatMsgArrow"><i></i></b></div>' +
'	<div class="kxChatMsgItem_txt">' +
'		<div>' +
			// һ���¼
'			{{if (!it.type) {}}' +
'				{{=it.content}}' +
			// �ϴ��ļ�����
'			{{} else if (it.type === "upload") {}}' +
'				�ϴ��ļ���{{=it.uploadName}} <em data-uploadid="{{=it.uploadId}}">0</em>%' +
'			{{} else if (it.type === "attachment") {}}' +
'				<p class="hasAttachment">�ļ���{{=it.attachment.filename}} <a href="javascript:ChatDownloader({{=it.attachment.uid}}, {{=it.attachment.fileid}}, 1)" class="sl2">����</a></p>' +
'			{{}}}' +
'		</div>' +
'	</div>' +
'</div>',

		tips: 
'{{if (it.type === "typing") {}}' +
'<span class="kxChatTips kxChatTips_tip" style="width:auto;">{{=it.real_name}}��������...</span>' +
'{{} else if (it.type === "offline") {}}' +
'<span class="kxChatTips kxChatTips_warn">�Է������ߣ����������´ε�¼ʱ�ῴ��</span>' +
'{{} else if (it.type === "sendfail") {}}' +
'<span class="kxChatTips kxChatTips_error">��{{=it.real_name}}������Ϣʧ��</span>' +
'{{}}}',

		sysmsg:
'<div class="kxChatMsgEvent"><span>{{=it.sysmsg}}</span></div>',

		time:
'<div class="kxChatMsgTime" data-sigil="winItemTime">{{=it.time}}</div>'


	};


	return Window;

});
