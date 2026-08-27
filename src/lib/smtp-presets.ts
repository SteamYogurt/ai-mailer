export const smtpPresets = {
  gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    hint: "不要填登录密码。先开两步验证，再生成 16 位「应用专用密码」。Gmail 每天大约只能发 100–500 封，内容太像群发会被进垃圾箱。",
  },
  qq: {
    label: "QQ 邮箱",
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    hint: "用户名填完整 QQ 邮箱。密码填授权码，不是 QQ 登录密码。发送服务器 smtp.qq.com，SSL 端口 465（也可改 587 并取消勾选 SMTPS）。收信用的 IMAP 不用填。",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    hint: "用户名是完整邮箱。部分账号需要管理员打开 SMTP AUTH。",
  },
  "163": {
    label: "163 邮箱",
    host: "smtp.163.com",
    port: 465,
    secure: true,
    hint: "在网易邮箱设置里开启 SMTP，使用客户端授权码。",
  },
  custom: {
    label: "其他 SMTP（企业邮 / Resend / SES）",
    host: "",
    port: 587,
    secure: false,
    hint: "向你的邮箱服务商要 SMTP 主机、端口、账号。Resend、Amazon SES 更适合稍大批量，但仍应一封一封个性化。",
  },
} as const;

export type SmtpPresetId = keyof typeof smtpPresets;
