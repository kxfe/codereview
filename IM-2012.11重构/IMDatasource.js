// vim: filetype=javascript
/**
 * @fileoverview 
 *    Datasource
 * @author  linfei@corp.kaixin001.com
 * @date    2012/10/26
 *
 */
define('apps/im/IMDatasource', ['jQuery'], function (require) {

	var $ = require('jQuery'),
		// ��ʼ����
		Conf = {},
		// ������Դ�洢
		ds = {},
		// ���صĽ��
		DControler;
	
	// �����ʼ����
	K.mix(Conf, {
		// ��󴰿���
		'maxWindowNumber': 3,
		// �������
		'maxWords': 2000,
		// ״̬������cookie�е�����
		'statusCookieName': 'im',
		// ����״̬
		'onlineStatus': [
			'offline',   // 0 offline
			'online',    // 1 web online
			'waponline', // 2 wap online
			'tvonline',  // 3 tv online
			'monline'    // 4 mobile online
		],
		//���ڱ��򿪵ķ�ʽ
		openFrom: {
			//ҳ�����ʱ������ʷ��¼����
			auto: 0,
			//������Ϣʱ����
			msg: 1,
			//�ֶ�����
			manual: 2,
			//״̬ͬ��
			sync: 3
		}
	});
	
	// ����������Դ
	K.mix(ds, {
		// ��ǰ���ڵ����촰��
		'windows': [],
		// �û���Ϣ��ֻ�ڳ�ʼ��ʱ����һ��
		'userMap': {}, // �Զ���洢�����û���Ϣ
		'totalUser': 0,
		'status': {},   // ���ػ��洢��״̬ 
		'mineId': '',
		'sets': {}, // ����
		// �洢δ����Ϣ��
		'unread': {},
		// Ȧ��
		'circles': {},
		// Ⱥ��
		'groups': {},
		// �����ϵ��
		'recent': []
	});

	
	// =========================DataSource==============================
	// DataSource ��������
	DControler = {
		getConf: function () {return Conf;},
		addUser: function (u) {
			var logo, name;
			K.forEach(u.uid ? [u] : K.toArray(u), function (user) {
				// ��֤�����ظ�
				if (user.uid && !ds.userMap[user.uid]) {
					logo = user.logo20 || user.icon20 || user.icon || ('http://' + K.Env.IMG_HOST + '/i/20_0_0.gif');
					name = user.real_name || user.name;

					ds.userMap[user.uid] = {
						'uid':       user.uid - 0,
						'online':    user.online || 0,
						'name':      name,
						'logo':      logo,
						'real_name': name,
						'logo20':    logo
					};
					ds.totalUser += 1;
				}
			});
		},
		getUser: function (uid) { return ds.userMap[uid]; },
		getUsers: function () { return ds.userMap; },
		setMine: function (mine) { ds.mineId = mine.uid; this.addUser(mine); },// ���Լ�������map��
		getMine: function () { return this.getUser(ds.mineId); },
		isMine: function (uid) { return uid == ds.mineId; },
		setChatId: function (chatid) { ds.sets.chatId= chatid; },
		getChatId: function () { return ds.sets.chatId; },
		// ��ֹ��Ϣ��������
		setForbidSound: function (v) { ds.sets.forbidSound = v; },
		getForbidSound: function () { return ds.sets.forbidSound; },
		// ��ֹ������ʾ����
		setForbidAlert: function (v) { ds.sets.forbidAlert = v; },
		getForbidAlert: function () { return ds.sets.forbidAlert; },
		// �ϴ���֤��
		setUploadVerify: function (v) { ds.sets.uploadVerify = v; },
		getUploadVerify: function () { return ds.sets.uploadVerify; },
		// ����ȡ��Ȧ�ӵļ�ʱ��Ϣ����
		setForbidCircle: function (id, v) {
			if (!ds.sets.forbidCircle) {
				ds.sets.forbidCircle = {};
			}
			
			ds.sets.forbidCircle[id] = v;
		},
		getForbidCircle: function (id) { return (ds.sets.forbidCircle || {})[id]; },

		addWindow: function (win) {
			var me = this,
				wins = this.getWindows(),
				filter,
				delIndex = 0;
			// ɾ�����ڹ���չ����δ����ʱ��
			if (wins.length >= this.getConf().maxWindowNumber) {
				// ���ÿ�����ڵ���Ϣ����Ϊ��ʱ�������������ǰ��
				filter = [];
				$.each(wins, function (i, w) {
					filter.push({
						'index': i,
						'isOpen': w.isOpen(),
						'hasUnread': me.getUnread(w.id).length
					});
				});
				K.log(['ɾ������ step1��', filter]);
				// ��չ��״̬����δչ������ǰ��
				filter.sort(function (a, b) {
					// ����ʱ�����ǰ����Ǵ򿪵ģ����δ�򿪵Ļ���
					if (a.isOpen !== b.isOpen) {
						return a.isOpen ? 1 : -1;
					}
					// ��Ȳ���Ҫ�ߵ�˳��
					else {
						return -1;
					}
				});
				K.log(['ɾ������ step2��', filter]);
				// ��δ��������δ��Խ�ٵ���ǰ��
				filter.sort(function (a, b) {
					if (a.hasUnread !== b.hasUnread) {
						return a.hasUnread - b.hasUnread;
					}
					else {
						return -1;
					}
				});
				K.log(['ɾ������ step3��', filter]);

				// ɾ��������һ������
				delIndex = filter[0].index || 0;
				wins[delIndex].close(); // ��������,�Ƴ�����close����ʱ����
			}
			wins.push(win);
		},
		removeWindow: function (win) {
			var wins = this.getWindows(),
				delIdx;

			if (typeof win === 'number') { // ���
				delIdx = win;
			}
			else {
				delIdx = K.indexOf(wins, win);
			}

			if (delIdx >= 0 && delIdx < wins.length) {
				wins.splice(delIdx, 1);
			}
		},
		getWindows: function () { return ds.windows },
		getWindow: function (id) {
			return K.detect(this.getWindows(), function (w, i) {
				return w.id == id; // �������ַ�������
			});
		},
		addUnread: function (id, data) {
			// ����
			if (id >> 0) {
				ds.unread[id] = (ds.unread[id] || []).concat(K.isArray(data) ? data : [data]);
			}
			// Ⱥ��
			else {
				if (ds.unread[id]) {
					ds.unread[id].length += data.chat || 1;
				}
				else {
					ds.unread[id] = {'length': data.chat || 1, 'uids': []};
				}
				// ����Ϣʱ
				if (data.uid) {
					ds.unread[id].uids.push(data.uid);
				}
			}
		},
		getUnread: function (id) {
			return ds.unread[id] || [];
		},
		getAllUnread: function () { return ds.unread; },
		clearUnread: function (id) {
			ds.unread[id] = [];
		},

		addCircle: function (c) {
			c = c.gid ? [c] : c;
			$.each(c, function (k, v) {
				ds.circles[v.gid] = v;
			});
		},
		getCircle: function (cid) { return ds.circles[cid]; },
		getCircles: function () { return ds.circles; },
		addGroup: function (g) {
			var me = this;
			g = g.gid ? [g] : g;
			$.each(g, function (k, v) {
				ds.groups[v.gid] = v;
				// ���ý�ֹ��ʱ��Ϣ����
				me.setForbidCircle(v.gid, v.forbid_imsg);
			});
		},
		getGroup: function (gid) { return ds.groups[gid]; },
		getGroups: function () { return ds.groups; },
		removeGroup: function (gid) {
			var g = this.getGroup(gid);
			if (g) {
				delete ds.groups[gid];
			}
		},
		addRecentUsers: function (user) {
			var me = this;
			user = user.uid ? [user] : user;
			$.each(user, function (i, u) {
				me.addUser(u); // ��ֹ�б���û�ж�Ӧ���û�
				ds.recent.push(me.getUser(u.uid));
			});
		},
		getRecentUsers: function () {
			return ds.recent;
		}
	}; // /end DataSource Controler 

	return DControler;
});
