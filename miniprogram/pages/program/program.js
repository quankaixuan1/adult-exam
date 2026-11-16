const api = require("../../services/api");
const organization = require("../../data/organization");
const DRAFT_KEY = "registrationFormDraft";

Page({
  onShareAppMessage() {
    return { title: "成人高考报名", path: "/pages/index/index" };
  },
  data: {
    error: "",
    loading: false,
    programs: [],
    schools: [],
    levels: [],
    majors: [],
    school: "",
    level: "",
    customSchool: "",
    customMajor: "",
    campuses: organization.campuses,
    teachers: organization.members
      .filter((item) => item.campus || item.position === "admissions")
      .map((item) => ({
        ...item,
        label: `${item.name}（${item.campus || "招生负责人"}）`,
      })),
    campus: "",
    teacherId: "",
    teacherLabel: "",
    program: null,
    consent: false,
  },

  async onLoad() {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    if (!draft.name) {
      wx.redirectTo({ url: "/pages/register/register" });
      return;
    }
    await this.loadCatalog();
  },

  async loadCatalog() {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    this.setData({ loading: true, error: "" });
    try {
      const catalog = await api.catalog();
      if (!Array.isArray(catalog?.programs) || catalog.programs.length === 0) {
        throw new Error("招生专业列表暂时不可用，请稍后重试。");
      }
      const programs = catalog.programs;
      this.setData({
        programs,
        levels: [...new Set(programs.map((item) => item.level))],
      });
      this.restoreSelection(draft);
    } catch (error) {
      this.setData({
        error: error.message || "招生专业列表加载失败，请稍后重试。",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  back() {
    wx.navigateBack();
  },

  onHide() {
    if (!this.data.loading) this.saveDraft();
  },
  onUnload() {
    if (!this.data.loading) this.saveDraft();
  },
  unique(items) {
    return [...new Set(items)];
  },

  restoreSelection(draft) {
    const teacher = this.data.teachers.find(
      (item) => item.id === draft.teacherId,
    );
    this.setData({
      campus: organization.campuses.includes(draft.campus) ? draft.campus : "",
      teacherId: teacher?.id || "",
      teacherLabel: teacher?.label || "",
    });
    if (
      draft.program &&
      draft.program.id === "other" &&
      this.data.levels.includes(draft.program.level)
    ) {
      const { level, school, major } = draft.program;
      this.setData({
        level,
        school: "其它",
        schools: this.schoolsForLevel(level),
        customSchool: school || "",
        customMajor: major || "",
        consent: draft.consent === true,
      });
      this.updateCustomProgram();
      return;
    }
    const program =
      draft.program &&
      this.data.programs.find((item) => item.id === draft.program.id);
    if (!program) return;
    const schools = this.schoolsForLevel(program.level);
    const majors = this.data.programs.filter(
      (item) => item.school === program.school && item.level === program.level,
    );
    this.setData({
      school: program.school,
      level: program.level,
      program,
      schools,
      majors,
      consent: draft.consent === true,
    });
  },

  schoolsForLevel(level) {
    return [
      ...this.unique(
        this.data.programs
          .filter((item) => item.level === level)
          .map((item) => item.school),
      ),
      "其它",
    ];
  },

  updateCustomProgram() {
    const { level, customSchool, customMajor } = this.data;
    const rule = this.data.programs.find((item) => item.level === level);
    if (!rule) return;
    this.setData(
      {
        program: {
          id: "other",
          level,
          school: customSchool.trim(),
          major: customMajor.trim(),
          duration: rule.duration,
          fee: rule.fee,
          studyMode: "非脱产",
          examCategory: "—",
        },
      },
      () => this.saveDraft(),
    );
  },

  inputCustomSchool(e) {
    this.setData({ customSchool: e.detail.value, error: "" });
    this.updateCustomProgram();
  },

  inputCustomMajor(e) {
    this.setData({ customMajor: e.detail.value, error: "" });
    this.updateCustomProgram();
  },

  saveDraft() {
    if (!this.data.programs.length) return;
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    wx.setStorageSync(DRAFT_KEY, {
      ...draft,
      program: this.data.program,
      consent: this.data.consent,
      campus: draft.referralId || draft.editing ? draft.campus : "",
      teacherId: draft.referralId || draft.editing ? draft.teacherId : "",
      teacherName: draft.referralId || draft.editing ? draft.teacherName : "",
    });
  },

  chooseCampus(e) {
    this.setData(
      { campus: this.data.campuses[Number(e.detail.value)], error: "" },
      () => this.saveDraft(),
    );
  },

  chooseTeacher(e) {
    const teacher = this.data.teachers[Number(e.detail.value)];
    if (teacher)
      this.setData(
        { teacherId: teacher.id, teacherLabel: teacher.label, error: "" },
        () => this.saveDraft(),
      );
  },

  chooseSchool(e) {
    if (this.data.loading) return;
    if (!this.data.level) return;
    const school = this.data.schools[Number(e.detail.value)];
    if (!school) return;
    const majors = this.data.programs.filter(
      (item) => item.school === school && item.level === this.data.level,
    );
    this.setData(
      {
        school,
        majors,
        customSchool: "",
        customMajor: "",
        program: null,
        error: "",
        loading: false,
      },
      () => {
        if (school === "其它") this.updateCustomProgram();
        else this.saveDraft();
      },
    );
  },

  chooseLevel(e) {
    if (this.data.loading) return;
    const level = this.data.levels[Number(e.detail.value)];
    if (!level) return;
    const schools = this.schoolsForLevel(level);
    this.setData(
      {
        level,
        schools,
        school: "",
        customSchool: "",
        customMajor: "",
        majors: [],
        program: null,
        error: "",
      },
      () => this.saveDraft(),
    );
  },

  chooseMajor(e) {
    if (this.data.loading) return;
    this.setData(
      { program: this.data.majors[Number(e.detail.value)], error: "" },
      () => this.saveDraft(),
    );
  },

  consentChange(e) {
    this.setData({ consent: e.detail.value.includes("agree"), error: "" }, () =>
      this.saveDraft(),
    );
  },

  openAgreement(e) {
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${e.currentTarget.dataset.type}`,
    });
  },

  submit() {
    if (this.data.loading) return;
    if (!this.data.programs.length) {
      this.setData({ error: "招生专业列表暂时不可用，请重试加载。" });
      return;
    }
    if (
      this.data.school === "其它" &&
      (!this.data.customSchool.trim() || !this.data.customMajor.trim())
    ) {
      this.setData({ error: "请填写学校名称和专业名称。" });
      return;
    }
    if (!this.data.program) {
      this.setData({ error: "请依次选择报考层次、学校和专业。" });
      return;
    }
    if (!this.data.consent) {
      this.setData({ error: "请先阅读报名、调剂和隐私说明，并勾选同意。" });
      return;
    }
    // 扫码归属保存在草稿中，由服务端在提交时核验。
    this.setData({ campus: "", teacherId: "", teacherLabel: "", error: "" });
    this.saveDraft();
    wx.navigateTo({ url: "/pages/confirm/confirm" });
  },
});
