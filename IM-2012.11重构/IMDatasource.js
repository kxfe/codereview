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
		// 初始配置
		Conf = {},
		// 数据资源存储
		ds = {},
		// 返回的结果
		DControler;
	
	// 定义初始配置
	K.mix(Conf, {
		// 最大窗口数
		'maxWindowNumber': 3,
		// 最大字数
		'maxWords': 2000,
		// 状态保存在cookie中的名字
		'statusCookieName': 'im',
		// 在线状态
		'onlineStatus': [
			'offline',   // 0 offline
			'online',    // 1 web online
			'waponline', // 2 wap online
			'tvonline',  // 3 tv online
			'monline'    // 4 mobile online
		],
		//窗口被打开的方式
		openFrom: {
			//页面加载时根据历史记录开启
			auto: 0,
			//来新消息时开启
			msg: 1,
			//手动开启
			manual: 2,
			//状态同步
			sync: 3
		}
	});
	
	// 定义数据资源
	K.mix(ds, {
		// 当前存在的聊天窗口
		'windows': [],
		// 用户信息，只在初始化时加载一次
		'userMap': {}, // 以对象存储所有用户信息
		'totalUser': 0,
		'status': {},   // 本地化存储的状态 
		'mineId': '',
		'sets': {}, // 设置
		// 存储未读消息数
		'unread': {},
		// 圈子
		'circles': {},
		// 群聊
		'groups': {},
		// 最近联系人
		'recent': []
	});

	
	// =========================DataSource==============================
	// DataSource 操作方法
	DControler = {
		getConf: function () {return Conf;},
		addUser: function (u) {
			var logo, name;
			K.forEach(u.uid ? [u] : K.toArray(u), function (user) {
				// 保证不会重复
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
		setMine: function (mine) { ds.mineId = mine.uid; this.addUser(mine); },// 将自己包含到map中
		getMine: function () { return this.getUser(ds.mineId); },
		isMine: function (uid) { return uid == ds.mineId; },
		setChatId: function (chatid) { ds.sets.chatId= chatid; },
		getChatId: function () { return ds.sets.chatId; },
		// 禁止消息声音设置
		setForbidSound: function (v) { ds.sets.forbidSound = v; },
		getForbidSound: function () { return ds.sets.forbidSound; },
		// 禁止弹出提示设置
		setForbidAlert: function (v) { ds.sets.forbidAlert = v; },
		getForbidAlert: function () { return ds.sets.forbidAlert; },
		// 上传验证码
		setUploadVerify: function (v) { ds.sets.uploadVerify = v; },
		getUploadVerify: function () { return ds.sets.uploadVerify; },
		// 设置取消圈子的即时消息提醒
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
			// 删除窗口规则：展开、未读、时间
			if (wins.length >= this.getConf().maxWindowNumber) {
				// 标记每个窗口的信息，即为按时间排序，最早的在前面
				filter = [];
				$.each(wins, function (i, w) {
					filter.push({
						'index': i,
						'isOpen': w.isOpen(),
						'hasUnread': me.getUnread(w.id).length
					});
				});
				K.log(['删除窗口 step1：', filter]);
				// 按展开状态排序，未展开的在前面
				filter.sort(function (a, b) {
					// 不等时，如果前面的是打开的，则把未打开的换下
					if (a.isOpen !== b.isOpen) {
						return a.isOpen ? 1 : -1;
					}
					// 相等不需要颠倒顺序
					else {
						return -1;
					}
				});
				K.log(['删除窗口 step2：', filter]);
				// 按未读数排序，未读越少的在前面
				filter.sort(function (a, b) {
					if (a.hasUnread !== b.hasUnread) {
						return a.hasUnread - b.hasUnread;
					}
					else {
						return -1;
					}
				});
				K.log(['删除窗口 step3：', filter]);

				// 删除排序后第一个窗口
				delIndex = filter[0].index || 0;
				wins[delIndex].close(); // 被挤掉的,移除会在close发生时触发
			}
			wins.push(win);
		},
		removeWindow: function (win) {
			var wins = this.getWindows(),
				delIdx;

			if (typeof win === 'number') { // 序号
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
				return w.id == id; // 数字与字符串兼容
			});
		},
		addUnread: function (id, data) {
			// 个人
			if (id >> 0) {
				ds.unread[id] = (ds.unread[id] || []).concat(K.isArray(data) ? data : [data]);
			}
			// 群组
			else {
				if (ds.unread[id]) {
					ds.unread[id].length += data.chat || 1;
				}
				else {
					ds.unread[id] = {'length': data.chat || 1, 'uids': []};
				}
				// 新消息时
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
				// 设置禁止即时消息提醒
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
				me.addUser(u); // 防止列表中没有对应的用户
				ds.recent.push(me.getUser(u.uid));
			});
		},
		getRecentUsers: function () {
			return ds.recent;
		}
	}; // /end DataSource Controler 

	return DControler;
});
