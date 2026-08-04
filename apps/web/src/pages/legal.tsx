import { Link } from "react-router-dom";

const POLICY_EFFECTIVE_DATE = "2026 年 8 月 4 日";

function LegalPageHeader({ title, summary }: { title: string; summary: string }) {
  return (
    <header className="legal-page__header">
      <span className="legal-page__eyebrow">SEKAI TOOLS 合规中心</span>
      <h2>{title}</h2>
      <p>{summary}</p>
      <small>生效日期：{POLICY_EFFECTIVE_DATE}</small>
    </header>
  );
}

function LegalContactCard() {
  return (
    <aside className="legal-contact-card" aria-label="隐私与安全联系渠道">
      <strong>需要帮助？</strong>
      <span>隐私及个人信息事项：<a href="mailto:privacy@sekai-tools.cn">privacy@sekai-tools.cn</a></span>
      <span>安全漏洞、违法信息及其他举报：<a href="mailto:security@sekai-tools.cn">security@sekai-tools.cn</a></span>
      <Link to="/security">查看安全与举报流程</Link>
    </aside>
  );
}

export function PrivacyPage() {
  return (
    <article className="legal-page">
      <LegalPageHeader
        title="隐私政策"
        summary="我们以必要、透明和安全为原则处理你的个人信息，并提供查询、导出、更正、解除关联与注销途径。"
      />

      <section>
        <h3>1. 运营者与适用范围</h3>
        <p>本政策适用于 SEKAI TOOLS 网站及 Android 客户端。个人信息处理者对外称为“SEKAI TOOLS（sekai-tools.cn 网站运营者）”。本项目是非官方工具，与 SEGA、Colorful Palette、Crypton Future Media 及游戏发行方不存在隶属或授权关系。</p>
      </section>

      <section>
        <h3>2. 我们处理的信息</h3>
        <div className="legal-table" role="table" aria-label="个人信息处理清单">
          <div className="legal-table__head" role="row"><strong>信息类型</strong><strong>用途</strong><strong>保存期限</strong></div>
          <div role="row"><span>邮箱及验证码状态</span><span>注册、登录、身份验证和安全通知</span><span>账号存续期间；验证码过期后 24 小时内清理</span></div>
          <div role="row"><span>QQ 账号唯一标识（OpenID）及公开昵称、头像</span><span>在你主动授权后识别登录账号，并展示昵称和头像；不长期保存 QQ OAuth 令牌</span><span>解除 QQ 关联、账号注销或不再需要时删除</span></div>
          <div role="row"><span>玩家 UID、公开昵称与签名、玩家快照</span><span>绑定账号、展示资料、分析进度及跨端同步</span><span>账号存续期间，或由你主动删除相关绑定和快照</span></div>
          <div role="row"><span>收藏、成绩与卡组</span><span>提供个人工具与跨端同步</span><span>账号存续期间，账号注销时删除</span></div>
          <div role="row"><span>设备、本地缓存与偏好</span><span>保持登录、改善加载速度和记住界面设置</span><span>由你在客户端清除；不再需要时删除</span></div>
          <div role="row"><span>网络与安全日志</span><span>排查故障、防止攻击、履行网络安全义务</span><span>200 天</span></div>
        </div>
        <p>玩家公开昵称与签名来自游戏内公开资料。项目不收集聊天内容，也不为了年龄确认收集生日或身份证件；使用账号服务时，你需要主动确认已满 14 周岁。</p>
      </section>

      <section>
        <h3>3. 存储地点与备份</h3>
        <p>生产个人数据保存在中国大陆上海的服务器及上海 COS。数据库备份仅用于灾难恢复，最长保存 92 天。发生备份恢复时，我们会重新执行注销记录，避免已删除账号因旧备份恢复。</p>
      </section>

      <section>
        <h3>4. 第三方服务</h3>
        <ul>
          <li>QQ 互联：在你选择 QQ 登录或重新验证时临时处理 OAuth 授权令牌，取得账号唯一标识（OpenID）及公开头像、昵称；OAuth 令牌使用后不长期保存。</li>
          <li>腾讯云：提供上海服务器、对象存储、域名解析和网络基础设施。</li>
          <li>邮件服务商：发送注册验证码、安全通知并接收隐私和举报邮件。</li>
          <li>游戏数据与资产来源：用于展示公开游戏资料，不向其发送你的 SEKAI TOOLS 账号密码。</li>
        </ul>
        <p>Haruki 相关能力当前不对用户开放。只有未来正式开放、说明具体用途且你主动授权后，才会处理相应绑定和游戏数据。</p>
      </section>

      <section>
        <h3>5. 日志与安全</h3>
        <p>访问日志不记录 Cookie、Authorization、请求体或响应体，并尽量移除查询参数，避免验证码、OAuth code、令牌、邮箱或玩家 UID 进入日志。安全事件使用不可逆用户标识。日志在服务器和私有 COS 各保存一份，保存 200 天并通过校验清单检查完整性。</p>
      </section>

      <section>
        <h3>6. 你的权利</h3>
        <p>登录后可查询和更正账号资料、导出个人数据 JSON、解除 QQ 关联、清除 Android 本地缓存并注销账号。注销需要二次确认和重新验证；完成后将删除账号、会话、绑定、收藏、成绩、卡组和玩家快照。法律法规另有保存要求的内容会被隔离，仅在规定期限内保存。</p>
        <p>你也可以通过 <a href="mailto:privacy@sekai-tools.cn">privacy@sekai-tools.cn</a> 提出访问、更正、删除、撤回授权或投诉请求。我们会核验请求人身份，并在法律规定的期限内处理。</p>
      </section>

      <section>
        <h3>7. 政策更新</h3>
        <p>发生处理目的、信息类型、保存期限或第三方服务的重要变化时，我们会更新版本并醒目提示；需要重新同意的，将在继续使用账号功能前取得你的确认。</p>
      </section>

      <LegalContactCard />
    </article>
  );
}

