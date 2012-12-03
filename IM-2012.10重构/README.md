2012/10/30

# 新版im

DataSource存储数据对象。


## 类划分


[List]++1-0..*>[Group]

[Group]<>1..*-0..*>[Item]

[List]uses-.->[SuggestFriend]

[List]++->[SetPanel]

List --------- 好友列表窗口

	- toggleExpandGroup() ---------> Render.toggleExpandGroup
	- updateTotalOnlineNumber()
	- updateGroupItemNumber()
	- update
	- Render.initListDom()
	- Render.toggleExpandGroup()

Window ------- 聊天窗口

Manager ------ 统一管理窗口

AIMInit ------ 执行入口

==================================================================

## 涉及js文件

*修改*

js/IMPresence.js

IMPoller.js

MsgFrame.js

BarAppList.js

*新建*

AIMInit.js

IMList.js

IMWindow.js

IMControler.js

IMDatasource.js

IMSuggest.js




