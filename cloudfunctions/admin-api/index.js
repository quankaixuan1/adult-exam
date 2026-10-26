const cloud = require("wx-server-sdk");
const { withTransaction, addNotification, createInbox } = require('./notifications');
const {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} = require("crypto");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;
const SESSION_MS = 8 * 60 * 60 * 1000;

class ApiError extends Error {
  constructor(message, code = "REQUEST_FAILED") {
    super(message);
    this.code = code;
  }
}

const isoNow = () => new Date().toISOString();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const normalizeUsername = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 10 &&
    password.length <= 128
  );
}

async function adminDocument(id = "primary") {
  try {
    return (await db.collection("admins").doc(id).get()).data || null;
  } catch (error) {
    if (
      /not exist|DOCUMENT_NOT_FOUND/i.test(error.errMsg || error.message || "")
    )
      return null;
    throw error;
  }
}

async function createSession(admin) {
  const token = `adm_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  await db.collection("admin_sessions").add({
    data: {
      _id: digest(`admin-session:${token}`),
      adminId: admin._id,
      sessionVersion: admin.sessionVersion || 0,
      expiresAt,
      createdAt: isoNow(),
    },
  });
  return { token, expiresAt, admin: publicAdmin(admin) };
}

async function authenticate(token) {
  if (!/^adm_[a-f0-9]{64}$/.test(token || ""))
    throw new ApiError("管理员登录已失效，请重新登录", "LOGIN_REQUIRED");
  let session;
  try {
    session = (
      await db
        .collection("admin_sessions")
        .doc(digest(`admin-session:${token}`))
        .get()
    ).data;
  } catch (error) {
    throw new ApiError("管理员登录已失效，请重新登录", "LOGIN_REQUIRED");
  }
  if (!session || Date.parse(session.expiresAt) <= Date.now())
    throw new ApiError("管理员登录已过期，请重新登录", "LOGIN_REQUIRED");
  const admin = await adminDocument(session.adminId);
  if (
    !admin ||
    (admin.sessionVersion || 0) !== (session.sessionVersion || 0) ||
    admin._id !== session.adminId ||
    admin.disabled === true
  )
    throw new ApiError("管理员账号不可用", "LOGIN_REQUIRED");
  return admin;
}

async function audit(admin, action, details = {}) {
  await db.collection("audit_logs").add({
    data: {
      actorType: "admin",
      actorId: admin._id,
      action,
      details,
      createdAt: isoNow(),
    },
  });
}

async function bootstrap(data) {
  if (await adminDocument())
    throw new ApiError("管理员已经初始化", "ALREADY_INITIALIZED");
  const username = normalizeUsername(data.username);
  if (!/^[a-z0-9_-]{4,32}$/.test(username))
    throw new ApiError(
      "账号需为4至32位字母、数字、下划线或短横线",
      "INVALID_INPUT",
    );
  if (!validPassword(data.password))
    throw new ApiError("密码至少10位，最多128位", "INVALID_INPUT");
  const salt = randomBytes(16).toString("hex");
  const admin = {
    _id: "primary",
    username,
    displayName:
      typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim().slice(0, 40)
        : "主管理员",
    passwordSalt: salt,
    passwordHash: passwordDigest(data.password, salt),
    createdAt: isoNow(),
    disabled: false,
  };
  try {
    await db.collection("admins").add({ data: admin });
  } catch (error) {
    throw new ApiError("管理员已经初始化", "ALREADY_INITIALIZED");
  }
  await audit(admin, "admin_initialized");
  return createSession(admin);
}

async function login(data) {
  const username = normalizeUsername(data.username);
  const primary = await adminDocument();
  const admin =
    primary && primary.username === username
      ? primary
      : await adminDocument(digest(`admin:${username}`));
  if (!admin || admin.disabled === true)
    throw new ApiError("账号或密码错误", "INVALID_CREDENTIALS");
  const candidate = validPassword(data.password)
    ? passwordDigest(data.password, admin.passwordSalt)
    : "0".repeat(128);
  const stored = Buffer.from(admin.passwordHash, "hex");
  const supplied = Buffer.from(candidate, "hex");
  if (
    username !== admin.username ||
    stored.length !== supplied.length ||
    !timingSafeEqual(stored, supplied)
  )
    throw new ApiError("账号或密码错误", "INVALID_CREDENTIALS");
  await db
    .collection("admins")
    .doc(admin._id)
    .update({ data: { lastLoginAt: isoNow() } });
  await audit(admin, "admin_login");
  return createSession(admin);
}

const permissionOptions = [
  "registrations.view",
  "registrations.review",
  "materials.view",
];
const isSuper = (admin) => admin._id === "primary";
function publicAdmin(admin) {
  return {
    id: admin._id,
    username: admin.username,
    displayName: admin.displayName,
    role: isSuper(admin) ? "super" : "staff",
    permissions: isSuper(admin) ? permissionOptions : admin.permissions || [],
    schools: admin.schools || [],
    classIds: admin.classIds || [],
    disabled: admin.disabled === true,
  };
}
function requirePermission(admin, permission) {
  if (!isSuper(admin) && !(admin.permissions || []).includes(permission))
    throw new ApiError("没有该操作权限", "FORBIDDEN");
}
function requireSuper(admin) {
  if (!isSuper(admin))
    throw new ApiError("仅主管理员可以管理账号权限", "FORBIDDEN");
}
function scope(admin, prefix = "") {
  if (isSuper(admin)) return {};
  const rules = [];
  if ((admin.schools || []).length)
    rules.push({ [`${prefix}school`]: command.in(admin.schools) });
  if ((admin.classIds || []).length)
    rules.push({ [`${prefix}classId`]: command.in(admin.classIds) });
  return rules.length
    ? command.or(rules)
    : { [`${prefix}_id`]: "__no_authorized_records__" };
}
async function scopedRegistration(admin, id) {
  if (!/^[a-f0-9]{64}$/.test(id || ""))
    throw new ApiError("报名记录无效", "INVALID_INPUT");
  const result = await db
    .collection("registrations")
    .where(command.and([scope(admin), { _id: id }]))
    .limit(1)
    .get();
  if (!result.data.length)
    throw new ApiError("记录不存在或不在授权范围内", "FORBIDDEN");
  return result.data[0];
}
async function accountList(admin) {
  requireSuper(admin);
  const accounts = (await db.collection("admins").limit(100).get()).data.map(
    publicAdmin,
  );
  const options = await db
    .collection("registrations")
    .aggregate()
    .group({ _id: { school: "$school", classId: "$classId" } })
    .limit(1000)
    .end();
  return {
    accounts,
    schools: [
      ...new Set(options.list.map((v) => v._id.school).filter(Boolean)),
    ].sort(),
    classIds: [
      ...new Set(options.list.map((v) => v._id.classId).filter(Boolean)),
    ].sort(),
    permissionOptions,
  };
}
async function accountSave(admin, data) {
  requireSuper(admin);
  const username = normalizeUsername(data.username);
  if (!/^[a-z0-9_-]{4,32}$/.test(username))
    throw new ApiError(
      "账号需为4至32位字母、数字、下划线或短横线",
      "INVALID_INPUT",
    );
  const primary = await adminDocument();
  if (username === primary.username)
    throw new ApiError("主管理员不能在此修改", "INVALID_INPUT");
  const id = digest(`admin:${username}`);
  const current = await adminDocument(id);
  const displayName =
    typeof data.displayName === "string"
      ? data.displayName.trim().slice(0, 40)
      : "";
  if (!displayName) throw new ApiError("请填写账号名称", "INVALID_INPUT");
  if (!current && !validPassword(data.password))
    throw new ApiError("新账号密码至少10位", "INVALID_INPUT");
  if (data.password && !validPassword(data.password))
    throw new ApiError("密码长度需为10至128位", "INVALID_INPUT");
  const strings = (value) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .filter(
                (v) => typeof v === "string" && v.trim() && v.length <= 100,
              )
              .map((v) => v.trim()),
          ),
        ].slice(0, 100)
      : [];
  const next = {
    username,
    displayName,
    role: "staff",
    permissions: strings(data.permissions).filter((p) =>
      permissionOptions.includes(p),
    ),
    schools: strings(data.schools),
    classIds: strings(data.classIds),
    disabled: data.disabled === true,
    updatedAt: isoNow(),
    sessionVersion: ((current && current.sessionVersion) || 0) + 1,
  };
  if (data.password) {
    next.passwordSalt = randomBytes(16).toString("hex");
    next.passwordHash = passwordDigest(data.password, next.passwordSalt);
  }
  if (current) await db.collection("admins").doc(id).update({ data: next });
  else
    await db
      .collection("admins")
      .add({ data: { _id: id, ...next, createdAt: isoNow() } });
  await audit(admin, "account_saved", {
    accountId: id,
    permissions: next.permissions,
    schools: next.schools,
    classIds: next.classIds,
    disabled: next.disabled,
  });
  return { ok: true };
}

function publicRegistration(item) {
  return {
    id: item._id,
    name: item.name,
    phone: item.phone,
    gender: item.gender || "",
    ethnicity: item.ethnicity || "",
    idNumberMasked: item.idNumberLast4
      ? `**************${item.idNumberLast4}`
      : "",
    education: item.education || "",
    workUnit: item.workUnit || "",
    currentAddress: item.currentAddress || "",
    politicalStatus: item.politicalStatus || "",
    unionMember:
      typeof item.unionMember === "boolean" ? item.unionMember : null,
    veteran: typeof item.veteran === "boolean" ? item.veteran : null,
    emergencyName: item.emergencyName || "",
    emergencyPhone: item.emergencyPhone || "",
    school: item.school,
    level: item.level,
    classId: item.classId || "",
    source: item.source || "miniprogram",
    sourceRow: item.sourceRow || null,
    schoolOriginal: item.schoolOriginal || "",
    teacherName: item.teacherName || "",
    studentNo: item.studentNo || "",
    paymentStatus: item.paymentStatus || "unknown",
    major: item.major,
    fee: item.fee,
    duration: item.duration || "",
    studyMode: item.studyMode || "",
    materials: Object.fromEntries(
      ["idFront", "idBack", "education", "photo"]
        .filter((kind) => item.materials && item.materials[kind])
        .map((kind) => {
          const m = item.materials[kind];
          return [
            kind,
            {
              fileName: m.fileName,
              uploadedAt: m.uploadedAt,
              status: m.status || "pending",
              size: m.size,
            },
          ];
        }),
    ),
    status: item.status,
    reviewRemark: item.reviewRemark || "",
    revision: item.revision,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const registrationFilterFields = ["school", "major", "level", "classId"];

async function registrationFilters(admin) {
  requirePermission(admin, "registrations.view");
  const values = Object.fromEntries(
    registrationFilterFields.map((field) => [field, new Set()]),
  );
  const batchSize = 200;
  let offset = 0;

  while (true) {
    const result = await db
      .collection("registrations")
      .aggregate()
      .match(scope(admin))
      .group({
        _id: {
          school: "$school",
          major: "$major",
          level: "$level",
          classId: "$classId",
        },
      })
      .sort({
        "_id.school": 1,
        "_id.major": 1,
        "_id.level": 1,
        "_id.classId": 1,
      })
      .skip(offset)
      .limit(batchSize)
      .end();

    for (const item of result.list) {
      for (const field of registrationFilterFields) {
        const value = item._id && item._id[field];
        if (typeof value === "string" && value.trim()) values[field].add(value);
      }
    }
    if (result.list.length < batchSize) break;
    offset += batchSize;
  }

  return Object.fromEntries(
    registrationFilterFields.map((field) => [
      field,
      [...values[field]].sort((a, b) => a.localeCompare(b, "zh-CN")),
    ]),
  );
}

async function dashboard(admin, data) {
  requirePermission(admin, "registrations.view");
  const status = ["pending", "approved", "rejected"].includes(data.status)
    ? data.status
    : ""; //三种审核状态
  const page = Number.isSafeInteger(data.page) && data.page > 0 ? data.page : 1; //页码必须是正的安全整数，否则默认第 1 页
  const pageSize = 30; //固定每页 30 条。
  const collection = db.collection("registrations");

  // const baseScope = scope(admin);
  // const filtered = status ? command.and([baseScope, { status }]) : baseScope;
  // const query = collection.where(filtered);
  const baseScope = scope(admin);
  const conditions = [baseScope];

  if (status) {
    conditions.push({ status });
  }

  for (const field of registrationFilterFields) {
    if (data[field] !== undefined && typeof data[field] !== "string") {
      throw new ApiError("筛选条件无效", "INVALID_INPUT");
    }
    const value = typeof data[field] === "string" ? data[field].trim() : "";
    if (value.length > 160) {
      throw new ApiError("筛选条件过长", "INVALID_INPUT");
    }
    if (value) conditions.push({ [field]: value });
  }

  const keyword = typeof data.keyword === "string" ? data.keyword.trim() : "";

  if (keyword.length > 100) {
    throw new ApiError("搜索关键词最多100个字符", "INVALID_INPUT");
  }

  if (keyword) {
    // 转义正则特殊字符，把用户输入作为普通文本搜索
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const fields = ["name", "phone", "school", "level", "major"];

    conditions.push(
      command.or(
        fields.map((field) => ({
          [field]: db.RegExp({
            regexp: escaped,
            options: "i",
          }),
        })),
      ),
    );
  }

  const filtered =
    conditions.length === 1 ? baseScope : command.and(conditions);

  const query = collection.where(filtered);
  // 统计总数、各状态数量以及分页数据

  const [total, pending, approved, rejected, rows] = await Promise.all([
    collection.where(baseScope).count(),
    collection.where(command.and([baseScope, { status: "pending" }])).count(),
    collection.where(command.and([baseScope, { status: "approved" }])).count(),
    collection.where(command.and([baseScope, { status: "rejected" }])).count(),
    query
      .orderBy("createdAt", "asc")
      .orderBy("_id", "asc")
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
  ]);
  return {
    admin: publicAdmin(admin),
    stats: {
      total: total.total,
      pending: pending.total,
      approved: approved.total,
      rejected: rejected.total,
    },
    registrations: rows.data.map(publicRegistration),
    page,
    pageSize,
    filteredTotal: (await query.count()).total,
  };
}

async function review(admin, data) {
  requirePermission(admin, "registrations.review");
  await scopedRegistration(admin, data.registrationId);
  if (
    typeof data.registrationId !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.registrationId)
  )
    throw new ApiError("报名记录无效", "INVALID_INPUT");
  if (!["approved", "rejected", "pending"].includes(data.status))
    throw new ApiError("请选择审核结果", "INVALID_INPUT");
  const remark =
    typeof data.remark === "string" ? data.remark.trim().slice(0, 500) : "";
  if (data.status === "rejected" && !remark)
    throw new ApiError("请填写需要补充或修改的内容", "INVALID_INPUT");
  if (!Number.isSafeInteger(data.revision)) {
    throw new ApiError("请重新打开报名详情后审核", "REVISION_CONFLICT");
  }
  const updatedAt = isoNow();
  await withTransaction(db, async transaction => {
    const current = (await transaction.collection('registrations').doc(data.registrationId).get()).data;
    if (!current || (!isSuper(admin) && !(admin.schools || []).includes(current.school) && !(admin.classIds || []).includes(current.classId))) {
      throw new ApiError('记录不存在或不在授权范围内', 'FORBIDDEN');
    }
    if (current.revision !== data.revision) {
      throw new ApiError('报名资料或材料已更新，请重新打开详情后审核', 'REVISION_CONFLICT');
    }
    if (current.status === data.status && (current.reviewRemark || '') === remark) return;
    const revision = current.revision + 1;
    await transaction.collection('registrations').doc(data.registrationId).update({
      data: { status: data.status, reviewRemark: remark, reviewedAt: updatedAt,
        reviewedBy: admin._id, updatedAt, revision }
    });
    if (current.studentId) {
      await addNotification(transaction, {
        type: 'registration_reviewed', audience: 'student', recipientId: current.studentId,
        registrationId: current._id, version: revision, status: data.status,
        registrationCreatedAt: current.createdAt, remark, createdAt: updatedAt
      });
    }
    await transaction.collection('audit_logs').doc(digest(`review-audit:${current._id}:${revision}`)).set({
      data: { actorType: 'admin', actorId: admin._id, action: 'registration_reviewed',
        details: { registrationId: current._id, status: data.status }, createdAt: updatedAt }
    });
  });
  return { ok: true };
}

function adminInbox(admin) {
  requirePermission(admin, 'registrations.view');
  return createInbox(db, {
    audience: 'admin', readerId: admin._id, registrationScope: scope(admin, 'registration.')
  }, (message, code) => new ApiError(message, code));
}

async function materialLink(admin, data) {
  requirePermission(admin, "materials.view");
  if (
    !/^[a-f0-9]{64}$/.test(data.registrationId || "") ||
    !["idFront", "idBack", "education", "photo"].includes(data.kind)
  )
    throw new ApiError("材料参数无效", "INVALID_INPUT");
  const record = await scopedRegistration(admin, data.registrationId);
  const material = record.materials && record.materials[data.kind];
  if (!material || !material.fileId)
    throw new ApiError("该项材料尚未上传", "NOT_FOUND");
  if (
    !material.fileId.startsWith("cloud://") ||
    !material.fileId.includes(
      `/student-materials/${data.registrationId}/${data.kind}/`,
    )
  )
    throw new ApiError("材料路径不匹配", "INVALID_INPUT");
  const links = await cloud.getTempFileURL({
    fileList: [{ fileID: material.fileId, maxAge: 300 }],
  });
  const file = links.fileList && links.fileList[0];
  if (!file || !file.tempFileURL || !file.tempFileURL.startsWith("https://"))
    throw new ApiError("暂时无法打开材料，请重试");
  await audit(admin, "material_viewed", {
    registrationId: data.registrationId,
    kind: data.kind,
  });
  return { url: file.tempFileURL };
}

async function handle(action, data) {
  if (action === "bootstrapStatus")
    return { initialized: Boolean(await adminDocument()) };
  if (action === "bootstrap") return bootstrap(data);
  if (action === "login") return login(data);
  const admin = await authenticate(data.token);
  if (action === 'notifications') return adminInbox(admin).list();
  if (action === 'readNotification') return adminInbox(admin).read(data.notificationId);
  if (action === "registrationFilters") return registrationFilters(admin);
  if (action === "accounts") return accountList(admin);
  if (action === "saveAccount") return accountSave(admin, data);
  if (action === "materialLink") return materialLink(admin, data);
  if (action === "registrationDetail") {
    if (!/^[a-f0-9]{64}$/.test(data.registrationId || ""))
      throw new ApiError("报名记录无效", "INVALID_INPUT");
    requirePermission(admin, "registrations.view");
    const record = await scopedRegistration(admin, data.registrationId);
    return {
      registration: publicRegistration(record),
      admin: publicAdmin(admin),
    };
  }
  if (action === "dashboard") return dashboard(admin, data);
  if (action === "review") return review(admin, data);
  if (action === "logout") {
    await db
      .collection("admin_sessions")
      .doc(digest(`admin-session:${data.token}`))
      .remove();
    await audit(admin, "admin_logout");
    return { ok: true };
  }
  throw new ApiError("接口不存在", "NOT_FOUND");
}

exports.main = async (event) => {
  try {
    const action =
      event && typeof event.action === "string" ? event.action : "";
    const data =
      event && event.data && typeof event.data === "object" ? event.data : {};
    return { ok: true, data: await handle(action, data) };
  } catch (error) {
    console.error(
      "admin-api failed",
      error.code || error.errCode || error.message,
    );
    const known = error instanceof ApiError;
    return {
      ok: false,
      code: known ? error.code : "CLOUD_ERROR",
      message: known ? error.message : "管理服务暂时不可用，请稍后再试",
    };
  }
};
