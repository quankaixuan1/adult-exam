# 旧本地后端（已归档）

归档日期：2026-10-18。此目录保留原 Express + SQLite 实现；当前小程序和管理员网页均调用项目根目录的 cloudfunctions，不使用本目录。

- core：旧业务逻辑。
- repositories/sqlite：旧数据库访问。
- providers：旧微信登录适配。
- local-server：旧 HTTP 服务。
- tests：历史测试，不代表当前云开发功能；其中 miniprogram.test.js 针对旧 HTTP 客户端，不能用于验证当前云函数客户端。
- README-before-archive.md：归档前说明，仅供历史查阅，其中路径、功能状态及启动方式可能已过时。

需要研究旧服务时，从项目根目录执行 pnpm run start:legacy，或双击本目录 start-local.command。启动会访问项目根目录原有 .private 数据库和密钥，请勿误认为云数据库。历史测试入口为 pnpm run test:legacy，本次未运行。

根目录 Express 依赖和锁文件保留，供旧服务使用。未移动、删除或复制 .private 中的个人数据、密钥及数据库。
