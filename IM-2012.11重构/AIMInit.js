// vim: filetype=javascript
/**
 * @fileoverview 
 *    ҳ����IM��ʼ���ļ�
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
			// ���������ڶ��󴫵ݸ�Controler
			Controler.setConstructor({'List': List, 'Window': Window});
			// ��ʼ�¼�����
			Controler.subscribeMessage();

			// ����bar
			this.initChatBar();

			// �����б�����
			$.when(
					this.loadAllUsers(),
					this.loadListInfo(),
					this.loadRecentUsers()
				)
			.done($.proxy(this.dealWithData, this))
			.fail(function () {
					alert('Sorry, ��ȡ�û�����ʧ�ܣ�');
				});

            //��ʼ��AppList
            BarAppList.ins().init({'appTab': this.sigil('barAppListContainer')});
		},
		
		/**
		 * �������к���
		 */
		'loadAllUsers': function () {
			var dfd = $.Deferred(),
				data = Kx.SuggestionDatabase.data;
			if (data) {
				dfd.resolve(data);
			}
			else {
				// ��ȡ���µ����к���
				// ���������� /js/Kx_Suggestion.js ��
				Kx.SuggestionDatabase.get(function (succ, data) {
					if (succ) {
						dfd.resolve(data);
					}
				});
			}
			return dfd.promise();
		},
		/**
		 * ���س�ʼ��ǰ������
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
		 * ���������ϵ��
		 */
		'loadRecentUsers': function () {
			var dfd = $.Deferred();
			$.post('/interface/recentcontacts.php', function (data) {
				dfd.resolve(data);
			}, 'json');
			return dfd.promise();
		},

		/**
		 * ��ʼ����һ����������
		 * @param {Object|String} imInfo �����б���Ϣ 
		 */
		'dealWithData': function (allUsers, imInfo, recentUsers) {
			var imp, cookieInfo;
			K.log(['��ʼ����: ',
				'allUsers: ', allUsers,
				'imList: ', imInfo,
				'recentUsers: ', recentUsers]);
			// ��������Դ
			Controler.setMine(imInfo.mystatus);
			Controler.addUser(imInfo.buddylist);
			// ���к��ѹ��ˣ���ϵֻ��ֵΪ3(�໥��ע)
			Controler.addUser(K.filter(allUsers.users, function (u) {return u.rel === 3;}));
			Controler.setChatId(imInfo.chatid);
			Controler.setForbidSound(!!imInfo.forbidsound);
			Controler.setForbidAlert(!!imInfo.mystatus.stnotice);
			Controler.setUploadVerify(imInfo.upload.verify);

			Controler.addCircle(imInfo.groups);
			Controler.addGroup(imInfo.tgroups);
			Controler.addRecentUsers(recentUsers);
			// ����δ����
			// ����
			K.forEach(imInfo.messages.fusers, function (uid) {
				Controler.addUnread(uid, imInfo.messages.fmsgs[uid].msgs);
			});
			// Ȧ��
			K.forEach(imInfo.gunreads, function (unread, gid) {
				// unread: {chat:14,talk:100}
				Controler.addUnread(gid, unread);
			});
			// Ⱥ��
			K.forEach(imInfo.tunreads, function (unread, gid) {
				Controler.addUnread(gid, unread);
			});


			// ʹ��IMPoller�ܹ�ʵ�ֱ��ص���Ϣͬ��(��Tab��ֻά��һ��������)
			imp = new IMPoller({
				'callback': function (data) {
					// ȫ�ֹ㲥(��ҳ���е�����APPʹ�ã�
					// ������������ǰ�����poll�����Ƴ�IM����Ϊ��ҳ�湫�õ�)
					// ����ͬ��ʱ�Ż����
					K.fire('msg:poll_ok', data, true);
				}
			});
			imp.start();


			// ����cookie����
			cookieInfo = Controler.getStatusFromCookie() || {};
			// ��ʼ��IMList
			List = List.getInstance({
					'container': this.sigil('barListWrap'),
					'statusInfo': cookieInfo.list || {}});
			// �������촰�ڵ�����
			Controler.setWindowContainer(this.sigil('barChatTabs'));
			// ����cookie���ݴ򿪴���
			Controler.createWindowBaseOnCookie(cookieInfo.win || []);
		},


		/**
		 * ��ʼ��bar
		 * @method initChatBar
		 */
		initChatBar: function () {
			var bar = $(TmplBar),
				me = this;

			this.sigil('root', bar, true);

			this.resizePosition();
			jqBody.append(bar);
			
			// ���ݴ��ڱ仯����bar
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
		 * ���¼���bar��λ��
		 * @method resizePosition
		 */
		resizePosition: function () {
			var bar = this.sigil('root'),
				listWrap = this.sigil('barListWrap'),

				// ҳ���������ƣ�����Ҫ�ŵ� body ��
				activeClass = 'chatUserListActived',
				// list���ڴ����Ҳ�ʱ��Ҫ��wrap������������
				inBarClass = 'kxChatUserListWrap_inBar',

				windowWidth = jqWindow.width(),
				right;
			
			// ie6 ��Ӧ���ڱ仯ʱ�Ķ�λ
			if (K.Browser.ie6) {
				bar.css('bottom', -jqWindow.scrollTop());
			}
			// ���ݴ��ڴ�С����list��λ��
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
					right = right < 0 ? 0 : right; // ���ڹ�Сʱ
				}
				bar.css({'left': 'auto', 'right': right + 1});
			}
		},

		/**
		 * �õ�selector
		 * �����������õ���[data-sigil=...]��ʽ
		 *
		 * @method selector
		 * @private
		 * @param {String} sigil ��������
		 * @return {String} ��ϳɵ�ѡ���
		 */
		selector: function (sigil) {
			return '[data-sigil=' + sigil + ']';
		},
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
		sigil: function (sigil, context, isExecSet) {
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
		}


	};




	TmplBar = 
'<div class="kxChatBar">' +
'    <div class="kxChatBarIn">' +
'        <div class="kxChatApp"><!-- App�б� -->' +
'            <div class="kxChatAppBox" data-sigil="barAppListContainer">�ҵ�Ӧ��</div>' +
'        </div>' +
'        <!-- ���������� -->' +
'        <div class="kxChatMain">' +
'            <div class="clearfix kxChatMainIn">' +
'                <div class="kxChatUserListWrap" data-sigil="barListWrap"></div>' +
'                <div class="kxChatTabs" data-sigil="barChatTabs"><!-- tab�б� --></div>' +
'            </div>' +
'        </div>' +
'        <!-- ���������� END -->' +
'    </div>' +
'</div>';



	return Handler;

});
