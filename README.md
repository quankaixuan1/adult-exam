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

缴费目前仍是演示流程，不产生真实扣款。历史 731 人数据导入与身份核验尚待实现。

## 旧本地后端

原 backend 已移动到 archive/local-backend，当前小程序和后台不调用它。原 start-local.command 也已移入该目录。

根目录不再提供含义模糊的 start/test 命令。仅在明确需要旧服务时使用 pnpm run start:legacy；历史测试入口为 pnpm run test:legacy，不能代表云开发版本测试。

详细说明和原文档见 archive/local-backend/README.md。本次归档保留原依赖、锁文件及 .private 数据，没有变更线上云服务。