export function TermsPage() {
  return (
    <article className="legal-page">
      <LegalPageHeader
        title="用户协议"
        summary="本协议说明 SEKAI TOOLS 的服务范围、使用规则、账号责任和风险边界。"
      />

      <section>
        <h3>1. 接受协议与年龄要求</h3>
        <p>注册、首次 QQ 登录或继续使用账号服务前，你需要主动同意本协议和隐私政策，并确认已满 14 周岁。未满 14 周岁的用户不得注册或使用账号服务。</p>
      </section>

      <section>
        <h3>2. 服务说明</h3>
        <p>SEKAI TOOLS 提供 Project SEKAI 公开数据浏览、活动排名参考、计算工具及个人数据管理功能。我们会尽力保持服务稳定和数据准确，但第三方数据源、网络状态、游戏更新或维护可能造成延迟、缺失或误差；涉及游戏决策时请以游戏内实际信息为准。</p>
      </section>

      <section>
        <h3>3. 非官方项目与知识产权</h3>
        <p>本项目与 SEGA、Colorful Palette、Crypton Future Media 及游戏发行方无隶属、代理或授权关系。游戏名称、角色、图片、音乐及其他素材的权利归原权利人所有；本站仅在工具说明和数据展示所需范围内使用。</p>
      </section>

      <section>
        <h3>4. 账号与安全</h3>
        <p>你应妥善保护邮箱、QQ 账号、验证码和设备，不得转让、出租账号或协助他人绕过安全措施。发现异常登录或账号被盗时，请立即修改相关第三方账号凭据并联系 <a href="mailto:security@sekai-tools.cn">security@sekai-tools.cn</a>。</p>
      </section>

      <section>
        <h3>5. 禁止行为</h3>
        <ul>
          <li>利用服务从事违法违规、侵害他人权益或破坏网络安全的活动。</li>
          <li>尝试获取他人账号、会话、非公开数据或绕过访问控制。</li>
          <li>对服务实施恶意扫描、攻击、自动化滥用或造成异常资源消耗。</li>
          <li>冒充官方、伪造数据来源，或利用本站内容误导、欺骗他人。</li>
        </ul>
        <p>玩家昵称和签名由游戏内机制管理。本站不建设关键词过滤或自动内容审核系统；收到人工举报后会核查，必要时紧急停止相关公开资料展示并保留处置记录。</p>
      </section>

      <section>
        <h3>6. 服务调整与责任边界</h3>
        <p>为安全、维护、合规或第三方接口变化，我们可能暂停或调整部分功能，并尽可能提前说明。因不可抗力、第三方服务中断或用户自身设备和账号安全问题造成的影响，将在法律允许范围内按各方责任承担。</p>
      </section>

      <section>
        <h3>7. 终止与注销</h3>
        <p>你可以随时通过账号管理注销账号。违反本协议或危及服务和他人安全时，我们可限制或停止相关功能，并提供申诉渠道。账号终止后的个人信息按照隐私政策处理。</p>
      </section>

      <section>
        <h3>8. 联系我们</h3>
        <p>对协议有疑问，可联系 <a href="mailto:privacy@sekai-tools.cn">privacy@sekai-tools.cn</a>；安全或违法信息问题请使用 <Link to="/security">安全与举报</Link>渠道。</p>
      </section>

      <LegalContactCard />
    </article>
  );
}

