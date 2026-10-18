const { DatabaseSync } = require('node:sqlite');
const { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } = require('node:crypto');
class SQLiteRepository {
  constructor(filename, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid encryption key');
    this.key = key;
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) { this.db.close(); throw new Error('数据库版本高于当前程序，请勿降级启动'); }
    try {
      this.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS registrations (
          id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, private_payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, consent_version TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS students (
          id TEXT PRIMARY KEY, student_no TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS wechat_identities (
          app_id TEXT NOT NULL, identity_hash TEXT NOT NULL,
          student_id TEXT NOT NULL UNIQUE REFERENCES students(id), PRIMARY KEY(app_id, identity_hash)
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), event TEXT NOT NULL,
          registration_id TEXT REFERENCES registrations(id), created_at TEXT NOT NULL
        );`);
        const columns = this.db.prepare('PRAGMA table_info(registrations)').all().map(c=>c.name);
        if (!columns.includes('student_id')) this.db.exec('ALTER TABLE registrations ADD COLUMN student_id TEXT REFERENCES students(id)');
        if (!columns.includes('revision')) this.db.exec('ALTER TABLE registrations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
        if (!columns.includes('updated_at')) this.db.exec('ALTER TABLE registrations ADD COLUMN updated_at TEXT');
        this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS registration_owner ON registrations(student_id); PRAGMA user_version=2;');
      });
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  encrypt(data) {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const payload = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'),cipher.final()]);
    return [nonce,cipher.getAuthTag(),payload].map(x=>x.toString('base64')).join('.');
  }
  decrypt(payload) {
    const [nonce,tag,ciphertext] = payload.split('.').map(x=>Buffer.from(x,'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
  }
  async loginWithWechat({appId,openId,tokenHash,expiresAt,createdAt}) {
    const identityHash = createHmac('sha256',this.key).update(JSON.stringify(['wechat',appId,openId])).digest('hex');
    return this.transaction(()=>{
      let student = this.db.prepare(`SELECT s.id, s.student_no AS studentNo, s.created_at AS createdAt
        FROM students s JOIN wechat_identities w ON w.student_id=s.id WHERE w.app_id=? AND w.identity_hash=?`).get(appId,identityHash);
      if (!student) {
        student = {id:randomUUID(),studentNo:'S'+randomBytes(8).toString('hex').toUpperCase(),createdAt};
        this.db.prepare('INSERT INTO students VALUES(?,?,?)').run(student.id,student.studentNo,createdAt);
        this.db.prepare('INSERT INTO wechat_identities VALUES(?,?,?)').run(appId,identityHash,student.id);
        this.audit(student.id,'account_created',null,createdAt);
      }
      this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(createdAt);
      this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(tokenHash,student.id,expiresAt,createdAt);
      return student;
    });
  }
  async findSession(hash,now) {
    return this.db.prepare(`SELECT s.id, s.student_no AS studentNo, s.created_at AS createdAt
      FROM sessions t JOIN students s ON s.id=t.student_id WHERE t.token_hash=? AND t.expires_at>?`).get(hash,now) || null;
  }
  async revokeSession(hash) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash); }
  readRegistration(studentId) {
    const row = this.db.prepare('SELECT * FROM registrations WHERE student_id=?').get(studentId);
    if (!row) return null;
    const data = this.decrypt(row.private_payload);
    return {id:row.id,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,revision:row.revision,
      name:data.name,phone:data.phone,school:data.school || '',programId:data.programId || '',level:data.level,
      major:data.major,duration:data.duration || '',studyMode:data.studyMode || '',fee:data.fee || 0};
  }
  async findRegistrationByStudent(studentId) { return this.readRegistration(studentId); }
  async createForStudent(data) {
    return this.transaction(()=>{
      const existing = this.readRegistration(data.studentId);
      if (existing) return existing; // One current registration per student, retry-safe.
      const id = randomUUID();
      const payload = this.encrypt({name:data.name,phone:data.phone,school:data.school,programId:data.id,
        level:data.level,major:data.major,duration:data.duration,studyMode:data.studyMode,fee:data.fee});
      this.db.prepare(`INSERT INTO registrations(id,token_hash,private_payload,created_at,consent_version,student_id)
        VALUES(?,?,?,?,?,?)`).run(id,randomBytes(32).toString('hex'),payload,data.createdAt,data.consentVersion,data.studentId);
      this.audit(data.studentId,'registration_created',id,data.createdAt);
      return this.readRegistration(data.studentId);
    });
  }
  async updateForStudent(studentId,data,revision,updatedAt) {
    return this.transaction(()=>{
      const current = this.readRegistration(studentId);
      if (!current || current.revision!==revision) return null;
      const payload = this.encrypt({name:current.name,phone:data.phone,school:data.school,programId:data.id,
        level:data.level,major:data.major,duration:data.duration,studyMode:data.studyMode,fee:data.fee});
      this.db.prepare(`UPDATE registrations SET private_payload=?,status='pending',revision=revision+1,updated_at=?
        WHERE student_id=? AND revision=?`).run(payload,updatedAt,studentId,revision);
      this.audit(studentId,'registration_updated_pending',current.id,updatedAt);
      return this.readRegistration(studentId);
    });
  }
  async findLegacyStatus(hash) {
    return this.db.prepare(`SELECT id,status,created_at AS createdAt FROM registrations WHERE token_hash=? AND student_id IS NULL`).get(hash) || null;
  }
  audit(studentId,event,registrationId,createdAt) {
    this.db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?)').run(randomUUID(),studentId,event,registrationId,createdAt);
  }
  close() { this.db.close(); }
}
module.exports = { SQLiteRepository };
