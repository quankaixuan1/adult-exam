const { randomBytes } = require("crypto");
const { memberById, managementPositions } = require("./organization");
const { generateCode } = require("./wechat-code");
module.exports =
  ({ db, ApiError }) =>
  async (admin) => {
    const member = memberById(
      admin.memberId || (admin._id === "primary" ? "principal" : ""),
    );
    if (!member || admin.disabled)
      throw new ApiError("请先为账号绑定组织成员", "INVALID_INPUT");
    const campus = managementPositions.includes(member.position)
      ? ""
      : member.campus;
    const id = randomBytes(15).toString("hex");
    const code = await generateCode(id, undefined, "pages/referral/referral");
    try {
      await db.collection("registration_referrals").add({
        data: {
          _id: id,
          adminId: admin._id,
          accountCreatedAt: admin.createdAt,
          teacherId: member.id,
          teacherName: member.name,
          campus,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (String(error && (error.errCode ?? error.code)) === "-502005" || /registration_referrals.*(not exist|不存在)/i.test(`${error && error.message}`)) {
        throw new ApiError("二维码数据库集合 registration_referrals 尚未创建，请联系管理员在云开发控制台创建该集合", "REFERRAL_COLLECTION_NOT_FOUND");
      }
      throw error;
    }
    return {
      image: "data:image/png;base64," + code.buffer.toString("base64"),
      teacherName: member.name,
      campus,
    };
  };
