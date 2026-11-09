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

学校专业前端列表位于 miniprogram/data/programs.js，学生云端校验列表位于 cloudfunctions/student-api/index.js，后台录入列表位于 cloudfunctions/admin-api/programs.js，变更时需同步三处。

## 组织架构与报名归属

按组织图配置文一、下沙、城西、经济四个校区，成员名单位于 cloudfunctions/admin-api/organization.js；student-api/organization.js 和 miniprogram/data/organization.js 是独立部署所需副本，修改时须同步。财务负责人、财务部老师暂以岗位名显示。成员使用固定 memberId，两个校区的“屠老师”分别编号，不按姓名判断权限。

- 校长、招生负责人、财务负责人、财务部老师：全部校区报名数据。
- 校区负责人：本校区全部报名，以及本人名下的跨校区报名。
- 报名老师：本人名下全部报名，允许跨校区新增。
- 账号维护仍仅主管理员可操作，数据范围与功能权限分别校验。组织成员默认拥有查看统计、录入、修改和材料查看权限；报名老师默认不授予审核权限。

主管理员在“组织与账号”中为成员设置登录账号、密码和功能权限；现有账号可绑定组织成员。绑定后按组织权限生效，旧学校/班级授权不再叠加，权限更改会使旧会话失效。未绑定的历史账号暂保留原授权，需逐个绑定才能完成迁移。代码更新不会自动创建登录账号或改写线上归属。

主管理员可在账号列表删除普通账号，操作前会显示确认提示。主管理员自身不可删除。删除与审计记录在同一事务内完成，报名记录、组织成员和历史审计保留。认证时重新检查账号是否存在，因此删除后旧会话不能再请求接口；重新创建同名账号使用新的随机会话版本，旧会话不会恢复。

报名记录分别保存 campus（报名校区）和 teacherId（所属成员），teacherName 仅用于展示。小程序新表单可选择校区及实际接待老师；旧客户端未提供归属的记录保留待分配。历史 teacherName 不会自动匹配成员，避免同名误授权。管理岗位可在报名列表“修改”中分配校区和老师；普通老师及校区负责人不能转移记录归属。老师新增时，服务端强制归本人名下，不信任客户端传入的老师编号。

后台新增报名支持基本资料及自填院校专业，不要求补造历史身份证资料，未填资料按缺失展示。修改资料有版本冲突校验和事务审计；资料变化恢复待审核，仅调整校区、老师或班级不撤销审核。未改变志愿时保留原费用，改变志愿时按层次重新计算学制和报名费。保存不会模拟付款。

列表、详情、筛选、统计分析、材料链接、审核、修改及站内消息都按同一组织范围校验。统计分析覆盖当前账号全部授权记录，独立于列表的临时筛选，分别按校区、老师、层次和院校汇总。

部署时上传完整 admin-api（含 access.js、organization.js、programs.js、registration-management.js、notifications.js、referrals.js、wechat-code.js），上传完整 student-api（含 organization.js、referrals.js），构建并发布 admin/dist，再编译发布小程序。招生二维码功能需要在管理环境的数据库中创建 `registration_referrals` 集合，集合权限建议设为仅服务端访问；如需索引，根据云端提示为 campus、teacherId 和列表排序字段创建索引。验证：`node --test tests/*.test.js`；构建：`npm run build --prefix admin`。

电脑后台双击 start-admin.command 启动本地预览，build-admin.command 生成 admin/dist；构建后需另行上传静态托管才会更新线上后台。

## 数据与权限

院校简称与高复标记清洗规则位于各云函数的 registration-normalization.js（小程序有相同副本）。包含杭电、杭医、商大、浙工大、浙经院、浙科的校名分别归并为对应院校全称，学校名称中的“高复”拆为 isExamPrepClass 布尔字段，后台显示“高考复习班”；高升本统一为高起本。只处理学校名称，不根据学生姓名或老师姓名推断班别。原学校和层次分别保存在 schoolOriginal、levelOriginal，未知院校不推测归属。

已有数据清洗工具：`node scripts/normalize-registration-data.js preview` 读取线上指定字段并将备份与变更计划保存至已忽略的 backups/；`node scripts/normalize-registration-data.js apply backups/<snapshot>.json` 按计划执行，带并发版本校验、回读验证和已完成记录跳过。工具同时预览旧账号学校简称授权的对应变化，执行前需确认这部分授权范围变更。新增、修改报名入口也会应用清洗规则。部署需带上 registration-normalization.js。

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

## 原生小程序管理端

