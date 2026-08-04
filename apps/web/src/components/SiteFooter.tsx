import { Link } from "react-router-dom";

const PUBLIC_SECURITY_RECORD_URL = "https://beian.mps.gov.cn/#/query/webSearch?code=44011302005743";
const ICP_RECORD_URL = "https://beian.miit.gov.cn/";

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="网站备案与合规信息">
      <div className="site-footer__brand">
        <strong>SEKAI TOOLS</strong>
        <span>非官方 Project SEKAI 数据与工具服务</span>
      </div>
      <nav className="site-footer__links" aria-label="法律与安全链接">
        <Link to="/privacy">隐私政策</Link>
        <Link to="/terms">用户协议</Link>
        <Link to="/security">安全与举报</Link>
      </nav>
      <div className="site-footer__records">
        <a href={PUBLIC_SECURITY_RECORD_URL} target="_blank" rel="noreferrer">
          <img src="/assets/gongan-beian-icon.jpg" width="20" height="20" alt="公安备案图标" />
          粤公网安备44011302005743号
        </a>
        <a href={ICP_RECORD_URL} target="_blank" rel="noreferrer">粤ICP备2026103933号</a>
      </div>
    </footer>
  );
}
