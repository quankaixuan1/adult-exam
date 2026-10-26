# 成人高考报名系统

## 当前目录

| 目录 | 用途 |
| --- | --- |
| miniprogram/ | 微信小程序页面、交互与本机报名草稿 |
| cloudfunctions/student-api/ | 微信学生账号、报名校验与云数据库写入 |
| cloudfunctions/admin-api/ | 管理员登录、报名列表与审核 |
| admin/ | Vue 3 电脑管理后台 |
| archive/local-backend/ | 已停用的 Express + SQLite 本地后端，仅供查阅或恢复 |
| .private/ | 历史本地数据库、密钥及配置，不得提交或分享 |

## 开发与部署

云环境：cloud1-d2gcxozkl4c789619。

微信开发者工具打开项目根目录，前端修改后重新编译。当前小程序通过 wx.cloud.callFunction 调用 student-api，不需要本地 Express、BASE_URL 或局域网 IP。

后端功能修改 cloudfunctions 中的代码，并单独上传部署；编译小程序不会更新云函数。在微信开发者工具中右键对应云函数，选择“上传并部署：云端安装依赖”。使用 CLI 时进入实际函数目录后执行代码更新，更新后回读核对代码，避免目录参数与实际打包路径不一致。

学校专业前端列表位于 miniprogram/data/programs.js，云端校验列表位于 cloudfunctions/student-api/index.js，变更时需同步两处。

电脑后台双击 start-admin.command 启动本地预览，build-admin.command 生成 admin/dist；构建后需另行上传静态托管才会更新线上后台。

## 数据与权限

学生身份由云函数中的微信 OPENID 确定。students、registrations、audit_logs、admins、admin_sessions 等集合应禁止客户端直接读写，通过云函数校验权限。catalogs 为后续计划管理预留。

身份证号由云函数加密存储，密钥通过云端环境变量配置。报名草稿保存在用户本机，包含所填个人资料。不要将真实报名资料、Excel、数据库、密钥或环境配置提交到公开仓库。

缴费目前仍是演示流程，不产生真实扣款。历史导入记录与微信身份的关联尚待实现；未绑定微信的历史记录暂不能向学生发送个人审核消息。

## 演示缴费与站内消息

当前版本的“模拟支付完成”会由 student-api 保存 `paymentStatus: demo_completed`，然后显示“报名成功”；页面始终明确标注未产生真实付款。创建报名记录仅标记待模拟缴费，不生成新报名提醒。学生可在“我的”中继续未完成的模拟缴费。

模拟缴费完成、材料上传会生成管理员站内消息，审核状态或备注变化会生成学生站内消息。保存业务数据和消息使用数据库事务；重复完成模拟缴费、重复保存同一材料不会重复发消息。补交材料会恢复待审核，并增加版本号；审核需提交当前 revision，避免审核旧资料。

首次部署前，在同一个云环境新建 **notification_events** 集合，将客户端读写权限均设为禁止（自定义安全规则 `{"read": false, "write": false}`），只允许云函数服务端操作。必须先建立集合，再部署两个云函数。无需导入历史消息或修改现有报名记录。建议按查询情况添加 audience、recipientId、createdAt 的索引；关联报名记录使用现有 _id 索引。

消息查询在服务端关联当前报名记录并重新验证权限：管理员需具备查看报名权限，且记录仍在当前学校或班级范围内；学生只能读取本人消息。已读状态按接收人分别保存，同一管理员阅读不会影响其他管理员。删除报名后，其旧消息不再显示。每次返回最近20条未读消息，查看后继续显示更早的未读消息。

管理员后台可见时每10秒轻量查询一次，未读数量自动显示在“消息”按钮上，点击按钮才展开消息列表；切回后台窗口或网络恢复时立即查询。学生“我的”页面可见时每30秒查询一次；页面隐藏、退出登录或销毁后停止，重新显示时立即查询。后台查询不显示全局加载动画。当前只有站内消息，不发送微信订阅消息；关闭浏览器或小程序时不会主动推送，下次进入时可查看未读消息。

部署需同步上传 student-api、admin-api（包含各自的 notifications.js），重新构建并上传 admin/dist，再编译发布小程序。两个 notifications.js 因云函数分别打包而保留相同实现，修改公共消息逻辑时须同步。验证命令：`node --test tests/cloud-notifications.test.js`；后台构建：在 admin 目录执行 `npm run build`。

## 旧本地后端

原 backend 已移动到 archive/local-backend，当前小程序和后台不调用它。原 start-local.command 也已移入该目录。

根目录不再提供含义模糊的 start/test 命令。仅在明确需要旧服务时使用 pnpm run start:legacy；历史测试入口为 pnpm run test:legacy，不能代表云开发版本测试。

详细说明和原文档见 archive/local-backend/README.md。本次归档保留原依赖、锁文件及 .private 数据，没有变更线上云服务。