首页“立即登录报名”通过 admin-api 的 wechatLogin 判断身份：未绑定微信进入原学生端；已绑定且有效的管理账号进入原生管理页。老师通过首页“老师登录”进入独立页面后点击“老师首次使用 · 绑定账号”，验证已有管理账号密码后绑定当前微信。微信身份仅取云函数 getWXContext，并校验小程序 AppID；客户端传入的身份不作为授权依据。管理页复用原有数据范围、权限、审核版本校验。

包含报名筛选/分页、详情、材料预览、报名与财务审核、新增/修改报名、缴费凭证上传、费用明细、范围统计、招生专业、未读消息及主管理员账号维护。手机导出使用 CSV 分享文件，可用 Excel 打开；Web 端仍使用 XLSX。微信首次绑定不会自动给学生授予教师权限。

部署前在同一云环境创建 admin_wechat_bindings 集合，安全规则设为 `{"read":false,"write":false}`，仅云函数访问。上传完整 admin-api，再编译并发布 miniprogram。绑定记录不含密码或明文微信标识；停用/删除账号后无法微信登录，删除重建的同名账号不会继承原微信绑定。需要解绑时由云端管理员删除该集合内对应 adminId 的绑定记录。退出仅撤销当前会话，不解除绑定。

验证：`node --test tests/admin-wechat.test.js`。发布前需在微信开发者工具及真机验证：学生登录、老师首次绑定及再次登录、停用账号、不同岗位数据范围、材料预览、CSV 分享、审核并发冲突和凭证上传。此次本地测试不代表已经部署或完成真机验收。

## 网页微信扫码登录

网页登录页新增“微信扫码登录”，通过小程序码打开 pages/web-login/web-login，已绑定老师账号的微信须明确点击“确认是我本人登录”。浏览器每两秒检查一次，二维码三分钟失效且只能兑换一次管理会话。二维码中只有随机请求 ID，浏览器持有独立兑换密钥；学生、停用账号以及确认后被撤销权限的账号不能兑换登录。账号密码登录继续保留。

上线顺序：
1. 创建 admin_web_logins 集合，客户端安全规则为 `{"read":false,"write":false}`；确认 admin_wechat_bindings 已建好。过期记录可定期清理，服务端无论是否清理均拒绝过期码。
2. 先发布包含 pages/web-login/web-login 的小程序正式版本，二维码默认进入正式版。
3. 上传完整 admin-api（含 web-login.js 和 config.json，新增 wxacode.getUnlimited 云调用权限）。
4. 构建并发布 admin/dist。用已绑定老师微信、未绑定学生微信分别验收；校验三分钟过期、一次性兑换以及停用账号拒绝登录。

本地检查：`node --test tests/admin-web-login.test.js tests/admin-wechat.test.js`；`npm run build --prefix admin`。小程序码生成依据 CloudBase 云调用文档：https://docs.cloudbase.net/recipes/add-share-with-params-miniprogram 。本地构建不等于已发布或已完成真实扫码验收。

### 网页二维码生成修正

网页调用不具备小程序云调用身份，会返回 INVALID_WX_ACCESS_TOKEN。因此网页二维码已改为服务端通过 stable_token 和 getwxacodeunlimit 生成。需在 admin-api 云函数环境变量中设置 `WECHAT_APP_SECRET`（AppID wxe1a773261a11fb90 对应的小程序密钥），只在云端配置，不放入前端、仓库或聊天。原有 PII_ENCRYPTION_KEY 必须保留。代码包须包含 wechat-code.js。二维码使用正式版且检查页面存在，正式版必须包含 pages/web-login/web-login。

### 当前扫码测试模式

2026-11-06 按测试需求将二维码默认版本改为 trial（体验版），check_path=false；已在线验证二维码生成成功以及轮询返回 pending。无需提交审核或发布正式版，但需上传包含登录确认页的代码并设为体验版，扫码微信需有体验权限。仅真机调试不会更新体验版。后续正式启用时在 admin-api 设置 WECHAT_LOGIN_ENV_VERSION=release，将同时恢复正式页面路径校验；此配置覆盖上文正式版默认说明。

## 老师首次绑定修改密码

小程序首页保留学生“立即登录报名”的原有流程，老师通过单独的“老师登录”按钮进入独立老师登录页。老师登录页绑定管理账号需填写原密码、新密码和确认密码。新密码长度为 10 至 128 位，须与原密码不同。服务端在事务中同步修改密码及创建微信绑定，失败回滚；修改后旧密码及旧会话失效，新密码同时用于电脑后台。已有微信绑定登录保持不变。

发布需同步更新 admin-api 云函数及小程序登录页及页面配置；旧版小程序首次绑定因未传入新密码会被拒绝，因此须协调云函数部署与小程序版本发布。验证：`node --test tests/admin-wechat.test.js tests/admin-web-login.test.js`。
