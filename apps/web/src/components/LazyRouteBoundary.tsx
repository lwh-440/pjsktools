import { RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label: string };
type State = { error: Error | null };

export class LazyRouteBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Failed to load ${this.props.label}`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="lazy-route-error">
      <h2>{this.props.label}加载失败</h2>
      <p>页面模块可能已更新，请刷新后重试。已经加载的目录数据不会受到影响。</p>
      <button type="button" onClick={() => window.location.reload()}><RefreshCw size={16} />刷新页面</button>
      <details><summary>错误信息</summary><code>{this.state.error.message}</code></details>
    </section>;
  }
}