export function SecurityPage() {
  return (
    <article className="legal-page">
      <LegalPageHeader
        title="安全与举报"
        summary="统一接收安全漏洞、违法信息和隐私投诉；紧急风险会优先止损、核查并记录处置过程。"
      />

      <section className="security-channel-grid">
        <a className="security-channel-card" href="mailto:security@sekai-tools.cn?subject=SEKAI%20TOOLS%20安全漏洞报告">
          <strong>安全漏洞</strong>
          <span>账号、接口、服务器、数据泄露或其他技术风险</span>
          <small>security@sekai-tools.cn</small>
        </a>
        <a className="security-channel-card" href="mailto:security@sekai-tools.cn?subject=SEKAI%20TOOLS%20违法信息举报">
          <strong>违法信息举报</strong>
          <span>公开页面中涉嫌违法、侵权或需要紧急停止展示的内容</span>
          <small>security@sekai-tools.cn</small>
        </a>
        <a className="security-channel-card" href="mailto:privacy@sekai-tools.cn?subject=SEKAI%20TOOLS%20隐私投诉">
          <strong>隐私投诉</strong>
          <span>个人信息查询、更正、删除、撤回授权或账号注销问题</span>
          <small>privacy@sekai-tools.cn</small>
        </a>
      </section>

      <section>
        <h3>报告时请提供</h3>
        <ul>
          <li>问题类型、发现时间、受影响页面或接口，以及可安全复现的步骤。</li>
          <li>影响范围和紧急程度；如涉及个人信息，请只提供核查必需的最少内容。</li>
          <li>可接收回复的联系方式。请勿在邮件中发送密码、验证码、OAuth 令牌、私钥或大规模真实用户数据。</li>
        </ul>
      </section>

      <section>
        <h3>处理时限与流程</h3>
        <ol className="security-process">
          <li><strong>接收与分级</strong><span>高危安全事件力争在 24 小时内确认收到；一般举报和隐私投诉在 3 个工作日内确认。</span></li>
          <li><strong>紧急止损</strong><span>可能造成持续侵害、数据泄露或违法传播时，优先限制访问、停止相关资料展示并保存必要证据。</span></li>
          <li><strong>核查与修复</strong><span>结合访问和安全日志核查原因，修复漏洞或纠正信息，并记录决定、操作人和时间。</span></li>
          <li><strong>反馈与复盘</strong><span>一般事项力争在 7 个工作日内提供处理进展；复杂事项会说明原因和预计时间。安全事件结束后完成复盘和改进。</span></li>
        </ol>
      </section>

      <section>
        <h3>负责任披露</h3>
        <p>请在获得修复确认前避免公开未修复漏洞，不要利用漏洞访问、修改或删除超出验证所需的数据，也不要影响其他用户或服务可用性。对善意、克制且遵循本说明的安全研究，我们会认真核查并保持沟通。</p>
      </section>

      <section>
        <h3>内容处置说明</h3>
        <p>玩家昵称和签名来自游戏内公开资料，游戏内已有相应审核机制。本站不另设关键词过滤、自动内容审核或审核后台；我们保留人工举报、核查、紧急停止展示和处置记录流程，并依法配合主管机关处理。</p>
      </section>

      <LegalContactCard />
    </article>
  );
}
