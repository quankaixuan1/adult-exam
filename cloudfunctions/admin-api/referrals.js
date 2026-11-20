const { createHash, randomBytes } = require("crypto");
const { memberById, managementPositions } = require("./organization");
const { generateCode } = require("./wechat-code");
module.exports =
  ({ db, ApiError }) =>
  async (admin, { refresh = false } = {}) => {
    const member = memberById(
      admin.memberId || (admin._id === "primary" ? "principal" : ""),
    );
    if (!member || admin.disabled)
      throw new ApiError("请先为账号绑定组织成员", "INVALID_INPUT");
    const campus = managementPositions.includes(member.position)
      ? ""
      : member.campus;
    const collection = db.collection("registration_referrals");
    const owner = { adminId: admin._id, accountCreatedAt: admin.createdAt, teacherId: member.id };
    let image;
    try {
      const { data: [latest] } = await collection.where(owner)
        .orderBy("createdAt", "desc").orderBy("_id", "desc").limit(1).get();
      if (!refresh && latest?.image) {
        return { image: latest.image, teacherName: member.name, campus };
      }
      // A legacy code has a saved scene but no saved image. Render that scene once.
      const id = refresh ? randomBytes(15).toString("hex") : latest?._id ||
        createHash("sha256").update(JSON.stringify(owner)).digest("hex").slice(0, 30);
      const code = await generateCode(id, undefined, "pages/referral/referral");
      image = "data:image/png;base64," + code.buffer.toString("base64");
      if (!refresh && latest) {
        await collection.doc(id).update({ data: { image } });
      } else {
        try {
          await collection.add({ data: {
            _id: id, ...owner, teacherName: member.name, campus, image,
            createdAt: new Date().toISOString(),
          } });
        } catch (error) {
          if (refresh || latest || !/duplicate|already exists|重复/i.test(error.message || "")) throw error;
          // Two first requests use the same scene. Return the image already saved.
          image = (await collection.doc(id).get()).data.image;
        }
      }
    } catch (error) {
      if (String(error && (error.errCode ?? error.code)) === "-502005" || /registration_referrals.*(not exist|不存在)/i.test(`${error && error.message}`)) {
        throw new ApiError("二维码数据库集合 registration_referrals 尚未创建，请联系管理员在云开发控制台创建该集合", "REFERRAL_COLLECTION_NOT_FOUND");
      }
      throw error;
    }
    return {
      image,
      teacherName: member.name,
      campus,
    };
  };
